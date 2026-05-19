import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recallMemory } from "../scripts/memory-recall.mjs";
import { runMemoryMaintain } from "../scripts/memory-maintain.mjs";
import { appendMemoryClaim } from "../scripts/memory-write.mjs";
import { addOpenLoop } from "../scripts/open-loop.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "recall-maintain-"));
}

function withTempStateRoot(callback) {
  const previous = process.env.OTH_SKILLS_STATE_DIR;
  const stateRoot = path.join(tempDir(), "state");
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  try {
    return callback(stateRoot);
  } finally {
    if (previous === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previous;
    }
  }
}

function write(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function captureStderr(callback) {
  const originalWrite = process.stderr.write;
  let stderr = "";
  process.stderr.write = (chunk, ...args) => {
    stderr += String(chunk);
    const maybeCallback = args.find((arg) => typeof arg === "function");
    if (maybeCallback) maybeCallback();
    return true;
  };
  try {
    return { result: callback(), stderr };
  } finally {
    process.stderr.write = originalWrite;
  }
}

test("recall --source matches a claim by its source_symbols", () => {
  // PR #21 review NEW2: scoreRecord includes source_symbols in
  // the search text but matchFilters only checks `source_pointers`, which
  // omits source_symbols. So a free-text query for the symbol name finds the
  // claim, but explicit `--source FooBar` returns zero results. The fix
  // surfaces source_symbols in the recall result's source_pointers so the
  // filter sees them.
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  appendMemoryClaim({
    cwd: dir,
    memoryFile,
    updateBrief: false,
    input: {
      type: "decision",
      claim: "Use NormalizeMemoryClaim for write-time schema enforcement.",
      scope: "repo",
      source_symbols: ["NormalizeMemoryClaim"],
      source_paths: ["scripts/memory-write.mjs"],
      confidence: "high"
    }
  });

  const bySymbol = recallMemory({
    cwd: dir,
    memoryFile,
    taskFile: path.join(dir, "tasks.jsonl"),
    evidenceFile: path.join(dir, "events.jsonl"),
    source: "NormalizeMemoryClaim"
  });
  assert.equal(bySymbol.result_count, 1, "expected --source <symbol> to find claim");
  assert.equal(bySymbol.results[0].kind, "claim");
});

test("recall synthesizes routing defaults for legacy project claims", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  appendMemoryClaim({
    cwd: dir,
    memoryFile,
    updateBrief: false,
    input: {
      type: "decision",
      claim: "Legacy project claims remain recallable without routing metadata.",
      scope: "repo",
      evidence_path: "docs/decisions/legacy.md",
      confidence: "high"
    }
  });

  const recall = recallMemory({
    cwd: dir,
    memoryFile,
    taskFile: path.join(dir, "tasks.jsonl"),
    evidenceFile: path.join(dir, "events.jsonl"),
    query: "legacy routing metadata"
  });

  assert.equal(recall.result_count, 1);
  assert.equal(recall.results[0].brain_id, "project");
  assert.equal(recall.results[0].source_id, "project-runtime");
  assert.equal(recall.results[0].subject_key, recall.results[0].id);
  assert.equal(recall.results[0].topic, null);
});

test("default recall searches project memory first, then bounded global memory", () => {
  withTempStateRoot(() => {
    const repo = tempDir();
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "decision",
        claim: "Project memory routing should stay first for repo work.",
        scope: "repo",
        evidence_path: "docs/project.md",
        confidence: "high"
      }
    });
    for (const claim of [
      "Global memory routing source packs are useful across projects.",
      "Global memory routing briefs should be bounded.",
      "Global memory routing stale checks need maintenance."
    ]) {
      appendMemoryClaim({
        cwd: repo,
        updateBrief: false,
        input: {
          type: "external_research",
          claim,
          scope: "global",
          source_id: "memory-systems-world-model",
          evidence_path: "sources/memory-systems/source-pack.jsonl",
          confidence: "high"
        }
      });
    }

    const recall = recallMemory({
      cwd: repo,
      query: "memory routing",
      limit: 5,
      globalLimit: 1,
      includeTasks: false,
      includeEvidence: false
    });

    assert.equal(recall.store_scope, "combined");
    assert.equal(recall.result_count, 2);
    assert.equal(recall.results[0].store_scope, "project");
    assert.equal(recall.results[0].snippet, "Project memory routing should stay first for repo work.");
    assert.equal(recall.results[1].store_scope, "global");
    assert.equal(recall.results[1].source_id, "memory-systems-world-model");
  });
});

