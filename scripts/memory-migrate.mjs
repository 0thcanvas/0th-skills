#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { readJsonl } from "./lib/jsonl.mjs";
import { assertNoSecretLikeText } from "./lib/redaction.mjs";
import { resolveGlobalMemoryPaths, resolveGlobalSourcePaths } from "./runtime-state.mjs";

export const MIGRATION_ACTIONS = [
  "source_pack",
  "durable_claim",
  "open_loop",
  "needs_review",
  "archive",
  "skip"
];

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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/\.md$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "memory";
}

function normalizeRelativePath(value) {
  return String(value).split(path.sep).join("/");
}

function listMarkdownFiles(root) {
  if (!fs.existsSync(root)) throw new Error(`kb root not found: ${root}`);
  const result = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        result.push(filePath);
      }
    }
  }
  walk(root);
  return result;
}

function parseScalar(value) {
  const raw = String(value ?? "").trim();
  if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
  if (/^null$/i.test(raw)) return null;
  if (/^\[(.*)\]$/.test(raw)) {
    return raw
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((item) => parseScalar(item))
      .filter((item) => item !== "");
  }
  return raw.replace(/^["']|["']$/g, "");
}

function parseFrontmatter(text) {
  const normalized = String(text).replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: {}, body: normalized };
  }
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: normalized };

  const frontmatter = {};
  const yaml = normalized.slice(4, end).trim();
  for (const line of yaml.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1].trim()] = parseScalar(match[2]);
  }

  const body = normalized.slice(end + "\n---".length).replace(/^\n/, "");
  return { frontmatter, body };
}

function textValue(value) {
  return value == null ? "" : String(value).trim();
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  return /^(true|yes|1)$/i.test(textValue(value));
}

function firstUsefulLine(body, fallback) {
  const line = String(body)
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry && !/^#/.test(entry) && !/^[-*]\s*$/.test(entry));
  return (line || fallback).replace(/^[-*]\s+/, "").replace(/^TODO:\s*/i, "").slice(0, 220);
}

function topicFromPath(relativePath, frontmatter) {
  const explicit = textValue(frontmatter.topic);
  if (explicit) return explicit;
  const [first, second] = relativePath.split("/");
  if (first === "research" || first === "tech") return second && second !== "raw" ? second : first;
  if (first === "projects") return "project";
  return first || "kb-migration";
}

function subjectKeyFromPath(relativePath, frontmatter) {
  return textValue(frontmatter.subject_key ?? frontmatter.subjectKey) || slugify(path.basename(relativePath, ".md"));
}

function isHighConfidence(frontmatter) {
  return textValue(frontmatter.confidence).toLowerCase() === "high";
}

function isCrossProject(relativePath, frontmatter, body) {
  const scope = textValue(frontmatter.scope).toLowerCase();
  if (["global", "user", "domain", "cross-project", "cross_project"].includes(scope)) return true;
  if (boolValue(frontmatter.cross_project ?? frontmatter.crossProject)) return true;
  if (/useful across projects|cross-project|global memory/i.test(body)) return true;
  return /^(tech|research|wiki)\//.test(relativePath);
}

function isArchived(relativePath, frontmatter) {
  const lifecycle = textValue(frontmatter.lifecycle ?? frontmatter.lifecycle_state).toLowerCase();
  return lifecycle === "archived" || /^archive\//.test(relativePath);
}

function isStale(relativePath, frontmatter, body) {
  const lifecycle = textValue(frontmatter.lifecycle ?? frontmatter.lifecycle_state).toLowerCase();
  return lifecycle === "stale" || boolValue(frontmatter.stale) || /(^|\/)stale[-_/]|stale note/i.test(relativePath) || /\bstale\b/i.test(body);
}

function isSpeculative(frontmatter, body) {
  const confidence = textValue(frontmatter.confidence).toLowerCase();
  return boolValue(frontmatter.speculative) || confidence === "low" && /\b(maybe|could|might|speculative)\b/i.test(body);
}

function isOpenLoop(frontmatter, body) {
  const type = textValue(frontmatter.type).toLowerCase();
  return type === "open_loop" || type === "todo" || /\bTODO\b|^- \[[ x]\]/im.test(body);
}

function hasSecretLikeText(values) {
  try {
    assertNoSecretLikeText(values, "secret-like content");
    return false;
  } catch {
    return true;
  }
}

function claimType(relativePath, frontmatter) {
  const explicit = textValue(frontmatter.type);
  if (["decision", "observation", "root_cause", "vocabulary", "incident", "repo_state", "external_research"].includes(explicit)) {
    return explicit;
  }
  if (relativePath.startsWith("docs/decisions/") || relativePath.includes("/decisions/")) return "decision";
  if (relativePath.includes("incident")) return "incident";
  return "external_research";
}

