import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateOpenLoopBrief, runOpenLoopBriefGeneration } from "../scripts/open-loop-brief.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-open-loop-brief-"));
}

function writeJsonl(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

test("open-loop brief separates open, blocked, and stale action items", () => {
  const brief = generateOpenLoopBrief([
    {
      id: "fresh-open",
      title: "Ship Memory v2",
      scope: "repo",
      status: "open",
      priority: "P1",
      next_action: "Run the full verification suite.",
      evidence_path: "docs/plans/memory.md",
      updated_at: "2026-05-10T20:00:00.000Z"
    },
    {
      id: "blocked-loop",
      title: "Choose external backend",
      scope: "project",
      project: "0th-skills",
      status: "blocked",
      priority: "P2",
      next_action: "Wait for retrieval benchmark volume.",
      blocked_reason: "No executable benchmark need yet.",
      evidence_path: "docs/decisions/backend.md",
      updated_at: "2026-05-01T20:00:00.000Z"
    },
    {
      id: "stale-open",
      title: "Review old KB import",
      scope: "global",
      status: "open",
      priority: "P3",
      next_action: "Decide whether the old import still matters.",
      evidence_path: "docs/decisions/kb.md",
      updated_at: "2026-04-20T20:00:00.000Z"
    },
    {
      id: "closed-loop",
      title: "Already done",
      scope: "repo",
      status: "done",
      priority: "P0",
      next_action: "None.",
      evidence_path: "docs/done.md",
      updated_at: "2026-05-10T20:00:00.000Z"
    }
  ], {
    now: new Date("2026-05-10T21:00:00.000Z"),
    staleDays: 14
  });

  assert.match(brief, /## Open[\s\S]*Ship Memory v2/);
  assert.match(brief, /## Blocked[\s\S]*Choose external backend/);
  assert.match(brief, /## Stale Review[\s\S]*Review old KB import/);
  assert.doesNotMatch(brief, /Already done/);
});

test("open-loop brief generation is deterministic and writes the task brief", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, ".0th", "tasks", "open-loops.jsonl");
  const outputFile = path.join(repo, ".0th", "tasks", "brief.md");
  writeJsonl(taskFile, [
    {
      id: "b-loop",
      title: "Second",
      scope: "repo",
      status: "open",
      priority: "P2",
      next_action: "Do second.",
      evidence_path: "docs/second.md",
      updated_at: "2026-05-10T20:00:00.000Z"
    },
    {
      id: "a-loop",
      title: "First",
      scope: "repo",
      status: "open",
      priority: "P0",
      next_action: "Do first.",
      evidence_path: "docs/first.md",
      updated_at: "2026-05-10T20:00:00.000Z"
    }
  ]);

  const first = runOpenLoopBriefGeneration({
    taskFile,
    outputFile,
    now: new Date("2026-05-10T21:00:00.000Z")
  });
  const firstBrief = fs.readFileSync(outputFile, "utf8");
  const second = runOpenLoopBriefGeneration({
    taskFile,
    outputFile,
    now: new Date("2026-05-10T21:00:00.000Z")
  });
  const secondBrief = fs.readFileSync(outputFile, "utf8");

  assert.equal(first.loop_count, 2);
  assert.equal(second.loop_count, 2);
  assert.equal(firstBrief, secondBrief);
  assert.ok(firstBrief.indexOf("First") < firstBrief.indexOf("Second"));
});
