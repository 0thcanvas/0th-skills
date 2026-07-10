#!/usr/bin/env node

import process from "node:process";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { recallMemory } from "./memory-recall.mjs";
import { compactPreflightResult, runPreflight } from "./session-preflight.mjs";

function compactRecall(result) {
  return {
    results: result.results.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      type: entry.type,
      lifecycle_state: entry.lifecycle_state,
      confidence: entry.confidence,
      review_caveat: entry.review_caveat,
      snippet: entry.snippet,
      source_pointers: entry.source_pointers,
      store_scope: entry.store_scope
    })),
    conflicts: result.conflicts,
    degraded_sources: result.degraded_sources
  };
}

function queryTokens(query) {
  return String(query)
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function contentRelevant(result, tokens) {
  const content = [result.snippet, ...(result.source_pointers ?? [])].join(" ").toLowerCase();
  return tokens.some((token) => content.includes(token));
}

export function buildStartupPacket({
  cwd = process.cwd(),
  query,
  allowPull = true,
  claimLimit = 3,
  globalClaimLimit = 1,
  openLoopLimit = 2,
  memoryFile,
  taskFile,
  evidenceFile,
  globalMemoryFile,
  globalEvidenceFile,
  repoStateFile
} = {}) {
  const normalizedQuery = String(query ?? "").trim();
  if (!normalizedQuery) throw new Error("startup query is required; provide task-specific keywords");
  const relevanceTokens = queryTokens(normalizedQuery);
  if (relevanceTokens.length === 0) throw new Error("startup query must contain meaningful task keywords");

  const preflight = compactPreflightResult(runPreflight({
    cwd,
    allowPull,
    memoryFile,
    repoStateFile
  }));
  const claims = recallMemory({
    cwd,
    query: normalizedQuery,
    kind: "claim",
    limit: Math.max(claimLimit * 4, 12),
    projectLimit: Math.max(claimLimit * 4, 12),
    globalLimit: globalClaimLimit,
    memoryFile,
    taskFile,
    evidenceFile,
    globalMemoryFile,
    globalEvidenceFile,
    includeTasks: false,
    includeEvidence: false
  });
  const openLoops = recallMemory({
    cwd,
    query: normalizedQuery,
    kind: "open_loop",
    limit: Math.max(openLoopLimit * 4, 8),
    projectLimit: Math.max(openLoopLimit * 4, 8),
    globalLimit: 0,
    memoryFile,
    taskFile,
    evidenceFile,
    includeTasks: true,
    includeEvidence: false,
    storeScope: "project"
  });
  const compactClaims = compactRecall(claims);
  const compactLoops = compactRecall(openLoops);

  return {
    schema_version: 1,
    query: normalizedQuery,
    repo: preflight,
    relevant_claims: compactClaims.results
      .filter((result) => contentRelevant(result, relevanceTokens))
      .slice(0, claimLimit),
    relevant_open_loops: compactLoops.results
      .filter((result) => contentRelevant(result, relevanceTokens))
      .slice(0, openLoopLimit),
    conflicts: compactClaims.conflicts,
    degraded_sources: [...compactClaims.degraded_sources, ...compactLoops.degraded_sources],
    paths: {
      project_memory: claims.memory_file,
      global_memory: claims.global_memory_file,
      open_loops: openLoops.task_file,
      repo_state: preflight.repo_state_file
    },
    expand_hint: "Use `node scripts/memory.mjs expand --id <id>` or targeted `memory recall` only when a result points to needed evidence."
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--query" || token === "-q") options.query = argv[++index];
    else if (token === "--no-pull") options.allowPull = false;
    else if (token === "--claim-limit") options.claimLimit = Number.parseInt(argv[++index], 10);
    else if (token === "--global-claim-limit") options.globalClaimLimit = Number.parseInt(argv[++index], 10);
    else if (token === "--open-loop-limit") options.openLoopLimit = Number.parseInt(argv[++index], 10);
    else if (token === "--memory-file") options.memoryFile = argv[++index];
    else if (token === "--task-file") options.taskFile = argv[++index];
    else if (token === "--evidence-file") options.evidenceFile = argv[++index];
    else if (token === "--global-memory-file") options.globalMemoryFile = argv[++index];
    else if (token === "--global-evidence-file") options.globalEvidenceFile = argv[++index];
    else if (token === "--repo-state-file") options.repoStateFile = argv[++index];
    else throw new Error(`Unknown startup option: ${token}`);
  }
  return options;
}

function main() {
  const result = buildStartupPacket({ cwd: process.cwd(), ...parseArgs(process.argv.slice(2)) });
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