function baseCandidate({
  relativePath,
  contentHash,
  now,
  action,
  reason,
  skipReason = "",
  proposedRecord = null
}) {
  const migrationId = `mig-${contentHash.slice(0, 16)}`;
  const candidate = {
    migration_id: migrationId,
    relative_path: relativePath,
    content_hash: contentHash,
    action,
    reason,
    replay: replayInstruction(action),
    rollback: {
      instructions: `If replay created records, remove records tagged migration_id=${migrationId}; preserve unrelated Memory v2 records.`
    },
    observed_at: now.toISOString()
  };
  if (skipReason) candidate.skip_reason = skipReason;
  if (proposedRecord) {
    candidate.proposed_record = stableValue({
      ...proposedRecord,
      migration_id: migrationId,
      migration_source_path: relativePath,
      migration_content_hash: contentHash
    });
  }
  return candidate;
}

function replayInstruction(action) {
  if (action === "durable_claim") {
    return { command: "node scripts/memory.mjs remember --json <candidate-record.json>" };
  }
  if (action === "source_pack") {
    return { command: "node scripts/memory.mjs source-pack ingest --json <candidate-record.json>" };
  }
  if (action === "open_loop") {
    return { command: "node scripts/memory.mjs open-loop add --json <candidate-record.json>" };
  }
  return { command: "no runtime write; keep this manifest candidate for audit" };
}

function sourcePackRecord({
  relativePath,
  contentHash,
  topic,
  body,
  sourcePointer,
  now,
  staleAfterDays = null
}) {
  const record = {
    id: `kb-migration-${slugify(relativePath)}`,
    source_id: "kb-migration",
    topic,
    chunks: [
      {
        id: `chunk-${contentHash.slice(0, 12)}`,
        text: body.trim(),
        source_pointer: sourcePointer,
        summary: firstUsefulLine(body, relativePath),
        redaction_status: "no_secrets_observed",
        observed_at: now.toISOString()
      }
    ]
  };
  if (staleAfterDays != null) record.stale_after_days = staleAfterDays;
  return record;
}

function classifyMarkdownNote({
  relativePath,
  content,
  contentHash,
  now
}) {
  const { frontmatter, body } = parseFrontmatter(content);
  const topic = topicFromPath(relativePath, frontmatter);
  const subjectKey = subjectKeyFromPath(relativePath, frontmatter);
  const title = textValue(frontmatter.title) || firstUsefulLine(body, path.basename(relativePath, ".md"));
  const sourcePointer = {
    kind: "kb_markdown",
    relative_path: relativePath,
    content_hash: contentHash
  };

  if (!body.trim()) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "skip",
      reason: "Empty markdown note has no migratable agent memory.",
      skipReason: "empty_note"
    });
  }
  if (hasSecretLikeText([relativePath, content])) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "skip",
      reason: "Note contains secret-like content and needs manual redaction before migration.",
      skipReason: "secret_like_content"
    });
  }
  if (isArchived(relativePath, frontmatter)) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "archive",
      reason: "Note is already archived in the legacy KB; do not promote it into active Memory v2 state."
    });
  }
  if (isSpeculative(frontmatter, body)) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "skip",
      reason: "Speculative or low-confidence note is not durable agent memory.",
      skipReason: "speculative_or_low_confidence"
    });
  }
  if (isOpenLoop(frontmatter, body)) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "open_loop",
      reason: "Unfinished work belongs in the open-loop layer, not durable memory claims.",
      proposedRecord: {
        title,
        scope: textValue(frontmatter.scope) === "global" ? "global" : "repo",
        priority: textValue(frontmatter.priority) || "P2",
        next_action: title,
        source_paths: [relativePath]
      }
    });
  }
  if (isStale(relativePath, frontmatter, body)) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "source_pack",
      reason: "Stale material is preserved as source-pack evidence instead of becoming an active claim.",
      proposedRecord: sourcePackRecord({
        relativePath,
        contentHash,
        topic,
        body,
        sourcePointer,
        now,
        staleAfterDays: 30
      })
    });
  }
  if (isHighConfidence(frontmatter) && isCrossProject(relativePath, frontmatter, body)) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "durable_claim",
      reason: "High-confidence cross-project material can become a global durable claim.",
      proposedRecord: {
        type: claimType(relativePath, frontmatter),
        claim: title,
        scope: "global",
        lifecycle_state: "active",
        confidence: "high",
        source_id: "kb-migration",
        topic,
        subject_key: subjectKey,
        evidence_path: `kb:${relativePath}`
      }
    });
  }
  if (isCrossProject(relativePath, frontmatter, body)) {
    return baseCandidate({
      relativePath,
      contentHash,
      now,
      action: "source_pack",
      reason: "Cross-project material without high confidence stays as source-pack evidence for later consolidation.",
      proposedRecord: sourcePackRecord({
        relativePath,
        contentHash,
        topic,
        body,
        sourcePointer,
        now
      })
    });
  }

  return baseCandidate({
    relativePath,
    contentHash,
    now,
    action: "needs_review",
    reason: "Project-local or ambiguous note needs a human/agent review before migration.",
    proposedRecord: {
      review_reason: "ambiguous_scope_or_confidence",
      topic,
      subject_key: subjectKey,
      source_pointer: sourcePointer
    }
  });
}

