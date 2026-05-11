import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBriefGeneration } from "../scripts/memory-brief.mjs";
import { runOpenLoopBriefGeneration } from "../scripts/open-loop-brief.mjs";
import { runMemoryMaintain } from "../scripts/memory-maintain.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "brief-atomicity-"));
}

function writeLine(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(line) + "\n");
}

function spyFs() {
  // Capture fs.writeFileSync and renameSync calls so we can verify the
  // writer used the atomic tmp+rename pattern, not a direct writeFileSync.
  const writeCalls = [];
  const renameCalls = [];
  const origWrite = fs.writeFileSync;
  const origRename = fs.renameSync;
  fs.writeFileSync = (...args) => {
    writeCalls.push(args[0]);
    return origWrite(...args);
  };
  fs.renameSync = (...args) => {
    renameCalls.push({ from: args[0], to: args[1] });
    return origRename(...args);
  };
  return {
    writeCalls,
    renameCalls,
    restore: () => {
      fs.writeFileSync = origWrite;
      fs.renameSync = origRename;
    }
  };
}

test("memory brief write is atomic (tmp+rename, no direct writeFileSync to final path)", () => {
  // PR #21 review NEW4: pre-fix, `memory-brief.mjs:67` used a
  // direct `fs.writeFileSync` rather than tmp+rename. A crash mid-write
  // truncated the brief, and any agent reading the brief at the moment of
  // write saw a partial file. After the fix, an in-flight reader sees the
  // previous brief OR the new brief — never the in-between.
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const outputFile = path.join(dir, "brief.md");
  writeLine(memoryFile, {
    id: "x",
    type: "decision",
    claim: "Atomic brief writes prevent torn reads.",
    scope: "repo",
    lifecycle_state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    last_confirmed_at: "2026-01-01T00:00:00.000Z",
    confidence: "high",
    evidence_path: "scripts/memory-brief.mjs"
  });

  const spy = spyFs();
  try {
    runBriefGeneration({ cwd: dir, memoryFile, outputFile });
  } finally {
    spy.restore();
  }

  const text = fs.readFileSync(outputFile, "utf8");
  assert.ok(text.length > 0, "brief should be written");

  // The behavior we're pinning: nobody calls writeFileSync on the FINAL
  // brief path directly. Every write goes to a .tmp first; rename moves it
  // into place. Anti-regression: if a future refactor reverts to direct
  // writeFileSync the test fails.
  const wroteFinalDirectly = spy.writeCalls.some((p) => p === outputFile);
  assert.equal(wroteFinalDirectly, false,
    `direct writeFileSync to final path observed: ${spy.writeCalls.filter((p) => p === outputFile).join(", ")}`);
  const renamedIntoPlace = spy.renameCalls.some((r) => r.to === outputFile);
  assert.equal(renamedIntoPlace, true,
    `expected a rename ending at ${outputFile}, saw renames: ${JSON.stringify(spy.renameCalls)}`);

  const residue = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(residue, [], `expected no .tmp residue, found: ${residue.join(", ")}`);
});

test("open-loop brief write is atomic (tmp+rename, no direct writeFileSync to final path)", () => {
  const dir = tempDir();
  const taskFile = path.join(dir, "tasks.jsonl");
  const outputFile = path.join(dir, "brief.md");
  writeLine(taskFile, {
    id: "loop-1",
    title: "Resume the hardening pass",
    scope: "repo",
    status: "open",
    priority: "P1",
    next_action: "land slice 5",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    evidence_path: "tests/brief-atomicity.test.mjs",
    history: [{ at: "2026-01-01T00:00:00.000Z", event: "created", status: "open" }]
  });

  const spy = spyFs();
  try {
    runOpenLoopBriefGeneration({ cwd: dir, taskFile, outputFile });
  } finally {
    spy.restore();
  }

  assert.ok(fs.readFileSync(outputFile, "utf8").length > 0);

  const wroteFinalDirectly = spy.writeCalls.some((p) => p === outputFile);
  assert.equal(wroteFinalDirectly, false,
    `direct writeFileSync to final path observed: ${spy.writeCalls.filter((p) => p === outputFile).join(", ")}`);
  const renamedIntoPlace = spy.renameCalls.some((r) => r.to === outputFile);
  assert.equal(renamedIntoPlace, true,
    `expected a rename ending at ${outputFile}, saw renames: ${JSON.stringify(spy.renameCalls)}`);

  const residue = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(residue, [], `expected no .tmp residue, found: ${residue.join(", ")}`);
});

test("maintain pathExists expands ~ so home-relative pointers are not false-positive missing", () => {
  // PR #21 review (claude code-reviewer #8): `pathExists` treated `~/.0th/x.md`
  // as a literal subdirectory, joined with cwd, and reported "missing" for
  // every home-relative pointer. Workflow agents legitimately wrote home-
  // relative paths to runtime evidence. Fix: expand a leading `~/` to
  // os.homedir() before resolving.
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "tasks.jsonl");
  const briefFile = path.join(dir, "brief.md");
  const repoStateFile = path.join(dir, "state.json");

  // Use the README in the user's home dir if it exists, otherwise create
  // a temp file via HOME-relative path. Use os.homedir() to discover.
  const home = os.homedir();
  // Pick a path that is guaranteed to exist: ~ itself (the directory).
  // We point evidence_path at the home directory so `pathExists` must
  // accept it as present.
  const homeRelative = "~/";

  writeLine(memoryFile, {
    id: "homey",
    type: "observation",
    claim: "Home-relative pointers should be recognized.",
    scope: "user",
    lifecycle_state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    last_confirmed_at: "2026-01-01T00:00:00.000Z",
    confidence: "medium",
    evidence_path: homeRelative
  });

  const report = runMemoryMaintain({
    cwd: dir,
    memoryFile,
    taskFile,
    briefFile,
    repoStateFile,
    apply: false,
    maintainedAt: "2026-01-10T00:00:00.000Z"
  });
  const missingForHomey = report.findings.missing_sources.filter((m) => m.id === "homey");
  assert.deepEqual(
    missingForHomey,
    [],
    `expected ${home} (via ~/) to be recognized as existing, got missing_sources entry: ${JSON.stringify(missingForHomey)}`
  );
});
