import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateBrief, runBriefGeneration } from "../scripts/memory-brief.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-brief-"));
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

function writeJsonl(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

test("memory brief summarizes key memory categories with cited evidence", () => {
  const claims = [
    {
      id: "decision-1",
      type: "decision",
      claim: "Use write-through memory events instead of session-end hooks.",
      lifecycle_state: "active",
      evidence_path: "docs/decisions/2026-05-10-0th-memory-v2.md"
    },
    {
      id: "vocab-1",
      type: "vocabulary",
      claim: "read-set reconciliation means checking only inspected files.",
      lifecycle_state: "active",
      source_paths: ["references/memory-contract.md"]
    },
    {
      id: "incident-1",
      type: "incident",
      claim: "Agents sometimes skip KB writes after learning durable facts.",
      lifecycle_state: "active",
      evidence_path: "learning/skill-incidents/example.md"
    },
    {
      id: "root-1",
      type: "root_cause",
      claim: "Cart banner drift came from anchoring after checkout.",
      lifecycle_state: "active",
      source_paths: ["src/cart/banner.ts"]
    },
    {
      id: "repo-1",
      type: "repo_state",
      claim: "Memory claim tied to src/cart/banner.ts needs re-verification.",
      lifecycle_state: "needs_review",
      source_paths: ["src/cart/banner.ts"]
    }
  ];

  const brief = generateBrief(claims);

  assert.match(brief, /## Active Decisions[\s\S]*write-through memory events/);
  assert.match(brief, /## Vocabulary[\s\S]*read-set reconciliation/);
  assert.match(brief, /## Recurring Incidents[\s\S]*skip KB writes/);
  assert.match(brief, /## Known Root Causes[\s\S]*Cart banner drift/);
  assert.match(brief, /## Repo State Warnings[\s\S]*needs re-verification/);
  assert.match(brief, /source: docs\/decisions\/2026-05-10-0th-memory-v2.md/);
  assert.match(brief, /source: references\/memory-contract.md/);
});

test("memory brief generation is deterministic", () => {
  const repo = tempDir();
  const memoryFile = path.join(repo, ".0th", "memory", "claims.jsonl");
  const outputFile = path.join(repo, ".0th", "memory", "brief.md");
  writeJsonl(memoryFile, [
    {
      id: "b",
      type: "repo_state",
      claim: "Branch has no upstream.",
      lifecycle_state: "needs_review",
      evidence_path: "session-preflight"
    },
    {
      id: "a",
      type: "decision",
      claim: "Keep markdown as evidence.",
      lifecycle_state: "active",
      evidence_path: "docs/decisions/memory.md"
    }
  ]);

  const first = runBriefGeneration({ cwd: repo, memoryFile, outputFile });
  const firstText = fs.readFileSync(outputFile, "utf8");
  const second = runBriefGeneration({ cwd: repo, memoryFile, outputFile });
  const secondText = fs.readFileSync(outputFile, "utf8");

  assert.equal(first.written, true);
  assert.equal(second.written, true);
  assert.equal(firstText, secondText);
  assert.match(firstText, /Keep markdown as evidence/);
  assert.match(firstText, /Branch has no upstream/);
});

test("memory brief can generate the global startup brief without reading project memory", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const globalMemoryFile = path.join(stateRoot, "global", "memory", "claims.jsonl");
    writeJsonl(globalMemoryFile, [
      {
        id: "global-research",
        type: "external_research",
        claim: "Global memory briefs summarize reusable cross-project knowledge.",
        scope: "global",
        lifecycle_state: "active",
        evidence_path: "sources/memory/source-pack.jsonl"
      }
    ]);

    const result = runBriefGeneration({ cwd: repo, scope: "global" });
    const brief = fs.readFileSync(result.output_file, "utf8");

    assert.equal(result.memory_file, globalMemoryFile);
    assert.equal(result.output_file, path.join(stateRoot, "global", "memory", "brief.md"));
    assert.match(brief, /^# Global Memory Brief/);
    assert.match(brief, /reusable cross-project knowledge/);
    assert.equal(fs.existsSync(path.join(stateRoot, "projects")), false);
  });
});