export function buildObsidianMigrationManifest({
  kbRoot,
  now = new Date()
} = {}) {
  if (!kbRoot) throw new Error("kbRoot is required");
  const root = path.resolve(kbRoot);
  const files = listMarkdownFiles(root);
  const candidates = files.map((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = normalizeRelativePath(path.relative(root, filePath));
    return classifyMarkdownNote({
      relativePath,
      content,
      contentHash: sha256(content),
      now
    });
  });

  return {
    schema_version: 1,
    mode: "dry_run",
    generated_at: now.toISOString(),
    migration_batch_id: `kb-migration-${sha256(`${root}:${now.toISOString()}`).slice(0, 12)}`,
    source: {
      kind: "obsidian_markdown",
      markdown_file_count: files.length
    },
    allowed_actions: MIGRATION_ACTIONS,
    replay: {
      instructions: "Review this dry-run manifest first, then replay only accepted candidates through Memory v2 writers."
    },
    rollback: {
      instructions: "Rollback by migration_batch_id or per-candidate migration_id; never delete unrelated source packs or claims."
    },
    candidates
  };
}

function markdownList(items) {
  if (items.length === 0) return "- None";
  return items.map((item) => `- ${item}`).join("\n");
}

export function generateObsidianExport({
  cwd = process.cwd(),
  memoryFile = null,
  sourceIndexFile = null,
  now = new Date()
} = {}) {
  const defaultMemory = resolveGlobalMemoryPaths();
  const defaultSources = resolveGlobalSourcePaths();
  const resolvedMemoryFile = memoryFile ?? defaultMemory.memoryFile;
  const resolvedSourceIndexFile = sourceIndexFile ?? defaultSources.sourceIndexFile;
  const claims = readJsonl(resolvedMemoryFile)
    .filter((claim) => claim.lifecycle_state !== "archived" && claim.lifecycle_state !== "superseded")
    .sort((left, right) => String(left.subject_key ?? left.id).localeCompare(String(right.subject_key ?? right.id)));
  const sourcePacks = readJsonl(resolvedSourceIndexFile)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const claimLines = markdownList(claims.map((claim) => {
    const topic = claim.topic ? ` topic=${claim.topic}` : "";
    const subject = claim.subject_key ? ` subject=${claim.subject_key}` : "";
    return `\`${claim.id}\`${topic}${subject}: ${claim.claim}`;
  }));
  const sourceLines = markdownList(sourcePacks.map((pack) => {
    const topic = pack.topic ? ` topic=${pack.topic}` : "";
    return `\`${pack.id}\`${topic}: ${pack.chunk_count ?? 0} chunks`;
  }));
  const content = [
    "# Memory v2 Index",
    "",
    `Generated from Memory v2 runtime state at ${now.toISOString()}.`,
    "This page is a human-readable export only; Memory v2 JSONL runtime state remains canonical.",
    "",
    "## Durable Claims",
    claimLines,
    "",
    "## Source Packs",
    sourceLines,
    ""
  ].join("\n");

  return {
    mode: "generated_export",
    generated_at: now.toISOString(),
    source_files: {
      memory_file: resolvedMemoryFile,
      source_index_file: resolvedSourceIndexFile
    },
    files: [
      {
        relative_path: "memory-v2-index.md",
        content
      }
    ],
    cwd
  };
}

function readJsonArg(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      Object.assign(options, readJsonArg(rest[++index]));
      continue;
    }
    if (token === "--kb-root") {
      options.kbRoot = rest[++index];
      continue;
    }
    if (token === "--manifest-output") {
      options.manifestOutput = rest[++index];
      continue;
    }
    if (token === "--memory-file") {
      options.memoryFile = rest[++index];
      continue;
    }
    if (token === "--source-index-file") {
      options.sourceIndexFile = rest[++index];
      continue;
    }
    if (token === "--output-dir") {
      options.outputDir = rest[++index];
      continue;
    }
    if (token === "--now") {
      options.now = rest[++index];
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/memory-migrate.mjs <obsidian|export> [options]",
    "",
    "obsidian --kb-root DIR          Emit a dry-run manifest for legacy KB markdown.",
    "export                          Generate human markdown from Memory v2 runtime state.",
    ""
  ].join("\n");
}

function maybeWriteJson(filePath, value) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`);
}

function maybeWriteExport(outputDir, exported) {
  if (!outputDir) return;
  for (const file of exported.files) {
    const target = path.join(path.resolve(outputDir), file.relative_path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.help) {
    process.stdout.write(helpText());
    return;
  }

  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now must be a valid ISO date");

  if (options.command === "obsidian") {
    const manifest = buildObsidianMigrationManifest({
      kbRoot: options.kbRoot,
      now
    });
    maybeWriteJson(options.manifestOutput, manifest);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  if (options.command === "export") {
    const exported = generateObsidianExport({
      cwd: process.cwd(),
      memoryFile: options.memoryFile,
      sourceIndexFile: options.sourceIndexFile,
      now
    });
    maybeWriteExport(options.outputDir, exported);
    process.stdout.write(`${JSON.stringify(exported, null, 2)}\n`);
    return;
  }
  throw new Error(`Unknown migration command: ${options.command}`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
