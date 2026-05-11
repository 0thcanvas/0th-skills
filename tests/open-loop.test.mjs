import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  addOpenLoop,
  listOpenLoops,
  normalizeOpenLoop,
  updateOpenLoopStatus
} from "../scripts/open-loop.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-open-loop-"));
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

test("normalizeOpenLoop validates the action tracking contract", () => {
  assert.throws(
    () => normalizeOpenLoop({ title: "x", next_action: "do it", evidence_path: "docs/x.md" }),
    /scope is required/
  );
  assert.throws(
    () => normalizeOpenLoop({
      title: "x",
      scope: "repo",
      evidence_path: "docs/x.md"
    }),
    /next_action is required/
  );
  assert.throws(
    () => normalizeOpenLoop({
      title: "x",
      scope: "repo",
      next_action: "do it"
    }),
    /evidence_path, evidence_id, or at least one source_path/
  );
  assert.throws(
    () => normalizeOpenLoop({
      title: "x",
      scope: "repo",
      priority: "urgent",
      next_action: "do it",
      evidence_path: "docs/x.md"
    }),
    /priority must be one of/
  );
});

test("addOpenLoop writes a normalized runtime loop and regenerates the brief", () => {
  withTempStateRoot(() => {
    const repo = tempDir();

    const result = addOpenLoop({
      cwd: repo,
      now: new Date("2026-05-10T22:00:00.000Z"),
      input: {
        title: "Finish open-loop tracking",
        scope: "repo",
        priority: "P1",
        next_action: "Wire startup briefs into every core skill.",
        evidence_path: "docs/plans/2026-05-10-0th-memory-v2.md",
        source_paths: ["skills/build/SKILL.md", "skills/build/SKILL.md"]
      }
    });

    const [loop] = readJsonl(result.task_file);
    const brief = fs.readFileSync(result.brief_file, "utf8");

    assert.equal(result.written, true);
    assert.equal(result.brief_updated, true);
    assert.equal(result.task_file.startsWith(path.join(repo, ".0th")), false);
    assert.equal(loop.id, "2026-05-10-repo-finish-open-loop-tracking");
    assert.equal(loop.status, "open");
    assert.equal(loop.priority, "P1");
    assert.equal(loop.created_at, "2026-05-10T22:00:00.000Z");
    assert.equal(loop.updated_at, "2026-05-10T22:00:00.000Z");
    assert.deepEqual(loop.source_paths, ["skills/build/SKILL.md"]);
    assert.match(brief, /Finish open-loop tracking/);
  });
});

test("addOpenLoop default stores runtime task state outside the project checkout", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const result = addOpenLoop({
      cwd: repo,
      now: new Date("2026-05-11T01:30:00.000Z"),
      input: {
        title: "Keep Memory v2 runtime tasks out of product repos",
        scope: "repo",
        priority: "P1",
        next_action: "Write tasks to user state by default.",
        evidence_path: "references/open-loops.md"
      }
    });

    assert.ok(result.task_file.startsWith(stateRoot));
    assert.ok(result.brief_file.startsWith(stateRoot));
    assert.equal(fs.existsSync(path.join(repo, ".0th")), false);
    assert.equal(fs.existsSync(result.task_file), true);
  });
});

