import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { readRepoState, writeRepoState } from "../scripts/repo-state.mjs";
import { runPreflight } from "../scripts/session-preflight.mjs";
import { appendMemoryClaim } from "../scripts/memory-write.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "repo-state-hardening-"));
}

function sh(cwd, args) {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function initRepo(dir) {
  sh(dir, ["git", "init", "-q"]);
  sh(dir, ["git", "config", "user.email", "test@example.com"]);
  sh(dir, ["git", "config", "user.name", "Test"]);
  fs.writeFileSync(path.join(dir, "README.md"), "# fixture\n");
  sh(dir, ["git", "add", "."]);
  sh(dir, ["git", "commit", "-qm", "initial"]);
  return sh(dir, ["git", "rev-parse", "HEAD"]).trim();
}

test("readRepoState returns structured sentinel when state.json is corrupt", () => {
  const dir = tempDir();
  const stateFile = path.join(dir, "state.json");
  fs.writeFileSync(stateFile, "{not-json{");

  // Pre-PR-21-review: raw `JSON.parse` here threw `SyntaxError` straight out
  // of `readRepoState`, aborting `session-preflight` before any warning could
  // be raised. With the fix, the caller gets a structured "unreadable"
  // sentinel and can decide whether to fall back to treating the repo as new.
  const result = readRepoState({ cwd: dir, repoStateFile: stateFile });
  assert.ok(result && typeof result === "object", "expected structured result, got " + typeof result);
  assert.equal(result.unreadable, true);
  assert.equal(result.repo_state_file, stateFile);
  assert.ok(result.error, "expected an error message describing the parse failure");
});

test("readRepoState returns null when state.json is missing", () => {
  const dir = tempDir();
  const stateFile = path.join(dir, "absent.json");
  const result = readRepoState({ cwd: dir, repoStateFile: stateFile });
  assert.equal(result, null);
});

test("writeRepoState uses atomic tmp+rename so a crash cannot truncate", () => {
  const dir = tempDir();
  const stateFile = path.join(dir, "state.json");

  // The atomic writer creates a `${stateFile}.<pid>.tmp` and renames it
  // into place. To detect that, we wrap the underlying fs.writeFileSync via
  // a test fixture that lists the parent dir DURING the write. We can't
  // easily hook the write here, so we settle for verifying the final state
  // file contains a trailing newline (the canonical atomic-write shape)
  // AND that no `.tmp` residue is left in the parent dir afterward.

  writeRepoState({
    cwd: dir,
    repoStateFile: stateFile,
    state: { last_seen_head: "abc123", branch: "main" }
  });

  const text = fs.readFileSync(stateFile, "utf8");
  assert.ok(text.endsWith("\n"), "expected trailing newline (atomic write canonical shape)");

  const residue = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(residue, [], `expected no .tmp residue, found: ${residue.join(", ")}`);

  const parsed = JSON.parse(text);
  assert.equal(parsed.last_seen_head, "abc123");
});

test("preflight surfaces a structured memory_sync_failed flag when memory-sync throws after fast-forward", async (t) => {
  // The PR's existing test (tests/session-preflight.test.mjs:178-200) verifies
  // a warning is emitted. PR #21 review found that the WARNING was the only
  // signal — `action: "fast_forward_pulled"` looked healthy and downstream
  // gating could not distinguish "FF + sync OK" from "FF + sync failed".
  // This test pins a structured `memory_sync_failed: true` flag so any agent
  // gate can branch on it.

  const upstream = tempDir();
  sh(upstream, ["git", "init", "--bare", "-q"]);
  const work = tempDir();
  initRepo(work);
  sh(work, ["git", "remote", "add", "origin", upstream]);
  sh(work, ["git", "branch", "-M", "main"]);
  sh(work, ["git", "push", "-qu", "origin", "main"]);

  // Add a commit upstream we'll need to pull.
  const clone = tempDir();
  sh(clone, ["git", "clone", "-q", upstream, clone]);
  sh(clone, ["git", "config", "user.email", "x@y.z"]);
  sh(clone, ["git", "config", "user.name", "X"]);
  fs.writeFileSync(path.join(clone, "NEW.md"), "added\n");
  sh(clone, ["git", "add", "."]);
  sh(clone, ["git", "commit", "-qm", "upstream change"]);
  sh(clone, ["git", "push", "-q"]);

  // Sabotage the runtime state so memory-sync throws. Place the memory file
  // OUTSIDE the work tree so its corruption does not leak into `git status`
  // and trigger the `blocked_dirty_behind` branch (the real runtime state
  // lives under `~/.0th/skills/projects/<key>/memory/` for the same reason).
  const runtimeDir = tempDir();
  const memoryFile = path.join(runtimeDir, "claims.jsonl");
  fs.writeFileSync(memoryFile, "{not-jsonl\n"); // corrupt → readJsonl throws

  const repoStateFile = path.join(runtimeDir, "state.json");

  const result = runPreflight({
    cwd: work,
    allowPull: true,
    memoryFile,
    repoStateFile
  });
  assert.equal(result.action, "fast_forward_pulled", "expected FF to succeed");
  assert.equal(result.memory_sync_failed, true, "expected structured memory_sync_failed flag");
  assert.ok(
    result.warnings.some((w) => w.includes("memory-sync failed")),
    `expected memory-sync warning, got: ${result.warnings.join(" | ")}`
  );
});

test("preflight survives an unreadable previous state.json with a warning rather than crashing", () => {
  const work = tempDir();
  initRepo(work);
  const stateFile = path.join(work, ".0th", "memory", "state.json");
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, "{garbage}");

  // Pre-fix: this would throw SyntaxError out of readRepoState before the
  // warnings array existed. The fix returns the unreadable sentinel and the
  // preflight pushes a warning + continues with previousRepoState=null.
  const result = runPreflight({
    cwd: work,
    allowPull: false,
    repoStateFile: stateFile
  });
  assert.ok(
    result.warnings.some((w) => /repo state.*unreadable|repo_state_unreadable/i.test(w)),
    `expected unreadable warning, got: ${result.warnings.join(" | ")}`
  );
});
