#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { runBriefGeneration } from "./memory-brief.mjs";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { resolveMemoryPaths } from "./runtime-state.mjs";

export const MEMORY_TYPES = [
  "decision",
  "observation",
  "root_cause",
  "vocabulary",
  "incident",
  "repo_state",
  "external_research"
];

export const LIFECYCLE_STATES = [
  "active",
  "needs_review",
  "superseded",
  "archived",
  "ephemeral"
];

export const SCOPES = ["repo", "project", "domain", "user", "global"];

function normalizeList(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "memory";
}

function datePart(value) {
  return String(value).slice(0, 10);
}

function uniqueId({ id, type, claim, createdAt, existingClaims }) {
  const existingIds = new Set(existingClaims.map((entry) => entry.id).filter(Boolean));
  if (id) {
    if (existingIds.has(id)) throw new Error(`memory id already exists: ${id}`);
    return id;
  }

  const base = `${datePart(createdAt)}-${type}-${slugify(claim)}`;
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function assertAllowed(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
}

export function normalizeMemoryClaim(input, {
  existingClaims = [],
  now = new Date()
} = {}) {
  const createdAt = input.created_at ?? now.toISOString();
  const type = input.type;
  const lifecycleState = input.lifecycle_state ?? "active";
  const scope = input.scope ?? "repo";
  const sourcePaths = normalizeList(input.source_paths ?? input.source_path);
  const sourceSymbols = normalizeList(input.source_symbols ?? input.source_symbol);
  const evidenceIds = normalizeList(input.evidence_ids ?? input.evidence_id);
  const supersedes = normalizeList(input.supersedes);
  const supersededBy = normalizeList(input.superseded_by);
  const evidencePath = input.evidence_path ? String(input.evidence_path).trim() : "";
  const confidence = input.confidence ? String(input.confidence).trim() : "";
  const reviewCaveat = input.review_caveat ? String(input.review_caveat).trim() : "";

  if (!type) throw new Error("type is required");
  assertAllowed("type", type, MEMORY_TYPES);

  if (!input.claim || !String(input.claim).trim()) {
    throw new Error("claim is required");
  }
  assertAllowed("lifecycle_state", lifecycleState, LIFECYCLE_STATES);
  assertAllowed("scope", scope, SCOPES);

  if (!evidencePath && sourcePaths.length === 0 && evidenceIds.length === 0) {
    throw new Error("evidence_path, evidence_id, or at least one source_path is required");
  }
  if (!confidence && !reviewCaveat) {
    throw new Error("confidence or review_caveat is required");
  }

  const claim = {
    id: uniqueId({
      id: input.id,
      type,
      claim: input.claim,
      createdAt,
      existingClaims
    }),
    type,
    claim: String(input.claim).trim(),
    scope,
    lifecycle_state: lifecycleState,
    created_at: createdAt,
    last_confirmed_at: input.last_confirmed_at ?? createdAt
  };

  if (confidence) claim.confidence = confidence;
  if (reviewCaveat) claim.review_caveat = reviewCaveat;
  if (evidencePath) claim.evidence_path = evidencePath;
  if (evidenceIds.length > 0) claim.evidence_ids = evidenceIds;
  if (sourcePaths.length > 0) claim.source_paths = sourcePaths;
  if (sourceSymbols.length > 0) claim.source_symbols = sourceSymbols;
  if (supersedes.length > 0) claim.supersedes = supersedes;
  if (supersededBy.length > 0) claim.superseded_by = supersededBy;

  return claim;
}

export function appendMemoryClaim({
  cwd = process.cwd(),
  memoryFile = null,
  briefFile = null,
  input,
  now = new Date(),
  updateBrief = true
} = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("input memory claim is required");
  }

  const defaults = resolveMemoryPaths({ cwd });
  const resolvedMemoryFile = memoryFile ?? defaults.memoryFile;
  const resolvedBriefFile = briefFile ?? (
    memoryFile ? path.join(path.dirname(resolvedMemoryFile), "brief.md") : defaults.briefFile
  );
  return withFileLock(resolvedMemoryFile, (lockState) => {
    const existingClaims = readJsonl(resolvedMemoryFile);
    const claim = normalizeMemoryClaim(input, { existingClaims, now });
    const nextClaims = [...existingClaims, claim];
    writeJsonlAtomic(resolvedMemoryFile, nextClaims);

    // The claim is already on disk by this point. If runBriefGeneration throws
    // (permissions, disk full, brief target is a directory), we must NOT lose
    // the fact that the write succeeded — otherwise the caller treats the
    // whole operation as a failure and a retry hits uniqueId-collision
    // ("memory id already exists"), trapping the user. Capture the brief
    // error and surface it as a non-fatal field on the success record.
    let brief = null;
    let briefError = null;
    if (updateBrief) {
      try {
        brief = runBriefGeneration({ cwd, memoryFile: resolvedMemoryFile, outputFile: resolvedBriefFile });
      } catch (err) {
        briefError = err.message;
      }
    }

    return {
      memory_file: resolvedMemoryFile,
      brief_file: updateBrief ? resolvedBriefFile : null,
      id: claim.id,
      type: claim.type,
      lifecycle_state: claim.lifecycle_state,
      written: true,
      brief_updated: Boolean(brief),
      brief_error: briefError,
      lock: visibleLockState(lockState)
    };
  });
}

