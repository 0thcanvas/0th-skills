#!/usr/bin/env node

import process from "node:process";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { readJsonFileArg } from "./lib/json-arg.mjs";
import { appendMemoryClaim } from "./memory-write.mjs";

export const MEMORY_GATE_OUTCOMES = ["project", "global", "both", "nothing_durable"];

const GLOBAL_EVENT_TYPES = new Set([
  "research",
  "user_preference",
  "workflow_lesson",
  "cross_project_architecture"
]);

function hasText(value) {
  return String(value ?? "").trim().length > 0;
}

function normalizeList(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function hasEvidence(input) {
  return hasText(input.evidence_path)
    || normalizeList(input.evidence_ids ?? input.evidence_id).length > 0
    || normalizeList(input.source_paths ?? input.source_path).length > 0;
}

function assertAllowed(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
}

function memoryTypeFor(input, { project = false } = {}) {
  if (project && input.project_type) return input.project_type;
  if (input.type) return input.type;
  if (input.event_type === "repo_decision") return "decision";
  if (input.event_type === "workflow_lesson") return "observation";
  if (input.event_type === "cross_project_architecture") return "external_research";
  if (input.event_type === "research") return "external_research";
  if (input.event_type === "user_preference") return "observation";
  return "observation";
}

function evidenceFields(input) {
  const fields = {};
  if (hasText(input.evidence_path)) fields.evidence_path = String(input.evidence_path).trim();
  const evidenceIds = normalizeList(input.evidence_ids ?? input.evidence_id);
  const sourcePaths = normalizeList(input.source_paths ?? input.source_path);
  if (evidenceIds.length > 0) fields.evidence_ids = evidenceIds;
  if (sourcePaths.length > 0) fields.source_paths = sourcePaths;
  return fields;
}

function baseClaimInput(input, {
  claim,
  scope,
  type = memoryTypeFor(input)
}) {
  const next = {
    type,
    claim,
    scope,
    lifecycle_state: input.lifecycle_state ?? "active",
    ...evidenceFields(input)
  };

  if (input.confidence) next.confidence = input.confidence;
  if (input.review_caveat) next.review_caveat = input.review_caveat;
  if (input.subject_key) next.subject_key = input.subject_key;
  if (input.topic) next.topic = input.topic;
  if (input.owner_project_key) next.owner_project_key = input.owner_project_key;
  return next;
}

export function classifyMemoryEvent(input = {}) {
  if (!input || typeof input !== "object") throw new Error("input memory event is required");
  const eventType = String(input.event_type ?? input.eventType ?? "").trim();
  const explicitOutcome = input.outcome ? String(input.outcome).trim() : "";

  if (input.durable === false || eventType === "nothing" || explicitOutcome === "nothing_durable") {
    return {
      outcome: "nothing_durable",
      event_type: eventType || "nothing",
      reason: "event marked as not durable"
    };
  }

  if (input.consolidate) {
    if (!hasText(input.claim)) throw new Error("consolidation requires an explicit reusable lesson");
    if (!hasText(input.source_id) || !hasEvidence(input)) {
      throw new Error("consolidation requires source-backed evidence");
    }
  }

  const inferredOutcome = explicitOutcome || (
    GLOBAL_EVENT_TYPES.has(eventType)
      ? hasText(input.project_claim) ? "both" : "global"
      : "project"
  );
  assertAllowed("outcome", inferredOutcome, MEMORY_GATE_OUTCOMES);

  if ((inferredOutcome === "global" || inferredOutcome === "both") && (!hasText(input.source_id) || !hasEvidence(input))) {
    throw new Error("global memory capture requires source_id and source-backed evidence");
  }

  return {
    outcome: inferredOutcome,
    event_type: eventType || "unspecified",
    reason: explicitOutcome ? "explicit outcome" : "classified from event type and project application"
  };
}

export function captureMemoryEvent({
  cwd = process.cwd(),
  input,
  now = new Date(),
  updateBrief = true
} = {}) {
  const classification = classifyMemoryEvent(input);
  if (classification.outcome === "nothing_durable") {
    return {
      ...classification,
      written: false,
      global_claim_id: null,
      project_claim_id: null
    };
  }

  let globalResult = null;
  let projectResult = null;
  const claimText = String(input.claim ?? "").trim();

  if (classification.outcome === "global" || classification.outcome === "both") {
    globalResult = appendMemoryClaim({
      cwd,
      now,
      updateBrief,
      input: {
        ...baseClaimInput(input, {
          claim: claimText,
          scope: "global",
          type: memoryTypeFor(input)
        }),
        source_id: String(input.source_id).trim()
      }
    });
  }

  const projectClaimText = String(input.project_claim ?? input.projectClaim ?? "").trim();
  const shouldWriteProjectNote = classification.outcome === "project"
    || (classification.outcome === "both" && projectClaimText && projectClaimText !== claimText);

  if (shouldWriteProjectNote) {
    const relatedIds = normalizeList([
      ...(normalizeList(input.related_ids ?? input.related_id)),
      ...(globalResult?.id ? [globalResult.id] : [])
    ]);
    projectResult = appendMemoryClaim({
      cwd,
      now,
      updateBrief,
      input: {
        ...baseClaimInput(input, {
          claim: projectClaimText || claimText,
          scope: "repo",
          type: memoryTypeFor(input, { project: true })
        }),
        ...(relatedIds.length > 0 ? { related_ids: relatedIds } : {})
      }
    });
  }

  return {
    ...classification,
    outcome: classification.outcome === "both" && !projectResult ? "global" : classification.outcome,
    written: Boolean(globalResult || projectResult),
    global_claim_id: globalResult?.id ?? null,
    global_memory_file: globalResult?.memory_file ?? null,
    project_claim_id: projectResult?.id ?? null,
    project_memory_file: projectResult?.memory_file ?? null
  };
}

function readJsonArg(filePath) {
  return readJsonFileArg(filePath);
}

function pushListOption(options, key, value) {
  options.input[key] = [...(options.input[key] ?? []), value];
}

function parseArgs(argv) {
  const options = { input: {} };
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
    if (token === "--no-brief") {
      options.updateBrief = false;
      continue;
    }
    if (token === "--event-type") {
      options.input.event_type = argv[++index];
      continue;
    }
    if (token === "--outcome") {
      options.input.outcome = argv[++index];
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
    if (token === "--project-claim") {
      options.input.project_claim = argv[++index];
      continue;
    }
    if (token === "--source-id") {
      options.input.source_id = argv[++index];
      continue;
    }
    if (token === "--topic") {
      options.input.topic = argv[++index];
      continue;
    }
    if (token === "--subject-key") {
      options.input.subject_key = argv[++index];
      continue;
    }
    if (token === "--owner-project-key") {
      options.input.owner_project_key = argv[++index];
      continue;
    }
    if (token === "--evidence-path") {
      options.input.evidence_path = argv[++index];
      continue;
    }
    if (token === "--evidence-id") {
      pushListOption(options, "evidence_ids", argv[++index]);
      continue;
    }
    if (token === "--source-path") {
      pushListOption(options, "source_paths", argv[++index]);
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
    if (token === "--consolidate") {
      options.input.consolidate = true;
      continue;
    }
    if (token === "--nothing-durable") {
      options.input.outcome = "nothing_durable";
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/memory-gate.mjs --event-type TYPE --claim TEXT [options]",
    "",
    "Classifies a workflow memory event as project, global, both, or nothing_durable.",
    "Global and both outcomes require --source-id plus evidence/source pointers.",
    ""
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const result = captureMemoryEvent({ cwd: process.cwd(), ...options });
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
