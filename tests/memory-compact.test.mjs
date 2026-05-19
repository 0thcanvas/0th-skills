import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { compactMemoryClaims } from "../scripts/memory-compact.mjs";
import { generateBrief } from "../scripts/memory-brief.mjs";
import { appendMemoryClaim } from "../scripts/memory-write.mjs";
import { runMemoryCommand } from "../scripts/memory.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-compact-"));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function initRepo() {
  const repo = tempDir();
  execFileSync("git", ["init", "-b", "main"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repo, stdio: "ignore" });
  fs.writeFileSync(path.join(repo, "README.md"), "fixture\n");
  execFileSync("git", ["add", "."], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: repo, stdio: "ignore" });
  return repo;
}

test("compactMemoryClaims writes a summary and supersedes the original claims without deleting them", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");
  const briefFile = path.join(repo, "brief.md");

  appendMemoryClaim({
    cwd: repo,
    memoryFile,
    briefFile,
    updateBrief: false,
    now: new Date("2026-05-01T00:00:00.000Z"),
    input: {
      id: "old-a",
      type: "observation",
      claim: "Old memory A repeats the same operational lesson.",
      scope: "repo",
      evidence_path: "docs/evals/a.md",
      confidence: "medium"
    }
  });
  appendMemoryClaim({
    cwd: repo,
    memoryFile,
    briefFile,
    updateBrief: false,
    now: new Date("2026-05-02T00:00:00.000Z"),
    input: {
      id: "old-b",
      type: "observation",
      claim: "Old memory B repeats the same operational lesson.",
      scope: "repo",
      evidence_path: "docs/evals/b.md",
      confidence: "medium"
    }
  });

  const result = compactMemoryClaims({
    cwd: repo,
    memoryFile,
    briefFile,
    ids: ["old-a", "old-b"],
    now: new Date("2026-05-19T00:00:00.000Z"),
    input: {
      id: "summary",
      type: "observation",
      claim: "Compacted memory summarizes the repeated operational lesson.",
      scope: "repo",
      evidence_path: "docs/decisions/memory-compaction.md",
      confidence: "high"
    }
  });
  const claims = readJsonl(memoryFile);
  const summary = claims.find((claim) => claim.id === "summary");
  const originalA = claims.find((claim) => claim.id === "old-a");
  const originalB = claims.find((claim) => claim.id === "old-b");
  const brief = fs.readFileSync(briefFile, "utf8");

  assert.equal(result.summary_id, "summary");
  assert.equal(result.written, true);
  assert.equal(result.brief_updated, true);
  assert.equal(claims.length, 3);
  assert.deepEqual(summary.supersedes, ["old-a", "old-b"]);
  assert.equal(originalA.lifecycle_state, "superseded");
  assert.equal(originalB.lifecycle_state, "superseded");
  assert.deepEqual(originalA.superseded_by, ["summary"]);
  assert.equal(originalA.compacted_at, "2026-05-19T00:00:00.000Z");
  assert.match(brief, /Compacted memory summarizes/);
  assert.doesNotMatch(brief, /Old memory A repeats/);
  assert.doesNotMatch(brief, /Old memory B repeats/);
});

test("compactMemoryClaims dry-run previews without mutating memory or brief", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");
  const briefFile = path.join(repo, "brief.md");

  for (const id of ["old-a", "old-b"]) {
    appendMemoryClaim({
      cwd: repo,
      memoryFile,
      briefFile,
      updateBrief: false,
      input: {
        id,
        type: "decision",
        claim: `${id} should remain active before dry-run compaction.`,
        scope: "repo",
        evidence_path: `docs/${id}.md`,
        confidence: "high"
      }
    });
  }
  fs.writeFileSync(briefFile, "ORIGINAL BRIEF\n");
  const before = fs.readFileSync(memoryFile, "utf8");

  const result = compactMemoryClaims({
    cwd: repo,
    memoryFile,
    briefFile,
    ids: ["old-a", "old-b"],
    dryRun: true,
    input: {
      id: "summary",
      type: "decision",
      claim: "Dry-run summary should not be persisted.",
      scope: "repo",
      evidence_path: "docs/summary.md",
      confidence: "high"
    }
  });

  assert.equal(result.dry_run, true);
  assert.equal(result.written, false);
  assert.equal(fs.readFileSync(memoryFile, "utf8"), before);
  assert.equal(fs.readFileSync(briefFile, "utf8"), "ORIGINAL BRIEF\n");
});

test("compactMemoryClaims refuses ambiguous or missing compaction targets", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");

  assert.throws(
    () => compactMemoryClaims({
      cwd: repo,
      memoryFile,
      ids: ["only-one"],
      input: {
        type: "observation",
        claim: "Single claim compaction should be explicit elsewhere.",
        scope: "repo",
        evidence_path: "docs/x.md",
        confidence: "high"
      }
    }),
    /at least two claim ids/
  );

  assert.throws(
    () => compactMemoryClaims({
      cwd: repo,
      memoryFile,
      ids: ["missing-a", "missing-b"],
      input: {
        type: "observation",
        claim: "Missing claims cannot be compacted.",
        scope: "repo",
        evidence_path: "docs/x.md",
        confidence: "high"
      }
    }),
    /cannot compact missing claim ids/
  );
});

test("memory command routes compact and consolidate aliases", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");

  for (const id of ["old-a", "old-b"]) {
    appendMemoryClaim({
      cwd: repo,
      memoryFile,
      updateBrief: false,
      input: {
        id,
        type: "observation",
        claim: `${id} can be compacted through the command router.`,
        scope: "repo",
        evidence_path: `docs/${id}.md`,
        confidence: "high"
      }
    });
  }

  assert.match(runMemoryCommand(["--help"], { cwd: repo }), /compact/);
  const output = runMemoryCommand([
    "consolidate",
    "--memory-file",
    memoryFile,
    "--no-brief",
    "--ids",
    "old-a,old-b",
    "--type",
    "observation",
    "--claim",
    "Command-routed compaction works.",
    "--scope",
    "repo",
    "--evidence-path",
    "docs/summary.md",
    "--confidence",
    "high"
  ], { cwd: repo });
  const result = JSON.parse(output);
  const claims = readJsonl(memoryFile);

  assert.equal(result.written, true);
  assert.equal(claims.find((claim) => claim.claim === "Command-routed compaction works.").supersedes.length, 2);
});

test("generated briefs omit superseded claims", () => {
  const brief = generateBrief([
    {
      id: "old",
      type: "decision",
      claim: "Old decision should not stay in startup brief.",
      lifecycle_state: "superseded",
      evidence_path: "docs/old.md"
    },
    {
      id: "new",
      type: "decision",
      claim: "New decision should stay in startup brief.",
      lifecycle_state: "active",
      evidence_path: "docs/new.md"
    }
  ]);

  assert.match(brief, /New decision should stay/);
  assert.doesNotMatch(brief, /Old decision should not stay/);
});