test("open-loop mutations persist even when brief generation fails", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, "open-loops.jsonl");
  fs.writeFileSync(path.join(repo, "brief-blocker"), "");
  const briefFile = path.join(repo, "brief-blocker", "brief.md");

  const { result: added, stderr: addStderr } = captureStderr(() => addOpenLoop({
    cwd: repo,
    taskFile,
    briefFile,
    now: new Date("2026-05-11T02:00:00.000Z"),
    input: {
      id: "brief-failure-loop",
      title: "Brief failure still records the loop",
      scope: "repo",
      priority: "P1",
      next_action: "Report the brief refresh error without dropping state.",
      evidence_path: "docs/pr19.md"
    }
  }));

  assert.equal(added.written, true);
  assert.equal(added.brief_updated, false);
  assert.ok(added.brief_error);
  assert.match(addStderr, /brief-regeneration-failed:/);
  assert.equal(readJsonl(taskFile)[0].id, "brief-failure-loop");

  const { result: updated, stderr: updateStderr } = captureStderr(() => updateOpenLoopStatus({
    cwd: repo,
    taskFile,
    briefFile,
    id: "brief-failure-loop",
    status: "blocked",
    blockedReason: "Brief output path is blocked.",
    now: new Date("2026-05-11T02:05:00.000Z")
  }));

  const [loop] = readJsonl(taskFile);
  assert.equal(updated.updated, true);
  assert.equal(updated.brief_updated, false);
  assert.ok(updated.brief_error);
  assert.match(updateStderr, /brief-regeneration-failed:/);
  assert.equal(loop.status, "blocked");
  assert.equal(loop.blocked_reason, "Brief output path is blocked.");
});

test("updateOpenLoopStatus blocks, closes, and drops existing loops without losing provenance", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, ".0th", "tasks", "open-loops.jsonl");

  const added = addOpenLoop({
    cwd: repo,
    taskFile,
    updateBrief: false,
    now: new Date("2026-05-10T22:00:00.000Z"),
    input: {
      id: "memory-v2-open-loop",
      title: "Track Memory v2 unfinished work",
      scope: "project",
      project: "0th-skills",
      priority: "P2",
      next_action: "Expose open loops in session startup.",
      evidence_path: "docs/decisions/2026-05-10-0th-memory-v2.md"
    }
  });

  updateOpenLoopStatus({
    cwd: repo,
    taskFile,
    updateBrief: false,
    id: added.id,
    status: "blocked",
    blockedReason: "Waiting for user priority.",
    nextAction: "Ask whether user-level runtime storage is enough.",
    now: new Date("2026-05-10T23:00:00.000Z")
  });

  let [loop] = readJsonl(taskFile);
  assert.equal(loop.status, "blocked");
  assert.equal(loop.blocked_reason, "Waiting for user priority.");
  assert.equal(loop.next_action, "Ask whether user-level runtime storage is enough.");

  updateOpenLoopStatus({
    cwd: repo,
    taskFile,
    updateBrief: false,
    id: added.id,
    status: "done",
    now: new Date("2026-05-11T00:00:00.000Z")
  });

  [loop] = readJsonl(taskFile);
  assert.equal(loop.status, "done");
  assert.equal(loop.closed_at, "2026-05-11T00:00:00.000Z");
  assert.equal(loop.evidence_path, "docs/decisions/2026-05-10-0th-memory-v2.md");

  updateOpenLoopStatus({
    cwd: repo,
    taskFile,
    updateBrief: false,
    id: added.id,
    status: "dropped",
    dropReason: "Superseded by a smaller workflow.",
    now: new Date("2026-05-11T01:00:00.000Z")
  });

  [loop] = readJsonl(taskFile);
  assert.equal(loop.status, "dropped");
  assert.equal(loop.drop_reason, "Superseded by a smaller workflow.");
});

test("listOpenLoops returns actionable loops by priority and hides closed work by default", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, ".0th", "tasks", "open-loops.jsonl");

  addOpenLoop({
    cwd: repo,
    taskFile,
    updateBrief: false,
    now: new Date("2026-05-10T22:00:00.000Z"),
    input: {
      id: "p2-loop",
      title: "Lower priority",
      scope: "repo",
      priority: "P2",
      next_action: "Do later.",
      evidence_path: "docs/lower.md"
    }
  });
  addOpenLoop({
    cwd: repo,
    taskFile,
    updateBrief: false,
    now: new Date("2026-05-10T22:05:00.000Z"),
    input: {
      id: "p0-loop",
      title: "Higher priority",
      scope: "repo",
      priority: "P0",
      next_action: "Do first.",
      evidence_path: "docs/higher.md"
    }
  });
  updateOpenLoopStatus({
    cwd: repo,
    taskFile,
    updateBrief: false,
    id: "p2-loop",
    status: "done",
    now: new Date("2026-05-10T23:00:00.000Z")
  });

  assert.deepEqual(listOpenLoops({ taskFile }).loops.map((loop) => loop.id), ["p0-loop"]);
  assert.deepEqual(listOpenLoops({ taskFile, includeClosed: true }).loops.map((loop) => loop.id), [
    "p0-loop",
    "p2-loop"
  ]);
});

