import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recallMemory } from "../scripts/memory-recall.mjs";
import { runMemoryMaintain } from "../scripts/memory-maintain.mjs";
import { appendMemoryClaim } from "../scripts/memory-write.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "recall-maintain-"));
}

function write(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
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
