import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  captureMemoryEvent,
  classifyMemoryEvent
} from "../scripts/memory-gate.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-gate-"));
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
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

test("memory write gate classifies project, global, both, and nothing durable events", () => {
  assert.equal(classifyMemoryEvent({ event_type: "repo_decision", claim: "Repo local." }).outcome, "project");
  assert.equal(classifyMemoryEvent({
    event_type: "user_preference",
    claim: "User prefers agent-first memory.",
    source_id: "user-preferences",
    evidence_path: "evidence/user-preferences.jsonl",
    confidence: "medium"
  }).outcome, "global");
  assert.equal(classifyMemoryEvent({
    event_type: "cross_project_architecture",
    claim: "Reusable architecture.",
    project_claim: "Apply it here.",
    source_id: "architecture-lessons",
    evidence_path: "sources/architecture.jsonl",
    confidence: "high"
  }).outcome, "both");
  assert.equal(classifyMemoryEvent({ event_type: "nothing", durable: false }).outcome, "nothing_durable");
});

test("memory write gate writes both as one global claim plus a linked project application note", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const result = captureMemoryEvent({
      cwd: repo,
      now: new Date("2026-05-11T15:00:00.000Z"),
      input: {
        event_type: "research",
        outcome: "both",
        type: "external_research",
        claim: "Source-pack content hashes are reusable across memory projects.",
        project_claim: "Apply source-pack hash checks in this repo's runtime tests.",
        source_id: "memory-systems-world-model",
        topic: "agent-memory",
        subject_key: "source-pack-hash-checks",
        evidence_path: "sources/memory/source-pack.jsonl",
        confidence: "high"
      }
    });

    const globalClaims = readJsonl(path.join(stateRoot, "global", "memory", "claims.jsonl"));
    const projectDirs = fs.readdirSync(path.join(stateRoot, "projects"));
    const projectClaims = readJsonl(path.join(stateRoot, "projects", projectDirs[0], "memory", "claims.jsonl"));

    assert.equal(result.outcome, "both");
    assert.equal(result.global_claim_id, globalClaims[0].id);
    assert.equal(result.project_claim_id, projectClaims[0].id);
    assert.equal(globalClaims.length, 1);
    assert.equal(projectClaims.length, 1);
    assert.equal(globalClaims[0].scope, "global");
    assert.equal(globalClaims[0].source_id, "memory-systems-world-model");
    assert.equal(projectClaims[0].scope, "repo");
    assert.equal(projectClaims[0].subject_key, "source-pack-hash-checks");
    assert.equal(projectClaims[0].evidence_path, globalClaims[0].evidence_path);
    assert.deepEqual(projectClaims[0].related_ids, [globalClaims[0].id]);
  });
});

test("memory write gate does not duplicate global claims for both when no project application note exists", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const result = captureMemoryEvent({
      cwd: repo,
      now: new Date("2026-05-11T15:10:00.000Z"),
      input: {
        event_type: "research",
        outcome: "both",
        type: "external_research",
        claim: "Agent memory research should remain globally source-backed.",
        source_id: "memory-systems-world-model",
        subject_key: "global-source-backed-research",
        evidence_path: "sources/memory/source-pack.jsonl",
        confidence: "high"
      }
    });

    const globalClaims = readJsonl(path.join(stateRoot, "global", "memory", "claims.jsonl"));

    assert.equal(result.outcome, "global");
    assert.equal(result.project_claim_id, null);
    assert.equal(globalClaims.length, 1);
    assert.equal(fs.existsSync(path.join(stateRoot, "projects")), false);
  });
});

test("memory write gate requires consolidation to be explicit and source-backed", () => {
  assert.throws(
    () => classifyMemoryEvent({
      event_type: "research",
      consolidate: true,
      evidence_path: "sources/memory/source-pack.jsonl",
      confidence: "high"
    }),
    /explicit reusable lesson/
  );
  assert.throws(
    () => classifyMemoryEvent({
      event_type: "research",
      consolidate: true,
      claim: "Reusable lesson exists.",
      confidence: "high"
    }),
    /source-backed/
  );
});