function readJsonArg(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pushListOption(options, key, value) {
  options[key] = [...(options[key] ?? []), value];
}

function parseArgs(argv) {
  const options = {
    input: {},
    updateBrief: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.input = { ...options.input, ...readJsonArg(argv[++index]) };
      continue;
    }
    if (token === "--memory-file") {
      options.memoryFile = argv[++index];
      continue;
    }
    if (token === "--brief-output") {
      options.briefFile = argv[++index];
      continue;
    }
    if (token === "--no-brief") {
      options.updateBrief = false;
      continue;
    }
    if (token === "--id") {
      options.input.id = argv[++index];
      continue;
    }
    if (token === "--type") {
      options.input.type = argv[++index];
      continue;
    }
    if (token === "--claim") {
      options.input.claim = argv[++index];
      continue;
    }
    if (token === "--scope") {
      options.input.scope = argv[++index];
      continue;
    }
    if (token === "--lifecycle-state") {
      options.input.lifecycle_state = argv[++index];
      continue;
    }
    if (token === "--created-at") {
      options.input.created_at = argv[++index];
      continue;
    }
    if (token === "--last-confirmed-at") {
      options.input.last_confirmed_at = argv[++index];
      continue;
    }
    if (token === "--confidence") {
      options.input.confidence = argv[++index];
      continue;
    }
    if (token === "--review-caveat") {
      options.input.review_caveat = argv[++index];
      continue;
    }
    if (token === "--evidence-path") {
      options.input.evidence_path = argv[++index];
      continue;
    }
    if (token === "--evidence-id") {
      pushListOption(options.input, "evidence_ids", argv[++index]);
      continue;
    }
    if (token === "--source-path") {
      pushListOption(options.input, "source_paths", argv[++index]);
      continue;
    }
    if (token === "--source-symbol") {
      pushListOption(options.input, "source_symbols", argv[++index]);
      continue;
    }
    if (token === "--supersedes") {
      pushListOption(options.input, "supersedes", argv[++index]);
      continue;
    }
    if (token === "--superseded-by") {
      pushListOption(options.input, "superseded_by", argv[++index]);
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write([
      "Usage: node scripts/memory-write.mjs --type TYPE --claim TEXT --evidence-path PATH --confidence LEVEL [options]",
      "",
      "Required for durable writes: --type, --claim, --scope, evidence/source path, and --confidence or --review-caveat.",
      "Use --json FILE for richer inputs. The generated brief is updated unless --no-brief is passed.",
      ""
    ].join("\n"));
    return;
  }
  const result = appendMemoryClaim({ cwd: process.cwd(), ...options });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
