#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { addEvidenceRecord } from "./evidence.mjs";
import { appendMemoryClaim } from "./memory-write.mjs";
import { expandMemory, recallMemory } from "./memory-recall.mjs";
import { runMemoryMaintain } from "./memory-maintain.mjs";
import { runMemorySync } from "./memory-sync.mjs";
import { addOpenLoop, listOpenLoops, updateOpenLoopStatus } from "./open-loop.mjs";
import { writeRepoState } from "./repo-state.mjs";
import { runPreflight } from "./session-preflight.mjs";
import { hashSourceChunk, ingestSourcePack } from "./source-pack.mjs";
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

function appendJsonl(filePath, record) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function writeIncident(dir, filename, fields) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), [
    "---",
    ...Object.entries(fields).map(([key, value]) => Array.isArray(value) ? `${key}: [${value.join(", ")}]` : `${key}: ${value}`),
    "---",
    "",
    "## Correction evidence",
    "This body must not be copied into Memory v2."
  ].join("\n"));
}

export function runMemoryRuntimeEval() {
  const repo = tempRepo();
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-runtime-eval-state-"));
  const memoryFile = path.join(runtimeDir, "claims.jsonl");
  const taskFile = path.join(runtimeDir, "open-loops.jsonl");
  const evidenceFile = path.join(runtimeDir, "events.jsonl");
  const repoStateFile = path.join(runtimeDir, "repo-state.json");
  const globalMemoryFile = path.join(runtimeDir, "global", "memory", "claims.jsonl");
  const sourceRoot = path.join(runtimeDir, "global", "sources");
  const sourceIndexFile = path.join(sourceRoot, "index.jsonl");
  const previousStateRoot = process.env.OTH_SKILLS_STATE_DIR;
  process.env.OTH_SKILLS_STATE_DIR = runtimeDir;

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

  results.push(fixture("global-write-scoped-recall", () => {
    const claim = appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Global runtime eval writes source-backed reusable memory.",
        scope: "global",
        source_id: "memory-systems-world-model",
        evidence_path: "sources/memory/source-pack.jsonl",
        confidence: "high"
      }
    });
    const recalled = recallMemory({
      cwd: repo,
      storeScope: "global",
      memoryFile: globalMemoryFile,
      query: "source-backed reusable memory",
      includeTasks: false,
      includeEvidence: false
    });
    assert(recalled.results.some((result) => result.id === claim.id), "global claim was not recalled");
    assert(recalled.results.every((result) => result.store_scope === "global"), "global-only recall leaked project results");
    return { recalled: claim.id, store_scope: recalled.store_scope };
  }));

  results.push(fixture("project-global-conflict", () => {
    appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        type: "decision",
        claim: "Runtime eval startup reads project memory only.",
        scope: "repo",
        subject_key: "runtime-eval-startup",
        evidence_path: "docs/runtime-eval.md",
        confidence: "medium"
      }
    });
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Runtime eval startup reads project memory plus bounded global memory.",
        scope: "global",
        source_id: "memory-systems-world-model",
        subject_key: "runtime-eval-startup",
        evidence_path: "sources/memory/source-pack.jsonl",
        confidence: "high"
      }
    });
    const recalled = recallMemory({
      cwd: repo,
      storeScope: "combined",
      memoryFile,
      globalMemoryFile,
      query: "runtime eval startup memory",
      includeTasks: false,
      includeEvidence: false
    });
    assert(recalled.has_conflicts, "project/global conflict was not surfaced");
    return { conflicts: recalled.conflicts.map((entry) => entry.subject_key) };
  }));

  results.push(fixture("source-pack-fidelity", () => {
    const text = "Source-pack fidelity fixture keeps verbatim text.";
    const sourcePointer = { kind: "note", id: "runtime-eval-source-pack" };
    const ingested = ingestSourcePack({
      cwd: repo,
      sourceRoot,
      input: {
        id: "runtime-eval-source-pack",
        source_id: "runtime-eval-source-pack",
        chunks: [
          {
            id: "runtime-eval-chunk",
            text,
            source_pointer: sourcePointer,
            summary: "Round-trip source-pack fidelity."
          }
        ]
      }
    });
    const expanded = expandMemory({
      cwd: repo,
      sourceRoot,
      sourceIndexFile,
      id: "runtime-eval-source-pack"
    });
    const [chunk] = expanded.record.chunks;
    assert(expanded.kind === "source_pack", "source pack did not expand by id");
    assert(chunk.text === text, "source chunk text did not round-trip");
    assert(chunk.content_hash === hashSourceChunk({
      text,
      source_pointer: sourcePointer,
      redaction_status: "no_secrets_observed"
    }), "source chunk hash did not round-trip");
    return { source_pack: ingested.id, content_hash: chunk.content_hash };
  }));

  results.push(fixture("stale-global-maintenance", () => {
    appendJsonl(globalMemoryFile, {
      id: "runtime-eval-stale-global",
      type: "external_research",
      claim: "Runtime eval stale global claim.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems-world-model",
      evidence_path: "sources/memory/source-pack.jsonl",
      last_confirmed_at: "2026-01-01T00:00:00.000Z",
      stale_after_days: 30
    });
    const maintained = runMemoryMaintain({
      cwd: repo,
      memoryFile,
      taskFile,
      repoStateFile,
      globalMemoryFile,
      sourceIndexFile,
      maintainedAt: "2026-03-15T00:00:00.000Z"
    });
    assert(
      maintained.findings.global.stale_claims.some((entry) => entry.id === "runtime-eval-stale-global"),
      "stale global claim was not reported"
    );
    return { stale_claims: maintained.findings.global.stale_claims.map((entry) => entry.id) };
  }));

  results.push(fixture("no-obsidian-dependency", () => {
    const previousKbRoot = process.env.KB_ROOT;
    delete process.env.KB_ROOT;
    try {
      const recalled = recallMemory({
        cwd: repo,
        memoryFile,
        taskFile,
        evidenceFile,
        query: "source-backed memory",
        includeTasks: false,
        includeEvidence: false
      });
      assert(recalled.result_count > 0, "runtime recall should not require KB_ROOT or Obsidian");
      assert(!JSON.stringify(recalled).toLowerCase().includes("obsidian"), "runtime recall leaked an Obsidian dependency");
      return { kb_root_required: false, obsidian_dependency: false };
    } finally {
      if (previousKbRoot === undefined) {
        delete process.env.KB_ROOT;
      } else {
        process.env.KB_ROOT = previousKbRoot;
      }
    }
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

  results.push(fixture("non-repo-preflight-advisory", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-workspace-"));
    const child = path.join(workspace, "child-repo");
    fs.mkdirSync(child);
    sh(child, ["git", "init", "-b", "main"]);
    sh(child, ["git", "config", "user.email", "test@example.com"]);
    sh(child, ["git", "config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(child, "README.md"), "child\n");
    sh(child, ["git", "add", "."]);
    sh(child, ["git", "commit", "-m", "initial"]);
    const preflight = runPreflight({ cwd: workspace, repoStateFile: path.join(workspace, "state.json") });
    assert(preflight.action === "not_a_repo", "non-repo preflight did not return advisory action");
    assert(preflight.advisory.candidate_repos.some((entry) => entry.path === child), "child repo candidate missing");
    return { action: preflight.action, candidate_count: preflight.advisory.candidate_repos.length };
  }));

  results.push(fixture("owner-context-global-evidence", () => {
    const otherRepo = tempRepo();
    const evidenceRel = "docs/goals/runtime-report.md";
    fs.mkdirSync(path.join(repo, "docs/goals"), { recursive: true });
    fs.writeFileSync(path.join(repo, evidenceRel), "runtime report\n");
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Runtime eval global evidence resolves through owner context.",
        scope: "global",
        source_id: "runtime-eval-owner-context",
        evidence_path: evidenceRel,
        confidence: "high"
      }
    });
    const maintained = runMemoryMaintain({ cwd: otherRepo, memoryFile, taskFile, repoStateFile, globalMemoryFile, sourceIndexFile });
    assert(maintained.findings.global.missing_sources.length === 0, "owner-context global evidence was reported missing");
    return { missing_global_sources: maintained.findings.global.missing_sources.length };
  }));

  results.push(fixture("raw-archived-relocation", () => {
    const rawRel = "research/topic/raw/2026-05-19-note.md";
    const archivedRel = "research/topic/raw/archived/2026-05-19-note.md";
    fs.mkdirSync(path.dirname(path.join(repo, archivedRel)), { recursive: true });
    fs.writeFileSync(path.join(repo, archivedRel), "archived\n");
    appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        id: "runtime-eval-relocation",
        type: "external_research",
        claim: "Runtime eval raw notes can move to archived raw.",
        scope: "repo",
        evidence_path: rawRel,
        confidence: "high"
      }
    });
    const maintained = runMemoryMaintain({ cwd: repo, memoryFile, taskFile, repoStateFile, globalMemoryFile, sourceIndexFile, apply: true });
    const claim = readJsonl(memoryFile).find((entry) => entry.id === "runtime-eval-relocation");
    assert(claim.evidence_path === archivedRel, "relocation was not applied");
    return { relocated_to: claim.evidence_path, actions: maintained.actions.map((entry) => entry.action) };
  }));

  results.push(fixture("retro-incident-import", () => {
    const incidentDir = path.join(repo, "kb", "learning", "skill-incidents");
    for (const index of [1, 2, 3]) {
      writeIncident(incidentDir, `incident-${index}.md`, {
        date: `2026-05-1${index}T12:00:00-05:00`,
        skill: "general-agent",
        classification: "verification-skipped",
        severity: "moderate",
        tags: ["visual-verification"]
      });
    }
    const maintained = runMemoryMaintain({ cwd: repo, memoryFile, taskFile, repoStateFile, globalMemoryFile, sourceIndexFile, incidentDir, apply: true });
    const incidents = readJsonl(memoryFile).filter((entry) => entry.type === "incident");
    assert(incidents.length > 0, "incident pattern was not imported");
    assert(!JSON.stringify(incidents).includes("This body must not be copied"), "incident body leaked into memory");
    return { imported_actions: maintained.actions.filter((entry) => entry.action === "imported_incident_pattern").length };
  }));

  results.push(fixture("partial-readiness-and-hygiene", () => {
    fs.writeFileSync(path.join(repo, "CLAUDE.md"), "Read index.md at session start. Always.\n");
    fs.writeFileSync(path.join(repo, "error.log"), "generated log\n");
    const maintained = runMemoryMaintain({ cwd: repo, memoryFile, taskFile, repoStateFile, globalMemoryFile, sourceIndexFile });
    assert(maintained.findings.instruction_drift.length > 0, "instruction drift not reported");
    assert(maintained.findings.local_artifacts.length > 0, "local artifact noise not reported");
    return {
      instruction_drift: maintained.findings.instruction_drift.length,
      local_artifacts: maintained.findings.local_artifacts.length
    };
  }));

  const passed = results.filter((result) => result.pass).length;
  const report = {
    fixture_count: results.length,
    passed,
    failed: results.length - passed,
    outcome: passed === results.length ? "PASS" : "FAIL",
    results
  };
  if (previousStateRoot === undefined) {
    delete process.env.OTH_SKILLS_STATE_DIR;
  } else {
    process.env.OTH_SKILLS_STATE_DIR = previousStateRoot;
  }
  return report;
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
