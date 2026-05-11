#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { assertNoSecretLikeText } from "./lib/redaction.mjs";
import { resolveGlobalSourcePaths } from "./runtime-state.mjs";

export const SOURCE_REDACTION_STATUSES = ["no_secrets_observed", "redacted", "secret_reference_only"];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function normalizeList(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function assertAllowed(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "source-pack";
}

function hashId(id) {
  return crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 12);
}

function sourcePackRelativeFile(id) {
  return path.join("packs", `${slugify(id)}-${hashId(id)}.jsonl`);
}

function resolveSourcePackStore({
  cwd = process.cwd(),
  sourceRoot = null,
  sourceIndexFile = null
} = {}) {
  const defaults = resolveGlobalSourcePaths({ cwd });
  const resolvedSourceRoot = sourceRoot
    ? path.resolve(sourceRoot)
    : sourceIndexFile
      ? path.dirname(path.resolve(sourceIndexFile))
      : defaults.sourceRoot;
  return {
    sourceRoot: resolvedSourceRoot,
    sourceIndexFile: sourceIndexFile
      ? path.resolve(sourceIndexFile)
      : path.join(resolvedSourceRoot, "index.jsonl")
  };
}

function sourcePackFileFromEntry(sourceRoot, entry) {
  const stored = entry.source_pack_file;
  if (!stored) return path.join(sourceRoot, sourcePackRelativeFile(entry.id));
  return path.isAbsolute(stored) ? stored : path.join(sourceRoot, stored);
}

function packMetadata(pack, {
  existing = null,
  sourcePackFile,
  sourceRoot,
  chunks,
  now
}) {
  const relativePackFile = path.relative(sourceRoot, sourcePackFile);
  const metadata = {
    id: pack.id,
    source_id: pack.source_id,
    created_at: existing?.created_at ?? pack.created_at,
    updated_at: now.toISOString(),
    source_pack_file: relativePackFile,
    chunk_count: chunks.length,
    content_hashes: chunks.map((chunk) => chunk.content_hash).sort()
  };

  if (pack.topic) metadata.topic = pack.topic;
  if (pack.stale_after_days != null) metadata.stale_after_days = pack.stale_after_days;
  if (pack.related_ids?.length > 0) metadata.related_ids = pack.related_ids;
  if (pack.migration_id) metadata.migration_id = pack.migration_id;
  if (pack.migration_source_path) metadata.migration_source_path = pack.migration_source_path;
  if (pack.migration_content_hash) metadata.migration_content_hash = pack.migration_content_hash;
  return metadata;
}

export function hashSourceChunk({
  text,
  source_pointer,
  redaction_status = "no_secrets_observed"
}) {
  return crypto.createHash("sha256")
    .update(stableStringify({
      redaction_status,
      source_pointer: stableValue(source_pointer),
      text: String(text ?? "")
    }))
    .digest("hex");
}

function normalizeChunk(input, {
  now
}) {
  if (!input || typeof input !== "object") throw new Error("source chunk is required");
  const text = String(input.text ?? "");
  const summary = String(input.summary ?? "").trim();
  const sourcePointer = input.source_pointer ?? input.sourcePointer;
  const redactionStatus = String(input.redaction_status ?? input.redactionStatus ?? "no_secrets_observed").trim();
  const observedAt = input.observed_at ?? input.observedAt ?? now.toISOString();

  if (!text.trim()) throw new Error("source chunk text is required");
  if (!sourcePointer) throw new Error("source_pointer is required");
  assertAllowed("redaction_status", redactionStatus, SOURCE_REDACTION_STATUSES);

  assertNoSecretLikeText([
    input.id,
    text,
    summary,
    stableStringify(sourcePointer)
  ], "source pack contains secret-like content; redact it before writing");

  const contentHash = hashSourceChunk({
    text,
    source_pointer: sourcePointer,
    redaction_status: redactionStatus
  });

  return {
    id: input.id ? String(input.id).trim() : `chunk-${contentHash.slice(0, 12)}`,
    text,
    source_pointer: stableValue(sourcePointer),
    summary,
    observed_at: observedAt,
    redaction_status: redactionStatus,
    content_hash: contentHash
  };
}

export function normalizeSourcePack(input, {
  now = new Date()
} = {}) {
  if (!input || typeof input !== "object") throw new Error("source pack is required");
  const sourceId = String(input.source_id ?? input.sourceId ?? "").trim();
  const topic = input.topic ? String(input.topic).trim() : "";
  const staleAfterDays = input.stale_after_days ?? input.staleAfterDays ?? null;
  const relatedIds = normalizeList(input.related_ids ?? input.related_id ?? input.relatedId);
  const migrationId = input.migration_id ? String(input.migration_id).trim() : "";
  const migrationSourcePath = input.migration_source_path ? String(input.migration_source_path).trim() : "";
  const migrationContentHash = input.migration_content_hash ? String(input.migration_content_hash).trim() : "";
  const chunks = Array.isArray(input.chunks) ? input.chunks : [];

  if (!sourceId) throw new Error("source_id is required");
  if (chunks.length === 0) throw new Error("at least one source chunk is required");

  assertNoSecretLikeText([
    input.id,
    sourceId,
    topic,
    ...relatedIds,
    migrationId,
    migrationSourcePath,
    migrationContentHash
  ], "source pack contains secret-like content; redact it before writing");

  const pack = {
    id: input.id ? String(input.id).trim() : sourceId,
    source_id: sourceId,
    created_at: input.created_at ?? now.toISOString(),
    chunks: chunks.map((chunk) => normalizeChunk(chunk, { now }))
  };

  if (topic) pack.topic = topic;
  if (staleAfterDays != null) pack.stale_after_days = Number(staleAfterDays);
  if (relatedIds.length > 0) pack.related_ids = relatedIds;
  if (migrationId) pack.migration_id = migrationId;
  if (migrationSourcePath) pack.migration_source_path = migrationSourcePath;
  if (migrationContentHash) pack.migration_content_hash = migrationContentHash;

  return pack;
}