test("recall degrades corrupt optional evidence while preserving claim recall", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "tasks.jsonl");
  const evidenceFile = path.join(dir, "events.jsonl");

  appendMemoryClaim({
    cwd: dir,
    memoryFile,
    updateBrief: false,
    input: {
      type: "decision",
      claim: "Optional evidence corruption must not hide recallable project claims.",
      scope: "repo",
      evidence_path: "docs/recall.md",
      confidence: "high"
    }
  });
  fs.writeFileSync(evidenceFile, "{not-jsonl\n");

  const recall = recallMemory({
    cwd: dir,
    memoryFile,
    taskFile,
    evidenceFile,
    query: "optional evidence corruption"
  });

  assert.equal(recall.result_count, 1);
  assert.equal(recall.results[0].kind, "claim");
  assert.equal(recall.degraded_sources.length, 1);
  assert.equal(recall.degraded_sources[0].source, "project_evidence");
  assert.equal(recall.degraded_sources[0].file, evidenceFile);
  assert.match(recall.degraded_sources[0].error, /corrupt JSONL/);
});

test("recall fails loudly when the primary project memory file is corrupt", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  fs.writeFileSync(memoryFile, "{not-jsonl\n");

  assert.throws(
    () => recallMemory({
      cwd: dir,
      memoryFile,
      taskFile: path.join(dir, "tasks.jsonl"),
      evidenceFile: path.join(dir, "events.jsonl"),
      query: "primary memory corruption"
    }),
    /corrupt JSONL/
  );
});

test("recall can search global-only memory and filter by source namespace", () => {
  withTempStateRoot(() => {
    const repo = tempDir();
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Agent memory research belongs to the memory systems source namespace.",
        scope: "global",
        source_id: "memory-systems-world-model",
        evidence_path: "sources/memory-systems/source-pack.jsonl",
        confidence: "high"
      }
    });
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Design systems research belongs to a different source namespace.",
        scope: "global",
        source_id: "design-systems-world-model",
        evidence_path: "sources/design-systems/source-pack.jsonl",
        confidence: "high"
      }
    });

    const recall = recallMemory({
      cwd: repo,
      storeScope: "global",
      sourceId: "memory-systems-world-model",
      query: "research source namespace",
      includeTasks: false,
      includeEvidence: false
    });

    assert.equal(recall.result_count, 1);
    assert.equal(recall.results[0].store_scope, "global");
    assert.equal(recall.results[0].source_id, "memory-systems-world-model");
  });
});

test("recall can include open loops across project runtime directories", () => {
  withTempStateRoot(() => {
    const repoA = tempDir();
    const repoB = tempDir();
    addOpenLoop({
      cwd: repoA,
      input: {
        title: "Cross project loop A",
        scope: "repo",
        next_action: "Finish memory recall in project A.",
        evidence_path: "docs/a.md",
        created_at: "2026-05-11T00:00:00.000Z"
      }
    });
    addOpenLoop({
      cwd: repoB,
      input: {
        title: "Cross project loop B",
        scope: "repo",
        next_action: "Finish memory recall in project B.",
        evidence_path: "docs/b.md",
        created_at: "2026-05-11T00:00:00.000Z"
      }
    });

    const recall = recallMemory({
      cwd: repoA,
      kind: "open_loop",
      query: "cross project loop",
      includeEvidence: false,
      allProjectTasks: true
    });

    assert.equal(recall.result_count, 2);
    assert.deepEqual(recall.results.map((result) => result.id).sort(), [
      "2026-05-11-repo-cross-project-loop-a",
      "2026-05-11-repo-cross-project-loop-b"
    ]);
  });
});

