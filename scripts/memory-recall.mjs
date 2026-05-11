#!/usr/bin/env node

import process from "node:process";
import { readJsonl } from "./lib/jsonl.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { resolveEvidencePaths, resolveMemoryPaths, resolveTaskPaths } from "./runtime-state.mjs";
import { expandSourcePack } from "./source-pack.mjs";
import { listOpenLoops } from "./open-loop.mjs";

const STORE_SCOPES = ["project", "global", "combined"];

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function tokens(value) {
  return normalizeText(value)
    .split(/[^a-z0-9_./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function evidenceFor(record) {
  // PR #21 review NEW2: pre-fix, this function omitted `source_symbols` even
  // though `claimResult` already included them in the scoring search text.
  // Net result: a free-text query for a symbol name found the claim, but
  // `--source FooBar` returned zero. Recall is now consistent — anything
  // the scorer considers a pointer also surfaces as a filterable pointer.
  return [
    ...(record.evidence_path ? [record.evidence_path] : []),
    ...(record.evidence_paths ?? []),
    ...(record.evidence_ids ?? []),
    ...(record.source_paths ?? []),
    ...(record.source_symbols ?? []),
    ...(record.related_ids ?? [])
  ];
}

function snippet(value, queryTokens) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  const lower = text.toLowerCase();
  const hit = queryTokens.map((token) => lower.indexOf(token)).find((index) => index >= 0);
  const start = Math.max(0, (hit ?? 0) - 60);
  return `${start > 0 ? "..." : ""}${text.slice(start, start + 180)}${start + 180 < text.length ? "..." : ""}`;
}

function scoreRecord(record, queryTokens, searchText) {
  if (queryTokens.length === 0) return 1;
  const haystack = normalizeText(searchText);
  return queryTokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function routingFields(record, { defaultSourceId }) {
  const scope = record.scope ?? "repo";
  return {
    brain_id: record.brain_id ?? (scope === "global" ? "global" : "project"),
    source_id: record.source_id ?? defaultSourceId,
    topic: record.topic ?? null,
    subject_key: record.subject_key ?? record.id,
    owner_project_key: record.owner_project_key ?? null
  };
}

function claimResult(claim, queryTokens, storeScope = "project") {
  const searchText = [
    claim.id,
    claim.type,
    claim.scope,
    claim.brain_id,
    claim.source_id,
    claim.topic,
    claim.subject_key,
    claim.owner_project_key,
    claim.lifecycle_state,
    claim.claim,
    claim.confidence,
    claim.review_caveat,
    ...(claim.source_paths ?? []),
    ...(claim.source_symbols ?? []),
    ...(claim.evidence_ids ?? []),
    claim.evidence_path
  ].join(" ");
  const score = scoreRecord(claim, queryTokens, searchText);
  if (score <= 0) return null;
  return {
    id: claim.id,
    kind: "claim",
    type: claim.type,
    scope: claim.scope,
    lifecycle_state: claim.lifecycle_state,
    confidence: claim.confidence ?? null,
    review_caveat: claim.review_caveat ?? null,
    created_at: claim.created_at,
    updated_at: claim.last_confirmed_at ?? claim.created_at,
    source_pointers: evidenceFor(claim),
    snippet: snippet(claim.claim, queryTokens),
    score,
    store_scope: storeScope,
    ...routingFields(claim, { defaultSourceId: "project-runtime" })
  };
}

function openLoopResult(loop, queryTokens, storeScope = "project") {
  const searchText = [
    loop.id,
    loop.title,
    loop.scope,
    loop.brain_id,
    loop.source_id,
    loop.topic,
    loop.subject_key,
    loop.owner_project_key,
    loop.status,
    loop.priority,
    loop.next_action,
    loop.blocked_reason,
    loop.drop_reason,
    loop.task_file,
    ...(loop.source_paths ?? []),
    ...(loop.evidence_ids ?? []),
    loop.evidence_path
  ].join(" ");
  const score = scoreRecord(loop, queryTokens, searchText);
  if (score <= 0) return null;
  return {
    id: loop.id,
    kind: "open_loop",
    type: "open_loop",
    scope: loop.scope,
    lifecycle_state: loop.status,
    confidence: null,
    review_caveat: loop.blocked_reason ?? loop.drop_reason ?? null,
    created_at: loop.created_at,
    updated_at: loop.updated_at,
    task_file: loop.task_file ?? null,
    source_pointers: evidenceFor(loop),
    snippet: snippet(`${loop.title}: ${loop.next_action}`, queryTokens),
    score,
    store_scope: storeScope,
    ...routingFields(loop, { defaultSourceId: "task-runtime" })
  };
}

function evidenceResult(record, queryTokens, storeScope = "project") {
  const searchText = [
    record.id,
    record.event_type,
    record.scope,
    record.brain_id,
    record.source_id,
    record.topic,
    record.subject_key,
    record.owner_project_key,
    record.summary,
    record.redaction_status,
    ...(record.source_paths ?? []),
    ...(record.evidence_paths ?? []),
    ...(record.related_ids ?? [])
  ].join(" ");
  const score = scoreRecord(record, queryTokens, searchText);
  if (score <= 0) return null;
  return {
    id: record.id,
    kind: "evidence",
    type: record.event_type,
    scope: record.scope,
    lifecycle_state: record.redaction_status,
    confidence: null,
    review_caveat: null,
    created_at: record.observed_at,
    updated_at: record.observed_at,
    source_pointers: evidenceFor(record),
    snippet: snippet(record.summary, queryTokens),
    score,
    store_scope: storeScope,
    ...routingFields(record, { defaultSourceId: "evidence-runtime" })
  };
}

function matchFilters(result, { kind, type, scope, lifecycleState, source, sourceId, brainId }) {
  if (kind && result.kind !== kind) return false;
  if (type && result.type !== type) return false;
  if (scope && result.scope !== scope) return false;
  if (lifecycleState && result.lifecycle_state !== lifecycleState) return false;
  if (source && !result.source_pointers.some((pointer) => String(pointer).includes(source))) return false;
  if (sourceId && result.source_id !== sourceId) return false;
  if (brainId && result.brain_id !== brainId) return false;
  return true;
}

function assertStoreScope(storeScope) {
  if (!STORE_SCOPES.includes(storeScope)) {
    throw new Error(`store_scope must be one of: ${STORE_SCOPES.join(", ")}`);
  }
}

function sortResults(results) {
  return results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? ""));
  });
}

