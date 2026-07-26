import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { recallMemory } from "../scripts/memory-recall.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-current-recall-"));
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
}

test("recall returns only current claims and open work unless history is explicitly requested", () => {
  const root = tempDir();
  const memoryFile = path.join(root, "memory", "claims.jsonl");
  const taskFile = path.join(root, "tasks", "open-loops.jsonl");

  writeJsonl(memoryFile, [
    {
      id: "claim-active",
      type: "decision",
      scope: "repo",
      lifecycle_state: "active",
      claim: "Checkout uses the current contract.",
      created_at: "2026-07-26T00:00:00.000Z",
      evidence_path: "contracts/checkout.md"
    },
    {
      id: "claim-review",
      type: "decision",
      scope: "repo",
      lifecycle_state: "needs_review",
      claim: "Checkout may use the legacy contract.",
      created_at: "2026-07-25T00:00:00.000Z",
      evidence_path: "contracts/legacy.md"
    },
    {
      id: "claim-superseded",
      type: "decision",
      scope: "repo",
      lifecycle_state: "superseded",
      claim: "Checkout used the retired contract.",
      created_at: "2026-07-24T00:00:00.000Z",
      evidence_path: "contracts/retired.md"
    },
    {
      id: "claim-archived",
      type: "observation",
      scope: "repo",
      lifecycle_state: "archived",
      claim: "Checkout had an old observation.",
      created_at: "2026-07-23T00:00:00.000Z",
      evidence_path: "evidence/old.md"
    }
  ]);

  writeJsonl(taskFile, [
    {
      id: "loop-open",
      title: "Verify checkout",
      scope: "repo",
      status: "open",
      priority: "P1",
      next_action: "Run checkout proof.",
      created_at: "2026-07-26T00:00:00.000Z",
      updated_at: "2026-07-26T00:00:00.000Z",
      evidence_path: "tasks/current.md"
    },
    {
      id: "loop-blocked",
      title: "Checkout device proof",
      scope: "repo",
      status: "blocked",
      priority: "P1",
      next_action: "Wait for checkout device.",
      blocked_reason: "Device unavailable.",
      created_at: "2026-07-26T00:00:00.000Z",
      updated_at: "2026-07-26T00:00:00.000Z",
      evidence_path: "tasks/device.md"
    },
    {
      id: "loop-done",
      title: "Old checkout proof",
      scope: "repo",
      status: "done",
      priority: "P2",
      next_action: "No action.",
      created_at: "2026-07-25T00:00:00.000Z",
      updated_at: "2026-07-25T00:00:00.000Z",
      evidence_path: "tasks/done.md"
    },
    {
      id: "loop-dropped",
      title: "Dropped checkout work",
      scope: "repo",
      status: "dropped",
      priority: "P3",
      next_action: "No action.",
      created_at: "2026-07-24T00:00:00.000Z",
      updated_at: "2026-07-24T00:00:00.000Z",
      evidence_path: "tasks/dropped.md"
    }
  ]);

  const current = recallMemory({
    query: "checkout",
    memoryFile,
    taskFile,
    includeEvidence: false,
    limit: 20
  });
  assert.deepEqual(
    current.results.map((result) => result.id).sort(),
    ["claim-active", "loop-blocked", "loop-open"]
  );

  const history = recallMemory({
    query: "checkout",
    memoryFile,
    taskFile,
    includeEvidence: false,
    includeNonCurrent: true,
    limit: 20
  });
  assert.deepEqual(
    history.results.map((result) => result.id).sort(),
    [
      "claim-active",
      "claim-archived",
      "claim-review",
      "claim-superseded",
      "loop-blocked",
      "loop-done",
      "loop-dropped",
      "loop-open"
    ]
  );

  const reviewOnly = recallMemory({
    query: "checkout",
    memoryFile,
    taskFile,
    includeEvidence: false,
    lifecycleState: "needs_review",
    limit: 20
  });
  assert.deepEqual(reviewOnly.results.map((result) => result.id), ["claim-review"]);
});