test("recall surfaces subject-key conflicts across project and global claims", () => {
  withTempStateRoot(() => {
    const repo = tempDir();
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "decision",
        claim: "Memory startup should read only project memory.",
        scope: "repo",
        subject_key: "memory-startup-routing",
        evidence_path: "docs/project.md",
        confidence: "medium",
        created_at: "2026-05-11T00:00:00.000Z"
      }
    });
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Memory startup should read project memory and a bounded global brief.",
        scope: "global",
        source_id: "memory-systems-world-model",
        subject_key: "memory-startup-routing",
        evidence_path: "sources/memory-systems/source-pack.jsonl",
        confidence: "high",
        created_at: "2026-05-11T00:00:00.000Z"
      }
    });

    const recall = recallMemory({
      cwd: repo,
      query: "memory startup",
      includeTasks: false,
      includeEvidence: false
    });

    assert.equal(recall.has_conflicts, true);
    assert.equal(recall.conflicts.length, 1);
    assert.equal(recall.conflicts[0].subject_key, "memory-startup-routing");
    assert.equal(recall.conflicts[0].claim_ids.length, 2);
    assert.ok(recall.conflicts[0].claim_ids.includes("2026-05-11-decision-memory-startup-should-read-only-project-memory"));
    assert.ok(recall.conflicts[0].claim_ids.some((id) => (
      id.startsWith("2026-05-11-external_research-memory-startup-should-read-project-memory-and-a-bounded-global")
    )));
  });
});

test("memory-maintain --apply is idempotent — a second run produces no actions and preserves marked_at", () => {
  // PR #21 review NEW1: pre-fix, --apply re-marked every
  // duplicate tail on every run and overwrote `review.marked_at`. Running
  // maintain twice in a CI loop or after a manual sweep created spurious
  // review-history churn and made `marked_at` an unreliable freshness
  // signal.

  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "tasks.jsonl");
  const briefFile = path.join(dir, "brief.md");
  const repoStateFile = path.join(dir, "state.json");

  // Two identical claim texts trigger duplicate detection.
  write(memoryFile, {
    id: "first",
    type: "decision",
    claim: "Use atomic JSONL writes for memory state.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    last_confirmed_at: "2026-01-01T00:00:00.000Z",
    confidence: "high",
    evidence_path: "scripts/lib/jsonl.mjs"
  });
  write(memoryFile, {
    id: "second",
    type: "decision",
    claim: "Use atomic JSONL writes for memory state.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-02T00:00:00.000Z",
    last_confirmed_at: "2026-01-02T00:00:00.000Z",
    confidence: "high",
    evidence_path: "scripts/lib/jsonl.mjs"
  });

  const firstApply = runMemoryMaintain({
    cwd: dir,
    memoryFile,
    taskFile,
    briefFile,
    repoStateFile,
    apply: true,
    maintainedAt: "2026-01-10T00:00:00.000Z"
  });
  assert.equal(firstApply.actions.length, 1, "first apply should mark one duplicate");

  const afterFirst = fs.readFileSync(memoryFile, "utf8");

  const secondApply = runMemoryMaintain({
    cwd: dir,
    memoryFile,
    taskFile,
    briefFile,
    repoStateFile,
    apply: true,
    maintainedAt: "2026-01-20T00:00:00.000Z"
  });
  assert.equal(secondApply.actions.length, 0, "second apply must be a no-op — already-marked duplicates should not be re-touched");

  const afterSecond = fs.readFileSync(memoryFile, "utf8");
  assert.equal(afterFirst, afterSecond, "second apply must leave the JSONL byte-identical");
});