function resultsForStore({
  claims,
  loops,
  evidence,
  queryTokens,
  storeScope,
  filters
}) {
  return sortResults([
    ...claims.map((claim) => claimResult(claim, queryTokens, storeScope)),
    ...loops.map((loop) => openLoopResult(loop, queryTokens, storeScope)),
    ...evidence.map((record) => evidenceResult(record, queryTokens, storeScope))
  ]
    .filter(Boolean)
    .filter((result) => matchFilters(result, filters)));
}

function conflictClaimView(claim, queryTokens, storeScope) {
  const result = claimResult(claim, queryTokens, storeScope);
  if (!result) return null;
  return {
    id: claim.id,
    store_scope: storeScope,
    scope: claim.scope,
    type: claim.type,
    claim: claim.claim,
    lifecycle_state: claim.lifecycle_state,
    confidence: claim.confidence ?? null,
    review_caveat: claim.review_caveat ?? null,
    updated_at: claim.last_confirmed_at ?? claim.created_at,
    source_pointers: evidenceFor(claim),
    brain_id: result.brain_id,
    source_id: result.source_id,
    subject_key: result.subject_key
  };
}

function detectSubjectConflicts({
  projectClaims,
  globalClaims,
  queryTokens,
  filters
}) {
  if (filters.kind && filters.kind !== "claim") return [];
  const claimViews = [
    ...projectClaims.map((claim) => conflictClaimView(claim, queryTokens, "project")),
    ...globalClaims.map((claim) => conflictClaimView(claim, queryTokens, "global"))
  ]
    .filter(Boolean)
    .filter((view) => !["archived", "superseded"].includes(view.lifecycle_state))
    .filter((view) => matchFilters({
      id: view.id,
      kind: "claim",
      type: view.type,
      scope: view.scope,
      lifecycle_state: view.lifecycle_state,
      source_pointers: view.source_pointers,
      brain_id: view.brain_id,
      source_id: view.source_id
    }, filters));
  const groups = new Map();

  for (const view of claimViews) {
    if (!view.subject_key) continue;
    groups.set(view.subject_key, [...(groups.get(view.subject_key) ?? []), view]);
  }

  return [...groups.entries()]
    .filter(([, views]) => views.length > 1)
    .map(([subjectKey, views]) => {
      const distinctClaims = new Set(views.map((view) => normalizeText(view.claim)));
      if (distinctClaims.size <= 1) return null;
      return {
        subject_key: subjectKey,
        reason: "matching subject_key with different claim text",
        claim_ids: views.map((view) => view.id).sort(),
        claims: views.sort((left, right) => String(left.id).localeCompare(String(right.id)))
      };
    })
    .filter(Boolean);
}

