#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { assertNoSecretLikeText } from "./lib/redaction.mjs";
import { resolveEvidencePaths } from "./runtime-state.mjs";

export const EVIDENCE_EVENT_TYPES = [
  "decision",
  "exploration",
  "repo_update",
  "test",
  "ship",
  "research",
  "user_correction",
  "open_loop",
  "maintenance"
];

export const EVIDENCE_SCOPES = ["repo", "project", "domain", "user", "global"];
export const REDACTION_STATUSES = ["no_secrets_observed", "redacted", "secret_reference_only"];

// Pattern set lives in `scripts/lib/redaction.mjs` (PR #21 review). The
// previous local copy missed every modern token shape — see the adversarial
// corpus in `tests/redaction.test.mjs` for what we now reject.

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
    .slice(0, 64) || "evidence";
}

function datePart(value) {
  return String(value).slice(0, 10);
}

function assertAllowed(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
}

function uniqueId({ id, eventType, summary, observedAt, existingEvidence }) {
  const existingIds = new Set(existingEvidence.map((entry) => entry.id).filter(Boolean));
  if (id) {
    if (existingIds.has(id)) throw new Error(`evidence id already exists: ${id}`);
    return id;
  }

  const base = `${datePart(observedAt)}-${eventType}-${slugify(summary)}`;
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function normalizeEvidenceRecord(input, {
  existingEvidence = [],
  now = new Date()
} = {}) {
  if (!input || typeof input !== "object") throw new Error("input evidence record is required");

  const eventType = String(input.event_type ?? input.eventType ?? "").trim();
  const scope = String(input.scope ?? "repo").trim();
  const summary = String(input.summary ?? "").trim();
  const observedAt = input.observed_at ?? input.observedAt ?? now.toISOString();
  const sourcePaths = normalizeList(input.source_paths ?? input.source_path ?? input.sourcePath);
  const evidencePaths = normalizeList(input.evidence_paths ?? input.evidence_path ?? input.evidencePath);
  const relatedIds = normalizeList(input.related_ids ?? input.related_id ?? input.relatedId);
  const redactionStatus = String(input.redaction_status ?? input.redactionStatus ?? "no_secrets_observed").trim();
  const brainId = input.brain_id ? String(input.brain_id).trim() : "";
  const sourceId = input.source_id ? String(input.source_id).trim() : "";
  const topic = input.topic ? String(input.topic).trim() : "";
  const subjectKey = input.subject_key ? String(input.subject_key).trim() : "";
  const ownerProjectKey = input.owner_project_key ? String(input.owner_project_key).trim() : "";

  if (!eventType) throw new Error("event_type is required");
  if (!summary) throw new Error("summary is required");
  assertAllowed("event_type", eventType, EVIDENCE_EVENT_TYPES);
  assertAllowed("scope", scope, EVIDENCE_SCOPES);
  assertAllowed("redaction_status", redactionStatus, REDACTION_STATUSES);
  if (sourcePaths.length === 0 && evidencePaths.length === 0 && relatedIds.length === 0) {
    throw new Error("source_path, evidence_path, or related_id is required");
  }

  assertNoSecretLikeText([
    input.id,
    summary,
    ...sourcePaths,
    ...evidencePaths,
    ...relatedIds,
    brainId,
    sourceId,
    topic,
    subjectKey,
    ownerProjectKey
  ], "evidence contains secret-like content; redact it before writing");

  const record = {
    id: uniqueId({ id: input.id, eventType, summary, observedAt, existingEvidence }),
    event_type: eventType,
    scope,
    summary,
    observed_at: observedAt,
    redaction_status: redactionStatus
  };

  if (sourcePaths.length > 0) record.source_paths = sourcePaths;
  if (evidencePaths.length > 0) record.evidence_paths = evidencePaths;
  if (relatedIds.length > 0) record.related_ids = relatedIds;
  if (brainId) record.brain_id = brainId;
  if (sourceId) record.source_id = sourceId;
  if (topic) record.topic = topic;
  if (subjectKey) record.subject_key = subjectKey;
  if (ownerProjectKey) record.owner_project_key = ownerProjectKey;

  return record;
}

export function addEvidenceRecord({
  cwd = process.cwd(),
  evidenceFile = null,
  input,
  now = new Date()
} = {}) {
  const resolvedEvidenceFile = evidenceFile ?? resolveEvidencePaths({
    cwd,
    scope: input?.scope ?? "repo"
  }).evidenceFile;
  return withFileLock(resolvedEvidenceFile, (lockState) => {
    const existingEvidence = readJsonl(resolvedEvidenceFile);
    const record = normalizeEvidenceRecord(input, { existingEvidence, now });
    writeJsonlAtomic(resolvedEvidenceFile, [...existingEvidence, record]);
    return {
      evidence_file: resolvedEvidenceFile,
      id: record.id,
      event_type: record.event_type,
      written: true,
      lock: visibleLockState(lockState)
    };
  });
}

export function listEvidenceRecords({
  cwd = process.cwd(),
  evidenceFile = null,
  eventType = null,
  scope = null
} = {}) {
  const resolvedEvidenceFile = evidenceFile ?? resolveEvidencePaths({ cwd }).evidenceFile;
  const records = readJsonl(resolvedEvidenceFile)
    .filter((record) => !eventType || record.event_type === eventType)
    .filter((record) => !scope || record.scope === scope)
    .sort((left, right) => String(left.observed_at).localeCompare(String(right.observed_at)));

  return {
    evidence_file: resolvedEvidenceFile,
    evidence_count: records.length,
    records
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
    if (token === "--evidence-file") {
      options.evidenceFile = rest[++index];
      continue;
    }
    if (token === "--id") {
      options.input.id = rest[++index];
      continue;
    }
    if (token === "--event-type") {
      options.input.event_type = rest[++index];
      options.eventType = options.input.event_type;
      continue;
    }
    if (token === "--scope") {
      options.input.scope = rest[++index];
      options.scope = options.input.scope;
      continue;
    }
    if (token === "--brain-id") {
      options.input.brain_id = rest[++index];
      continue;
    }
    if (token === "--source-id") {
      options.input.source_id = rest[++index];
      continue;
    }
    if (token === "--topic") {
      options.input.topic = rest[++index];
      continue;
    }
    if (token === "--subject-key") {
      options.input.subject_key = rest[++index];
      continue;
    }
    if (token === "--owner-project-key") {
      options.input.owner_project_key = rest[++index];
      continue;
    }
    if (token === "--summary") {
      options.input.summary = rest[++index];
      continue;
    }
    if (token === "--observed-at") {
      options.input.observed_at = rest[++index];
      continue;
    }
    if (token === "--redaction-status") {
      options.input.redaction_status = rest[++index];
      continue;
    }
    if (token === "--source-path") {
      pushListOption(options, "source_paths", rest[++index]);
      continue;
    }
    if (token === "--evidence-path") {
      pushListOption(options, "evidence_paths", rest[++index]);
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
    "Usage: node scripts/evidence.mjs <add|list> [options]",
    "",
    "add requires --event-type, --summary, and --source-path, --evidence-path, or --related-id.",
    "Evidence stores source pointers and summaries only; redact secret-bearing values before writing.",
    ""
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.help) {
    process.stdout.write(helpText());
    return;
  }
  if (options.command === "add") {
    const result = addEvidenceRecord({ cwd: process.cwd(), ...options });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (options.command === "list") {
    const result = listEvidenceRecords({
      cwd: process.cwd(),
      evidenceFile: options.evidenceFile,
      eventType: options.eventType,
      scope: options.scope
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