test("memory-maintain emits a stderr marker when brief regeneration fails after apply", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "tasks.jsonl");
  const repoStateFile = path.join(dir, "state.json");
  fs.writeFileSync(path.join(dir, "brief-blocker"), "");
  const briefFile = path.join(dir, "brief-blocker", "brief.md");

  write(memoryFile, {
    id: "first",
    type: "decision",
    claim: "Brief failures should be visible after maintain mutates claims.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    last_confirmed_at: "2026-01-01T00:00:00.000Z",
    confidence: "high",
    evidence_path: "scripts/lib/jsonl.mjs"
  });
  write(memoryFile, {
    id: "second",
    type: "decision",
    claim: "Brief failures should be visible after maintain mutates claims.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-02T00:00:00.000Z",
    last_confirmed_at: "2026-01-02T00:00:00.000Z",
    confidence: "high",
    evidence_path: "scripts/lib/jsonl.mjs"
  });

  const { result, stderr } = captureStderr(() => runMemoryMaintain({
    cwd: dir,
    memoryFile,
    taskFile,
    briefFile,
    repoStateFile,
    apply: true,
    includeGlobal: false,
    maintainedAt: "2026-01-10T00:00:00.000Z"
  }));

  assert.equal(result.actions.length, 1);
  assert.equal(result.brief_updated, false);
  assert.ok(result.brief_error);
  assert.match(stderr, /brief-regeneration-failed:/);
});

test("memory-maintain warns when git state cannot be read for repo drift", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "tasks.jsonl");
  const briefFile = path.join(dir, "brief.md");
  const repoStateFile = path.join(dir, "state.json");
  write(memoryFile, {
    id: "only",
    type: "decision",
    claim: "Repo drift warnings should surface git failures.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    last_confirmed_at: "2026-01-01T00:00:00.000Z",
    confidence: "high",
    evidence_path: "scripts/memory-maintain.mjs"
  });
  fs.writeFileSync(repoStateFile, JSON.stringify({ last_seen_head: "abc123" }) + "\n");

  const { result, stderr } = captureStderr(() => runMemoryMaintain({
    cwd: dir,
    memoryFile,
    taskFile,
    briefFile,
    repoStateFile,
    includeGlobal: false
  }));

  assert.deepEqual(result.findings.repo_drift, []);
  assert.match(stderr, /warning: git rev-parse failed|repo_drift signal will be incomplete/);
});

test("memory-maintain dry-run leaves the JSONL byte-identical", () => {
  // Companion to the idempotency test — pre-fix the test at
  // tests/memory-runtime-hardening.test.mjs:322-330 could not distinguish
  // "dry-run preserved the file" from "dry-run wrote it but apply wrote
  // the same thing." Pin the invariant explicitly.

  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "tasks.jsonl");
  const briefFile = path.join(dir, "brief.md");
  const repoStateFile = path.join(dir, "state.json");

  write(memoryFile, {
    id: "a",
    type: "decision",
    claim: "Dry-run must not mutate.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    last_confirmed_at: "2026-01-01T00:00:00.000Z",
    confidence: "high",
    evidence_path: "missing.md"
  });
  write(memoryFile, {
    id: "b",
    type: "decision",
    claim: "Dry-run must not mutate.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-02T00:00:00.000Z",
    last_confirmed_at: "2026-01-02T00:00:00.000Z",
    confidence: "high",
    evidence_path: "missing.md"
  });
  const before = fs.readFileSync(memoryFile, "utf8");

  runMemoryMaintain({
    cwd: dir,
    memoryFile,
    taskFile,
    briefFile,
    repoStateFile,
    apply: false,
    maintainedAt: "2026-01-10T00:00:00.000Z"
  });
  const after = fs.readFileSync(memoryFile, "utf8");
  assert.equal(before, after, "dry-run must leave the memory file byte-identical");
});