export function recallMemory({
  cwd = process.cwd(),
  query = "",
  kind = null,
  type = null,
  scope = null,
  lifecycleState = null,
  source = null,
  sourceId = null,
  brainId = null,
  limit = 10,
  projectLimit = null,
  globalLimit = null,
  memoryFile = null,
  taskFile = null,
  evidenceFile = null,
  globalMemoryFile = null,
  globalEvidenceFile = null,
  includeTasks = true,
  includeEvidence = true,
  allProjectTasks = false,
  storeScope = null
} = {}) {
  const resolvedStoreScope = storeScope ?? (
    memoryFile || taskFile || evidenceFile ? "project" : "combined"
  );
  assertStoreScope(resolvedStoreScope);
  const resolvedMemoryFile = memoryFile ?? resolveMemoryPaths({ cwd }).memoryFile;
  const resolvedTaskFile = taskFile ?? resolveTaskPaths({ cwd }).taskFile;
  const resolvedEvidenceFile = evidenceFile ?? resolveEvidencePaths({ cwd }).evidenceFile;
  const resolvedGlobalMemoryFile = globalMemoryFile ?? (
    resolvedStoreScope === "global" && memoryFile
      ? memoryFile
      : resolveMemoryPaths({ cwd, scope: "global" }).memoryFile
  );
  const resolvedGlobalEvidenceFile = globalEvidenceFile ?? (
    resolvedStoreScope === "global" && evidenceFile
      ? evidenceFile
      : resolveEvidencePaths({ cwd, scope: "global" }).evidenceFile
  );
  const queryTokens = tokens(query);
  const filters = { kind, type, scope, lifecycleState, source, sourceId, brainId };
  const includeProjectStore = resolvedStoreScope !== "global";
  const includeGlobalStore = resolvedStoreScope !== "project";
  const projectClaims = includeProjectStore ? readJsonl(resolvedMemoryFile) : [];
  const projectLoops = includeProjectStore && includeTasks
    ? allProjectTasks
      ? listOpenLoops({ cwd, allProjects: true }).loops
      : readJsonl(resolvedTaskFile)
    : [];
  const projectEvidence = includeProjectStore && includeEvidence ? readJsonl(resolvedEvidenceFile) : [];
  const globalClaims = includeGlobalStore ? readJsonl(resolvedGlobalMemoryFile) : [];
  const globalEvidence = includeGlobalStore && includeEvidence ? readJsonl(resolvedGlobalEvidenceFile) : [];
  const effectiveProjectLimit = projectLimit ?? limit;
  const effectiveGlobalLimit = globalLimit ?? (
    resolvedStoreScope === "global" ? limit : Math.min(3, limit)
  );

  const projectResults = includeProjectStore
    ? resultsForStore({
      claims: projectClaims,
      loops: projectLoops,
      evidence: projectEvidence,
      queryTokens,
      storeScope: "project",
      filters
    }).slice(0, effectiveProjectLimit)
    : [];
  const globalResults = includeGlobalStore
    ? resultsForStore({
      claims: globalClaims,
      loops: [],
      evidence: globalEvidence,
      queryTokens,
      storeScope: "global",
      filters
    }).slice(0, effectiveGlobalLimit)
    : [];
  const results = resolvedStoreScope === "global" ? globalResults : [...projectResults, ...globalResults];
  const conflicts = detectSubjectConflicts({
    projectClaims,
    globalClaims,
    queryTokens,
    filters
  });

  return {
    store_scope: resolvedStoreScope,
    memory_file: includeProjectStore ? resolvedMemoryFile : null,
    global_memory_file: includeGlobalStore ? resolvedGlobalMemoryFile : null,
    task_file: includeTasks && includeProjectStore && !allProjectTasks ? resolvedTaskFile : null,
    task_files: includeTasks && includeProjectStore && allProjectTasks
      ? [...new Set(projectLoops.map((loop) => loop.task_file).filter(Boolean))].sort()
      : null,
    evidence_file: includeEvidence && includeProjectStore ? resolvedEvidenceFile : null,
    global_evidence_file: includeEvidence && includeGlobalStore ? resolvedGlobalEvidenceFile : null,
    query,
    project_limit: includeProjectStore ? effectiveProjectLimit : 0,
    global_limit: includeGlobalStore ? effectiveGlobalLimit : 0,
    result_count: results.length,
    results,
    conflicts,
    has_conflicts: conflicts.length > 0,
    abstained: results.length === 0 && conflicts.length === 0
  };
}

