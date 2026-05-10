import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { appendMemoryClaim } from "../scripts/memory-write.mjs";
import { runMemorySync } from "../scripts/memory-sync.mjs";
import { reconcileReadSet } from "../scripts/read-set-reconcile.mjs";
import { addOpenLoop, updateOpenLoopStatus } from "../scripts/open-loop.mjs";

function sh(cwd, args) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-v2-e2e-"));
  sh(dir, ["git", "init", "-b", "main"]);
  sh(dir, ["git", "config", "user.email", "test@example.com"]);
  sh(dir, ["git", "config", "user.name", "Test User"]);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "memory.js"), "export const memory = 'v1';\n");
  sh(dir, ["git", "add", "."]);
  sh(dir, ["git", "commit", "-m", "initial"]);
  return dir;
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("Memory v2 accepts write, brief, source-change sync, and read-set confirmation", () => {
  const repo = tempRepo();
  const memoryFile = path.join(repo, ".0th", "memory", "claims.jsonl");
  const briefFile = path.join(repo, ".0th", "memory", "brief.md");

  const writeResult = appendMemoryClaim({
    cwd: repo,
    now: new Date("2026-05-10T22:00:00.000Z"),
    input: {
      type: "decision",
      claim: "Memory v2 uses write-through claim capture.",
      scope: "repo",
      lifecycle_state: "active",
      evidence_path: "docs/decisions/memory-v2.md",
      source_paths: ["src/memory.js"],
      source_symbols: ["memory"],
      confidence: "high"
    }
  });

  assert.equal(writeResult.written, true);
  assert.match(fs.readFileSync(briefFile, "utf8"), /write-through claim capture/);

  const from = sh(repo, ["git", "rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(repo, "src", "memory.js"), "export const memory = 'v2';\n");
  sh(repo, ["git", "add", "src/memory.js"]);
  sh(repo, ["git", "commit", "-m", "update memory"]);
  const to = sh(repo, ["git", "rev-parse", "HEAD"]);

  const syncResult = runMemorySync({
    cwd: repo,
    from,
    to,
    memoryFile,
    syncedAt: "2026-05-10T22:10:00.000Z"
  });
  let [claim] = readJsonl(memoryFile);

  assert.deepEqual(syncResult.affected_claim_ids, [writeResult.id]);
  assert.equal(claim.lifecycle_state, "needs_review");
  assert.equal(claim.review.reason, "source_changed");

  const reconcileResult = reconcileReadSet({
    memoryFile,
    confirmedAt: "2026-05-10T22:20:00.000Z",
    readSet: {
      files: ["src/memory.js"],
      symbols: ["memory"],
      tests: ["tests/memory-v2-e2e.test.mjs"],
      verified_claims: [
        {
          id: writeResult.id,
          outcome: "confirmed",
          evidence_path: "tests/memory-v2-e2e.test.mjs"
        }
      ]
    }
  });
  [claim] = readJsonl(memoryFile);

  assert.deepEqual(reconcileResult.checked_claim_ids, [writeResult.id]);
  assert.deepEqual(reconcileResult.updated_claim_ids, [writeResult.id]);
  assert.equal(claim.lifecycle_state, "active");
  assert.equal(claim.review, undefined);
  assert.equal(claim.last_confirmed_at, "2026-05-10T22:20:00.000Z");
});

test("Memory v2 tracks unfinished work as open loops instead of durable claims", () => {
  const repo = tempRepo();
  const taskFile = path.join(repo, ".0th", "tasks", "open-loops.jsonl");
  const briefFile = path.join(repo, ".0th", "tasks", "brief.md");

  const addResult = addOpenLoop({
    cwd: repo,
    now: new Date("2026-05-10T22:30:00.000Z"),
    input: {
      title: "Verify Memory v2 open-loop integration",
      scope: "repo",
      priority: "P1",
      next_action: "Run the focused open-loop tests and full suite.",
      evidence_path: "tests/memory-v2-e2e.test.mjs",
      source_paths: ["scripts/open-loop.mjs", "scripts/open-loop-brief.mjs"]
    }
  });

  assert.equal(addResult.written, true);
  assert.match(fs.readFileSync(briefFile, "utf8"), /Verify Memory v2 open-loop integration/);

  const closeResult = updateOpenLoopStatus({
    cwd: repo,
    id: addResult.id,
    status: "done",
    now: new Date("2026-05-10T22:40:00.000Z")
  });
  const [loop] = readJsonl(taskFile);

  assert.equal(closeResult.status, "done");
  assert.equal(loop.status, "done");
  assert.equal(loop.closed_at, "2026-05-10T22:40:00.000Z");
});
