import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { appendMemoryClaim, normalizeMemoryClaim } from "../scripts/memory-write.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-write-"));
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("normalizeMemoryClaim validates required memory contract fields", () => {
  assert.throws(
    () => normalizeMemoryClaim({ type: "decision", claim: "x", confidence: "high" }),
    /evidence_path or at least one source_path/
  );
  assert.throws(
    () => normalizeMemoryClaim({
      type: "other",
      claim: "x",
      evidence_path: "docs/x.md",
      confidence: "high"
    }),
    /type must be one of/
  );
  assert.throws(
    () => normalizeMemoryClaim({
      type: "decision",
      claim: "x",
      evidence_path: "docs/x.md"
    }),
    /confidence or review_caveat/
  );
});

test("appendMemoryClaim writes a schema-normalized claim and regenerates the brief", () => {
  const repo = tempDir();
  const memoryFile = path.join(repo, ".0th", "memory", "claims.jsonl");
  const briefFile = path.join(repo, ".0th", "memory", "brief.md");

  const result = appendMemoryClaim({
    cwd: repo,
    now: new Date("2026-05-10T21:00:00.000Z"),
    input: {
      type: "decision",
      claim: "Use canonical memory-write for durable Memory v2 claims.",
      scope: "repo",
      evidence_path: "docs/decisions/memory.md",
      source_paths: ["scripts/memory-write.mjs", "scripts/memory-write.mjs"],
      confidence: "high"
    }
  });

  const [claim] = readJsonl(memoryFile);
  const brief = fs.readFileSync(briefFile, "utf8");

  assert.equal(result.written, true);
  assert.equal(result.brief_updated, true);
  assert.equal(claim.id, "2026-05-10-decision-use-canonical-memory-write-for-durable-memory-v2-claims");
  assert.equal(claim.type, "decision");
  assert.equal(claim.lifecycle_state, "active");
  assert.equal(claim.created_at, "2026-05-10T21:00:00.000Z");
  assert.deepEqual(claim.source_paths, ["scripts/memory-write.mjs"]);
  assert.match(brief, /Use canonical memory-write/);
});

test("appendMemoryClaim refuses duplicate explicit ids", () => {
  const repo = tempDir();
  const memoryFile = path.join(repo, ".0th", "memory", "claims.jsonl");
  const input = {
    id: "memory-v2-writer",
    type: "decision",
    claim: "Use canonical memory-write.",
    scope: "repo",
    evidence_path: "docs/decisions/memory.md",
    confidence: "high"
  };

  appendMemoryClaim({ cwd: repo, memoryFile, input });
  assert.throws(
    () => appendMemoryClaim({ cwd: repo, memoryFile, input }),
    /memory id already exists/
  );
});

test("memory write CLI appends a claim and writes JSON output", () => {
  const repo = tempDir();
  const memoryFile = path.join(repo, "claims.jsonl");
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts/memory-write.mjs"),
      "--memory-file",
      memoryFile,
      "--no-brief",
      "--type",
      "root_cause",
      "--claim",
      "Failure came from stale repo state.",
      "--scope",
      "repo",
      "--source-path",
      "scripts/session-preflight.mjs",
      "--confidence",
      "medium"
    ],
    { cwd: repo, encoding: "utf8" }
  );

  const result = JSON.parse(stdout);
  const [claim] = readJsonl(memoryFile);

  assert.equal(result.written, true);
  assert.equal(result.brief_updated, false);
  assert.equal(result.type, "root_cause");
  assert.equal(claim.claim, "Failure came from stale repo state.");
});

test("appendMemoryClaim persists the claim even when brief generation fails (no duplicate-id trap)", () => {
  // Defense-in-depth for the PR #19 silent-failure: runBriefGeneration runs
  // AFTER the JSONL append. If it threw, the previous version dumped a stack
  // trace and exited 1 — the caller saw "failed" but the claim was already
  // on disk. Retrying then collided on uniqueId. Now we capture the brief
  // error and report success on the claim, with brief_error on the record.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-write-brief-fail-"));
  const memoryFile = path.join(dir, "claims.jsonl");

  // Force brief generation to fail by pointing briefFile at a path whose
  // parent is a non-directory (a file we create with the same name).
  fs.writeFileSync(path.join(dir, "brief-blocker"), "");
  const briefFile = path.join(dir, "brief-blocker", "brief.md"); // parent is a file

  const result = appendMemoryClaim({
    cwd: dir,
    memoryFile,
    briefFile,
    input: {
      type: "decision",
      claim: "Brief regeneration failure must not trap the user.",
      scope: "repo",
      evidence_path: "docs/pr19.md",
      confidence: "high"
    }
  });

  assert.equal(result.written, true, "claim must persist even when brief fails");
  assert.equal(result.brief_updated, false, "brief_updated must be false on failure");
  assert.ok(result.brief_error, "brief_error must be populated, not swallowed");
  assert.ok(
    fs.existsSync(memoryFile),
    "claims.jsonl must exist after partial-success path"
  );
});
