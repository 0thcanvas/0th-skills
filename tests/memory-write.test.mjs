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

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("normalizeMemoryClaim validates required memory contract fields", () => {
  assert.throws(
    () => normalizeMemoryClaim({ type: "decision", claim: "x", confidence: "high" }),
    /evidence_path, evidence_id, or at least one source_path/
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
  withTempStateRoot(() => {
    const repo = tempDir();

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

    const [claim] = readJsonl(result.memory_file);
    const brief = fs.readFileSync(result.brief_file, "utf8");

    assert.equal(result.written, true);
    assert.equal(result.brief_updated, true);
    assert.equal(result.memory_file.startsWith(path.join(repo, ".0th")), false);
    assert.equal(claim.id, "2026-05-10-decision-use-canonical-memory-write-for-durable-memory-v2-claims");
    assert.equal(claim.type, "decision");
    assert.equal(claim.lifecycle_state, "active");
    assert.equal(claim.created_at, "2026-05-10T21:00:00.000Z");
    assert.deepEqual(claim.source_paths, ["scripts/memory-write.mjs"]);
    assert.match(brief, /Use canonical memory-write/);
  });
});

test("appendMemoryClaim default stores runtime state outside the project checkout", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const result = appendMemoryClaim({
      cwd: repo,
      now: new Date("2026-05-11T01:00:00.000Z"),
      input: {
        type: "repo_state",
        claim: "Memory v2 runtime state belongs to user state, not the product repo.",
        scope: "repo",
        evidence_path: "references/memory-contract.md",
        confidence: "high"
      }
    });

    assert.ok(result.memory_file.startsWith(stateRoot));
    assert.ok(result.brief_file.startsWith(stateRoot));
    assert.equal(fs.existsSync(path.join(repo, ".0th")), false);
    assert.equal(fs.existsSync(result.memory_file), true);
  });
});

test("appendMemoryClaim routes global-scope claims to the global brain", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const result = appendMemoryClaim({
      cwd: repo,
      now: new Date("2026-05-11T12:00:00.000Z"),
      input: {
        type: "external_research",
        claim: "Global memory source packs preserve verbatim chunks and hashes.",
        scope: "global",
        source_id: "memory-systems-world-model",
        evidence_path: "sources/memory-systems/source-pack.jsonl",
        confidence: "high"
      }
    });

    const [claim] = readJsonl(result.memory_file);

    assert.equal(result.memory_file, path.join(stateRoot, "global", "memory", "claims.jsonl"));
    assert.equal(result.brief_file, path.join(stateRoot, "global", "memory", "brief.md"));
    assert.equal(claim.scope, "global");
    assert.equal(claim.source_id, "memory-systems-world-model");
    assert.equal(fs.existsSync(path.join(stateRoot, "projects")), false);
  });
});

test("appendMemoryClaim refuses global claims without an explicit source namespace", () => {
  const repo = tempDir();
  const memoryFile = path.join(repo, "claims.jsonl");

  assert.throws(
    () => appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Global claims need a source namespace.",
        scope: "global",
        evidence_path: "sources/memory-systems/source-pack.jsonl",
        confidence: "high"
      }
    }),
    /global memory claims require source_id/
  );
  assert.equal(fs.existsSync(memoryFile), false);
});

test("memory claims preserve global routing and provenance fields", () => {
  const repo = tempDir();
  const memoryFile = path.join(repo, "claims.jsonl");

  appendMemoryClaim({
    cwd: repo,
    memoryFile,
    updateBrief: false,
    now: new Date("2026-05-11T13:00:00.000Z"),
    input: {
      type: "external_research",
      claim: "Brain/source routing separates storage owner from knowledge namespace.",
      scope: "global",
      brain_id: "global",
      source_id: "memory-systems-world-model",
      topic: "agent-memory",
      subject_key: "memory-routing",
      owner_project_key: "0th-skills",
      related_ids: ["source-pack-memory-systems"],
      evidence_path: "sources/memory-systems/source-pack.jsonl",
      confidence: "high"
    }
  });

  const [claim] = readJsonl(memoryFile);
  assert.equal(claim.brain_id, "global");
  assert.equal(claim.source_id, "memory-systems-world-model");
  assert.equal(claim.topic, "agent-memory");
  assert.equal(claim.subject_key, "memory-routing");
  assert.equal(claim.owner_project_key, "0th-skills");
  assert.deepEqual(claim.related_ids, ["source-pack-memory-systems"]);
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