export function ingestSourcePack({
  cwd = process.cwd(),
  sourceRoot = null,
  sourceIndexFile = null,
  input,
  now = new Date()
} = {}) {
  const pack = normalizeSourcePack(input, { now });
  const store = resolveSourcePackStore({ cwd, sourceRoot, sourceIndexFile });

  return withFileLock(store.sourceIndexFile, (lockState) => {
    const index = readJsonl(store.sourceIndexFile);
    const existingEntry = index.find((entry) => entry.id === pack.id);
    const sourcePackFile = existingEntry
      ? sourcePackFileFromEntry(store.sourceRoot, existingEntry)
      : path.join(store.sourceRoot, sourcePackRelativeFile(pack.id));
    const existingChunks = readJsonl(sourcePackFile);
    const seenHashes = new Set(existingChunks.map((chunk) => chunk.content_hash).filter(Boolean));
    const addedChunks = [];
    let duplicateChunks = 0;

    for (const chunk of pack.chunks) {
      if (seenHashes.has(chunk.content_hash)) {
        duplicateChunks += 1;
        continue;
      }
      seenHashes.add(chunk.content_hash);
      addedChunks.push(chunk);
    }

    const chunks = [...existingChunks, ...addedChunks];
    writeJsonlAtomic(sourcePackFile, chunks);

    const metadata = packMetadata(pack, {
      existing: existingEntry,
      sourcePackFile,
      sourceRoot: store.sourceRoot,
      chunks,
      now
    });
    const nextIndex = existingEntry
      ? index.map((entry) => entry.id === pack.id ? metadata : entry)
      : [...index, metadata];
    nextIndex.sort((left, right) => String(left.id).localeCompare(String(right.id)));
    writeJsonlAtomic(store.sourceIndexFile, nextIndex);

    return {
      source_root: store.sourceRoot,
      source_index_file: store.sourceIndexFile,
      source_pack_file: sourcePackFile,
      id: pack.id,
      source_id: pack.source_id,
      written: true,
      added_chunks: addedChunks.length,
      duplicate_chunks: duplicateChunks,
      chunk_count: chunks.length,
      lock: visibleLockState(lockState)
    };
  });
}

export function listSourcePacks({
  cwd = process.cwd(),
  sourceRoot = null,
  sourceIndexFile = null,
  sourceId = null,
  topic = null
} = {}) {
  const store = resolveSourcePackStore({ cwd, sourceRoot, sourceIndexFile });
  const records = readJsonl(store.sourceIndexFile)
    .filter((record) => !sourceId || record.source_id === sourceId)
    .filter((record) => !topic || record.topic === topic)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  return {
    source_root: store.sourceRoot,
    source_index_file: store.sourceIndexFile,
    source_pack_count: records.length,
    records
  };
}

export function expandSourcePack({
  cwd = process.cwd(),
  sourceRoot = null,
  sourceIndexFile = null,
  id
} = {}) {
  if (!id) throw new Error("id is required");
  const store = resolveSourcePackStore({ cwd, sourceRoot, sourceIndexFile });
  const entry = readJsonl(store.sourceIndexFile).find((record) => record.id === id);
  if (!entry) {
    return {
      found: false,
      kind: "source_pack",
      id,
      abstained: true,
      reason: "source pack not found"
    };
  }

  const sourcePackFile = sourcePackFileFromEntry(store.sourceRoot, entry);
  return {
    found: true,
    kind: "source_pack",
    file: sourcePackFile,
    index_file: store.sourceIndexFile,
    id,
    record: {
      ...entry,
      chunks: readJsonl(sourcePackFile)
    }
  };
}

function readJsonArg(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pushListOption(options, key, value) {
  options.input[key] = [...(options.input[key] ?? []), value];
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, input: {} };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.input = { ...options.input, ...readJsonArg(rest[++index]) };
      continue;
    }
    if (token === "--source-root") {
      options.sourceRoot = rest[++index];
      continue;
    }
    if (token === "--source-index-file") {
      options.sourceIndexFile = rest[++index];
      continue;
    }
    if (token === "--id") {
      options.id = rest[++index];
      options.input.id = options.id;
      continue;
    }
    if (token === "--source-id") {
      options.sourceId = rest[++index];
      options.input.source_id = options.sourceId;
      continue;
    }
    if (token === "--topic") {
      options.topic = rest[++index];
      options.input.topic = options.topic;
      continue;
    }
    if (token === "--stale-after-days") {
      options.input.stale_after_days = Number.parseInt(rest[++index], 10);
      continue;
    }
    if (token === "--related-id") {
      pushListOption(options, "related_ids", rest[++index]);
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function helpText() {
  return [
    "Usage: node scripts/source-pack.mjs <ingest|list|expand> [options]",
    "",
    "ingest requires --json FILE with source_id and chunks.",
    "expand requires --id SOURCE_PACK_ID and returns only that pack's chunks.",
    ""
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (options.command === "ingest") {
    const result = ingestSourcePack({ cwd: process.cwd(), ...options });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (options.command === "list") {
    const result = listSourcePacks({
      cwd: process.cwd(),
      sourceRoot: options.sourceRoot,
      sourceIndexFile: options.sourceIndexFile,
      sourceId: options.sourceId,
      topic: options.topic
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (options.command === "expand") {
    const result = expandSourcePack({
      cwd: process.cwd(),
      sourceRoot: options.sourceRoot,
      sourceIndexFile: options.sourceIndexFile,
      id: options.id
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown command: ${options.command}`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