test("open-loop CLI adds, lists, and closes loops with JSON output", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, "open-loops.jsonl");
  const script = path.join(repoRoot, "scripts/open-loop.mjs");

  const addStdout = execFileSync(
    process.execPath,
    [
      script,
      "add",
      "--task-file",
      taskFile,
      "--no-brief",
      "--id",
      "cli-loop",
      "--title",
      "Capture CLI open loop",
      "--scope",
      "repo",
      "--priority",
      "P1",
      "--next-action",
      "Close it from the CLI.",
      "--evidence-path",
      "docs/cli.md"
    ],
    { cwd: repo, encoding: "utf8" }
  );

  const added = JSON.parse(addStdout);
  assert.equal(added.id, "cli-loop");

  const listStdout = execFileSync(
    process.execPath,
    [script, "list", "--task-file", taskFile],
    { cwd: repo, encoding: "utf8" }
  );
  assert.deepEqual(JSON.parse(listStdout).loops.map((loop) => loop.id), ["cli-loop"]);

  const closeStdout = execFileSync(
    process.execPath,
    [script, "close", "--task-file", taskFile, "--no-brief", "--id", "cli-loop"],
    { cwd: repo, encoding: "utf8" }
  );
  assert.equal(JSON.parse(closeStdout).status, "done");
});

// -----------------------------------------------------------------------------
// PR #19 review — open-loop block/close/drop must honor --json input
// -----------------------------------------------------------------------------

test("open-loop block honors --json input for id and blocked_reason", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, "open-loops.jsonl");
  const script = path.join(repoRoot, "scripts/open-loop.mjs");

  // First add a loop
  execFileSync(
    process.execPath,
    [
      script, "add", "--task-file", taskFile, "--no-brief",
      "--id", "json-loop",
      "--title", "Loop blocked via JSON",
      "--scope", "repo",
      "--next-action", "Resume after dep update",
      "--evidence-path", "docs/x.md"
    ],
    { cwd: repo, encoding: "utf8" }
  );

  // Block it using --json input (this used to fail with "id is required")
  const blockInput = path.join(repo, "block.json");
  fs.writeFileSync(blockInput, JSON.stringify({
    id: "json-loop",
    blocked_reason: "waiting on upstream"
  }));

  const blockStdout = execFileSync(
    process.execPath,
    [script, "block", "--task-file", taskFile, "--no-brief", "--json", blockInput],
    { cwd: repo, encoding: "utf8" }
  );

  const blocked = JSON.parse(blockStdout);
  assert.equal(blocked.id, "json-loop");
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.blocked_reason, "waiting on upstream");
});

test("open-loop close honors --json input for id", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, "open-loops.jsonl");
  const script = path.join(repoRoot, "scripts/open-loop.mjs");

  execFileSync(
    process.execPath,
    [
      script, "add", "--task-file", taskFile, "--no-brief",
      "--id", "json-close",
      "--title", "Loop closed via JSON",
      "--scope", "repo",
      "--next-action", "x",
      "--evidence-path", "docs/x.md"
    ],
    { cwd: repo, encoding: "utf8" }
  );

  const closeInput = path.join(repo, "close.json");
  fs.writeFileSync(closeInput, JSON.stringify({ id: "json-close" }));

  const closeStdout = execFileSync(
    process.execPath,
    [script, "close", "--task-file", taskFile, "--no-brief", "--json", closeInput],
    { cwd: repo, encoding: "utf8" }
  );

  const closed = JSON.parse(closeStdout);
  assert.equal(closed.id, "json-close");
  assert.equal(closed.status, "done");
});