test("memory-maintain reports global stale claims, source-pack expiry, conflicts, and orphan links", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const globalMemoryFile = path.join(stateRoot, "global", "memory", "claims.jsonl");
    const sourceIndexFile = path.join(stateRoot, "global", "sources", "index.jsonl");
    write(globalMemoryFile, {
      id: "stale-global",
      type: "external_research",
      claim: "Stale global claim.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems",
      evidence_path: "sources/memory/source-pack.jsonl",
      last_confirmed_at: "2026-01-01T00:00:00.000Z",
      stale_after_days: 30
    });
    write(globalMemoryFile, {
      id: "dup-a",
      type: "external_research",
      claim: "Duplicate global claim.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems",
      evidence_path: "sources/memory/source-pack.jsonl"
    });
    write(globalMemoryFile, {
      id: "dup-b",
      type: "external_research",
      claim: "Duplicate global claim.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems",
      evidence_path: "sources/memory/source-pack.jsonl"
    });
    write(globalMemoryFile, {
      id: "conflict-a",
      type: "external_research",
      claim: "Startup reads project memory only.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "medium",
      source_id: "memory-systems",
      subject_key: "startup-routing",
      evidence_path: "sources/memory/source-pack.jsonl",
      related_ids: ["missing-link"]
    });
    write(globalMemoryFile, {
      id: "conflict-b",
      type: "external_research",
      claim: "Startup reads project memory plus bounded global memory.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems",
      subject_key: "startup-routing",
      evidence_path: "missing/source-pack.jsonl"
    });
    write(sourceIndexFile, {
      id: "expired-source-pack",
      source_id: "memory-systems",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      stale_after_days: 30,
      source_pack_file: "packs/expired-source-pack.jsonl",
      chunk_count: 1
    });

    const result = runMemoryMaintain({
      cwd: repo,
      maintainedAt: "2026-03-15T00:00:00.000Z"
    });

    assert.deepEqual(result.findings.global.stale_claims.map((entry) => entry.id), ["stale-global"]);
    assert.deepEqual(result.findings.global.duplicate_candidates, [
      { claim: "duplicate global claim.", ids: ["dup-a", "dup-b"] }
    ]);
    assert.deepEqual(result.findings.global.expired_source_packs.map((entry) => entry.id), ["expired-source-pack"]);
    assert.deepEqual(result.findings.global.orphan_links, [
      { id: "conflict-a", missing_id: "missing-link" }
    ]);
    assert.deepEqual(result.findings.global.conflicts[0].ids.sort(), ["conflict-a", "conflict-b"]);
    assert.deepEqual(
      result.findings.global.missing_sources.map((entry) => ({ id: entry.id, missing_path: entry.missing_path })),
      [{ id: "conflict-b", missing_path: "missing/source-pack.jsonl" }]
    );
    assert.equal(result.findings.global.missing_sources[0].field, "evidence_path");
    assert.equal(result.findings.global.missing_sources[0].owner_context.owner_project_key, null);
  });
});

test("memory-maintain --apply marks global claims conservatively and never deletes source packs", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const globalMemoryFile = path.join(stateRoot, "global", "memory", "claims.jsonl");
    const sourceIndexFile = path.join(stateRoot, "global", "sources", "index.jsonl");
    const sourcePackFile = path.join(stateRoot, "global", "sources", "packs", "expired-source-pack.jsonl");
    write(globalMemoryFile, {
      id: "stale-global",
      type: "external_research",
      claim: "Stale global claim.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems",
      evidence_path: "sources/memory/source-pack.jsonl",
      last_confirmed_at: "2026-01-01T00:00:00.000Z",
      stale_after_days: 30
    });
    write(globalMemoryFile, {
      id: "dup-a",
      type: "external_research",
      claim: "Duplicate global claim.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems",
      evidence_path: "sources/memory/source-pack.jsonl"
    });
    write(globalMemoryFile, {
      id: "dup-b",
      type: "external_research",
      claim: "Duplicate global claim.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "memory-systems",
      evidence_path: "sources/memory/source-pack.jsonl"
    });
    write(sourceIndexFile, {
      id: "expired-source-pack",
      source_id: "memory-systems",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      stale_after_days: 30,
      source_pack_file: "packs/expired-source-pack.jsonl",
      chunk_count: 1
    });
    write(sourcePackFile, {
      id: "chunk-1",
      text: "Verbatim source material must not be deleted by maintenance.",
      content_hash: "hash"
    });

    const result = runMemoryMaintain({
      cwd: repo,
      maintainedAt: "2026-03-15T00:00:00.000Z",
      apply: true
    });
    const claims = readJsonl(globalMemoryFile);

    assert.equal(result.actions.some((action) => action.id === "stale-global" && action.action === "marked_needs_review"), true);
    assert.equal(claims.find((claim) => claim.id === "stale-global").lifecycle_state, "needs_review");
    assert.equal(claims.find((claim) => claim.id === "dup-b").lifecycle_state, "needs_review");
    assert.equal(fs.existsSync(sourceIndexFile), true);
    assert.equal(fs.existsSync(sourcePackFile), true);
  });
});
