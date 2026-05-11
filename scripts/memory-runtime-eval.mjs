#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { addEvidenceRecord } from "./evidence.mjs";
import { appendMemoryClaim } from "./memory-write.mjs";
import { expandMemory, recallMemory } from "./memory-recall.mjs";
import { runMemorySync } from "./memory-sync.mjs";
import { addOpenLoop, listOpenLoops, updateOpenLoopStatus } from "./open-loop.mjs";
import { writeRepoState } from "./repo-state.mjs";
import { runPreflight } from "./session-preflight.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";

function sh(cwd, args) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tempRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-runtime-eval-"));
  sh(repo, ["git", "init", "-b", "main"]);
  sh(repo, ["git", "config", "user.email", "test@example.com"]);
  sh(repo, ["git", "config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(repo, "memory.txt"), "v1\n");
  sh(repo, ["git", "add", "."]);
  sh(repo, ["git", "commit", "-m", "initial"]);
  return repo;
}

function commitFile(repo, fileName, content, message) {
  fs.writeFileSync(path.join(repo, fileName), content);
  sh(repo, ["git", "add", fileName]);
  sh(repo, ["git", "commit", "-m", message]);
}

function fixture(name, run) {
  try {
    const evidence = run();
    return { name, pass: true, evidence };
  } catch (err) {
    return { name, pass: false, error: err.message };
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function runMemoryRuntimeEval() {
  const repo = tempRepo();
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-runtime-eval-state-"));
  const memoryFile = path.join(runtimeDir, "claims.jsonl");
  const taskFile = path.join(runtimeDir, "open-loops.jsonl");
  const evidenceFile = path.join(runtimeDir, "events.jsonl");
  const repoStateFile = path.join(runtimeDir, "repo-state.json");

  const results = [];

  results.push(fixture("recall-expand-evidence", () => {
    const evidence = addEvidenceRecord({
      cwd: repo,
      evidenceFile,
      input: {
        event_type: "decision",
        scope: "repo",
        summary: "Memory runtime eval captures a source-backed decision.",
        source_paths: ["memory.txt"]
      }
    });
    const claim = appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        type: "decision",
        claim: "Runtime eval should recall and expand source-backed memory.",
        scope: "repo",
        evidence_ids: [evidence.id],
        confidence: "high"
      }
    });
    const recalled = recallMemory({ cwd: repo, memoryFile, taskFile, evidenceFile, query: "recall expand source-backed" });
    const expanded = expandMemory({ cwd: repo, memoryFile, taskFile, evidenceFile, id: claim.id });
    assert(recalled.results.some((result) => result.id === claim.id), "claim was not recalled");
    assert(expanded.found && expanded.kind === "claim", "claim was not expandable");
    return { recalled: claim.id, evidence: evidence.id };
  }));

  results.push(fixture("stale-claim-sync", () => {
    const before = sh(repo, ["git", "rev-parse", "HEAD"]);
    const claim = appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        type: "repo_state",
        claim: "memory.txt is v1.",
        scope: "repo",
        source_paths: ["memory.txt"],
        confidence: "high"
      }
    });
    commitFile(repo, "memory.txt", "v2\n", "update memory");
    const after = sh(repo, ["git", "rev-parse", "HEAD"]);
    const sync = runMemorySync({ cwd: repo, memoryFile, from: before, to: after, updateBrief: false });
    assert(sync.affected_claim_ids.includes(claim.id), "source claim was not marked by sync");
    return { affected_claim_ids: sync.affected_claim_ids };
  }));

  results.push(fixture("manual-head-drift", () => {
    const before = sh(repo, ["git", "rev-parse", "HEAD"]);
    writeRepoState({
      cwd: repo,
      repoStateFile,
      state: { branch: "main", last_seen_head: before, last_memory_sync_at: null }
    });
    const claim = appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        type: "repo_state",
        claim: "memory.txt is v2.",
        scope: "repo",
        source_paths: ["memory.txt"],
        confidence: "high"
      }
    });
    commitFile(repo, "memory.txt", "v3\n", "manual drift");
    const preflight = runPreflight({ cwd: repo, memoryFile, repoStateFile, allowPull: false });
    assert(preflight.drift_sync.affected_claim_ids.includes(claim.id), "drift sync did not affect claim");
    return { affected_claim_ids: preflight.drift_sync.affected_claim_ids };
  }));

  results.push(fixture("open-loop-resume-history", () => {
    const loop = addOpenLoop({
      cwd: repo,
      taskFile,
      updateBrief: false,
      input: {
        title: "Resume runtime eval",
        scope: "project",
        next_action: "Continue after benchmark mapping.",
        evidence_path: "docs/evals/2026-05-11-memory-public-benchmarks.md"
      }
    });
    updateOpenLoopStatus({
      cwd: repo,
      taskFile,
      updateBrief: false,
      id: loop.id,
      status: "blocked",
      blockedReason: "Waiting on public benchmark notes."
    });
    updateOpenLoopStatus({
      cwd: repo,
      taskFile,
      updateBrief: false,
      id: loop.id,
      status: "open",
      nextAction: "Benchmark notes are in place."
    });
    const listed = listOpenLoops({ cwd: repo, taskFile });
    assert(listed.loops.some((entry) => entry.id === loop.id && entry.status === "open"), "open loop not listed");
    assert(listed.loops[0].history.length >= 3, "open loop history missing transitions");
    return { loop_id: loop.id, history_events: listed.loops[0].history.map((entry) => entry.event) };
  }));

  results.push(fixture("user-correction-retention", () => {
    const claim = appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        type: "incident",
        claim: "User correction: benchmark scores must not compare retrieval recall to QA accuracy.",
        scope: "repo",
        evidence_path: "docs/evals/2026-05-11-memory-public-benchmarks.md",
        confidence: "high"
      }
    });
    const recalled = recallMemory({ cwd: repo, memoryFile, taskFile, evidenceFile, query: "retrieval recall QA accuracy correction" });
    assert(recalled.results.some((result) => result.id === claim.id), "correction incident was not recalled");
    return { recalled: claim.id };
  }));

  results.push(fixture("abstention", () => {
    const recalled = recallMemory({
      cwd: repo,
      memoryFile,
      taskFile,
      evidenceFile,
      query: "zzzz-nonexistent-memory-answer",
      includeTasks: false,
      includeEvidence: false
    });
    assert(recalled.abstained === true, "missing memory did not abstain");
    return { abstained: true };
  }));

  const passed = results.filter((result) => result.pass).length;
  return {
    fixture_count: results.length,
    passed,
    failed: results.length - passed,
    outcome: passed === results.length ? "PASS" : "FAIL",
    results
  };
}

function main() {
  const result = runMemoryRuntimeEval();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.outcome !== "PASS") process.exit(1);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