test("open-loop drop honors --json input for id and drop_reason", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, "open-loops.jsonl");
  const script = path.join(repoRoot, "scripts/open-loop.mjs");

  execFileSync(
    process.execPath,
    [
      script, "add", "--task-file", taskFile, "--no-brief",
      "--id", "json-drop",
      "--title", "Loop dropped via JSON",
      "--scope", "repo",
      "--next-action", "x",
      "--evidence-path", "docs/x.md"
    ],
    { cwd: repo, encoding: "utf8" }
  );

  const dropInput = path.join(repo, "drop.json");
  fs.writeFileSync(dropInput, JSON.stringify({
    id: "json-drop",
    drop_reason: "scope cut"
  }));

  const dropStdout = execFileSync(
    process.execPath,
    [script, "drop", "--task-file", taskFile, "--no-brief", "--json", dropInput],
    { cwd: repo, encoding: "utf8" }
  );

  const dropped = JSON.parse(dropStdout);
  assert.equal(dropped.id, "json-drop");
  assert.equal(dropped.status, "dropped");
  assert.equal(dropped.drop_reason, "scope cut");
});

test("open-loop block prefers explicit --blocked-reason over --json value", () => {
  // Mixed input: --json supplies id, --blocked-reason supplies reason.
  // Both should be honored; the explicit flag should win on conflict.
  const repo = tempDir();
  const taskFile = path.join(repo, "open-loops.jsonl");
  const script = path.join(repoRoot, "scripts/open-loop.mjs");

  execFileSync(
    process.execPath,
    [
      script, "add", "--task-file", taskFile, "--no-brief",
      "--id", "mixed-loop",
      "--title", "Mixed input",
      "--scope", "repo",
      "--next-action", "x",
      "--evidence-path", "docs/x.md"
    ],
    { cwd: repo, encoding: "utf8" }
  );

  const blockInput = path.join(repo, "block.json");
  fs.writeFileSync(blockInput, JSON.stringify({
    id: "mixed-loop",
    blocked_reason: "from json"
  }));

  // --blocked-reason appears AFTER --json. Explicit flags always win over
  // --json values regardless of argv order; this test pins that contract.
  const blockStdout = execFileSync(
    process.execPath,
    [
      script, "block", "--task-file", taskFile, "--no-brief",
      "--json", blockInput,
      "--blocked-reason", "from flag"
    ],
    { cwd: repo, encoding: "utf8" }
  );

  const blocked = JSON.parse(blockStdout);
  assert.equal(blocked.id, "mixed-loop");
  assert.equal(blocked.blocked_reason, "from flag");
});

test("open-loop add prefers explicit flags over --json values", () => {
  const repo = tempDir();
  const taskFile = path.join(repo, "open-loops.jsonl");
  const script = path.join(repoRoot, "scripts/open-loop.mjs");
  const input = path.join(repo, "add.json");
  fs.writeFileSync(input, JSON.stringify({
    id: "json-id",
    title: "Title from JSON",
    scope: "project",
    priority: "P3",
    next_action: "Next action from JSON",
    evidence_path: "docs/json.md"
  }));

  const addStdout = execFileSync(
    process.execPath,
    [
      script, "add", "--task-file", taskFile, "--no-brief",
      "--id", "flag-id",
      "--title", "Title from flag",
      "--scope", "repo",
      "--priority", "P1",
      "--next-action", "Next action from flag",
      "--evidence-path", "docs/flag.md",
      "--json", input
    ],
    { cwd: repo, encoding: "utf8" }
  );

  const added = JSON.parse(addStdout);
  const [loop] = readJsonl(taskFile);
  assert.equal(added.id, "flag-id");
  assert.equal(loop.id, "flag-id");
  assert.equal(loop.title, "Title from flag");
  assert.equal(loop.scope, "repo");
  assert.equal(loop.priority, "P1");
  assert.equal(loop.next_action, "Next action from flag");
  assert.equal(loop.evidence_path, "docs/flag.md");
});