export function expandMemory({
  cwd = process.cwd(),
  id,
  memoryFile = null,
  taskFile = null,
  evidenceFile = null,
  sourceRoot = null,
  sourceIndexFile = null
} = {}) {
  if (!id) throw new Error("id is required");
  const resolvedMemoryFile = memoryFile ?? resolveMemoryPaths({ cwd }).memoryFile;
  const resolvedTaskFile = taskFile ?? resolveTaskPaths({ cwd }).taskFile;
  const resolvedEvidenceFile = evidenceFile ?? resolveEvidencePaths({ cwd }).evidenceFile;

  for (const [kind, filePath] of [
    ["claim", resolvedMemoryFile],
    ["open_loop", resolvedTaskFile],
    ["evidence", resolvedEvidenceFile]
  ]) {
    const record = readJsonl(filePath).find((entry) => entry.id === id);
    if (record) {
      return {
        found: true,
        kind,
        file: filePath,
        id,
        record
      };
    }
  }

  const sourcePack = expandSourcePack({ cwd, sourceRoot, sourceIndexFile, id });
  if (sourcePack.found) return sourcePack;

  return {
    found: false,
    id,
    abstained: true,
    reason: "memory record not found"
  };
}

function parseArgs(argv) {
  const options = { limit: 10, includeTasks: true, includeEvidence: true };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--query" || token === "-q") {
      options.query = argv[++index];
      continue;
    }
    if (token === "--id") {
      options.id = argv[++index];
      continue;
    }
    if (token === "--kind") {
      options.kind = argv[++index];
      continue;
    }
    if (token === "--type") {
      options.type = argv[++index];
      continue;
    }
    if (token === "--scope") {
      options.scope = argv[++index];
      continue;
    }
    if (token === "--lifecycle-state") {
      options.lifecycleState = argv[++index];
      continue;
    }
    if (token === "--source") {
      options.source = argv[++index];
      continue;
    }
    if (token === "--source-id") {
      options.sourceId = argv[++index];
      continue;
    }
    if (token === "--brain-id") {
      options.brainId = argv[++index];
      continue;
    }
    if (token === "--limit") {
      options.limit = Number.parseInt(argv[++index], 10);
      continue;
    }
    if (token === "--project-limit") {
      options.projectLimit = Number.parseInt(argv[++index], 10);
      continue;
    }
    if (token === "--global-limit") {
      options.globalLimit = Number.parseInt(argv[++index], 10);
      continue;
    }
    if (token === "--store-scope") {
      options.storeScope = argv[++index];
      continue;
    }
    if (token === "--project-only") {
      options.storeScope = "project";
      continue;
    }
    if (token === "--global-only") {
      options.storeScope = "global";
      continue;
    }
    if (token === "--memory-file") {
      options.memoryFile = argv[++index];
      continue;
    }
    if (token === "--task-file") {
      options.taskFile = argv[++index];
      continue;
    }
    if (token === "--evidence-file") {
      options.evidenceFile = argv[++index];
      continue;
    }
    if (token === "--global-memory-file") {
      options.globalMemoryFile = argv[++index];
      continue;
    }
    if (token === "--global-evidence-file") {
      options.globalEvidenceFile = argv[++index];
      continue;
    }
    if (token === "--source-root") {
      options.sourceRoot = argv[++index];
      continue;
    }
    if (token === "--source-index-file") {
      options.sourceIndexFile = argv[++index];
      continue;
    }
    if (token === "--no-tasks") {
      options.includeTasks = false;
      continue;
    }
    if (token === "--no-evidence") {
      options.includeEvidence = false;
      continue;
    }
    if (token === "--all-project-tasks") {
      options.allProjectTasks = true;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function main() {
  const command = process.argv[2];
  const options = parseArgs(process.argv.slice(3));
  if (command === "recall") {
    process.stdout.write(`${JSON.stringify(recallMemory({ cwd: process.cwd(), ...options }), null, 2)}\n`);
    return;
  }
  if (command === "expand") {
    process.stdout.write(`${JSON.stringify(expandMemory({ cwd: process.cwd(), ...options }), null, 2)}\n`);
    return;
  }
  process.stdout.write("Usage: node scripts/memory-recall.mjs <recall|expand> [options]\n");
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
