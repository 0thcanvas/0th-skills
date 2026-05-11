import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runPreflight } from "../scripts/session-preflight.mjs";

function sh(cwd, args) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function writeFile(repo, fileName, content) {
  fs.writeFileSync(path.join(repo, fileName), content);
}

function commit(repo, message) {
  sh(repo, ["git", "add", "."]);
  sh(repo, ["git", "commit", "-m", message]);
}

function writeJsonl(filePath, entries) {
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

function initRepoWithRemote() {
  const root = tempDir("0th-preflight-");
  const remote = path.join(root, "remote.git");
  const local = path.join(root, "local");

  sh(root, ["git", "init", "--bare", remote]);
  fs.mkdirSync(local);
  sh(local, ["git", "init", "-b", "main"]);
  sh(local, ["git", "config", "user.email", "test@example.com"]);
  sh(local, ["git", "config", "user.name", "Test User"]);
  writeFile(local, "memory.txt", "initial\n");
  commit(local, "initial");
  sh(local, ["git", "remote", "add", "origin", remote]);
  sh(local, ["git", "push", "-u", "origin", "main"]);

  return { root, remote, local };
}

function pushRemoteCommit(remote, message, content) {
  const clone = path.join(path.dirname(remote), `remote-work-${message.replace(/\W+/g, "-")}`);
  sh(path.dirname(remote), ["git", "clone", remote, clone]);
  sh(clone, ["git", "config", "user.email", "test@example.com"]);
  sh(clone, ["git", "config", "user.name", "Test User"]);
  writeFile(clone, "memory.txt", content);
  commit(clone, message);
  sh(clone, ["git", "push", "origin", "main"]);
}

test("preflight fast-forwards a clean branch that is behind upstream", () => {
  const { root, remote, local } = initRepoWithRemote();
  const memoryFile = path.join(root, "claims.jsonl");
  writeJsonl(memoryFile, [
    {
      id: "memory-file-behavior",
      claim: "memory.txt stores the initial state.",
      lifecycle_state: "active",
      source_paths: ["memory.txt"]
    }
  ]);
  const beforeHead = sh(local, ["git", "rev-parse", "HEAD"]);
  pushRemoteCommit(remote, "remote update", "remote\n");

  const result = runPreflight({ cwd: local, memoryFile });
  const [claim] = readJsonl(memoryFile);

  assert.equal(result.branch, "main");
  assert.equal(result.clean, true);
  assert.equal(result.upstream, "origin/main");
  assert.equal(result.ahead, 0);
  assert.equal(result.behind, 1);
  assert.equal(result.action, "fast_forward_pulled");
  assert.equal(result.before_head, beforeHead);
  assert.notEqual(result.after_head, beforeHead);
  assert.match(result.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fs.readFileSync(path.join(local, "memory.txt"), "utf8"), "remote\n");
  assert.deepEqual(result.memory_sync.affected_claim_ids, ["memory-file-behavior"]);
  assert.equal(claim.lifecycle_state, "needs_review");
  assert.equal(claim.review.from_revision, beforeHead);
  assert.equal(claim.review.to_revision, result.after_head);
});

test("preflight does not pull a dirty branch that is behind upstream", () => {
  const { remote, local } = initRepoWithRemote();
  const beforeHead = sh(local, ["git", "rev-parse", "HEAD"]);
  pushRemoteCommit(remote, "remote update", "remote\n");
  writeFile(local, "local-only.txt", "dirty\n");

  const result = runPreflight({ cwd: local });

  assert.equal(result.clean, false);
  assert.equal(result.behind, 1);
  assert.equal(result.action, "blocked_dirty_behind");
  assert.equal(result.before_head, beforeHead);
  assert.equal(result.after_head, beforeHead);
  assert.match(result.warnings.join("\n"), /dirty/i);
  assert.equal(fs.existsSync(path.join(local, "local-only.txt")), true);
});

test("preflight does not merge or pull a divergent branch", () => {
  const { remote, local } = initRepoWithRemote();
  pushRemoteCommit(remote, "remote update", "remote\n");
  writeFile(local, "local.txt", "local\n");
  commit(local, "local update");
  const beforeHead = sh(local, ["git", "rev-parse", "HEAD"]);

  const result = runPreflight({ cwd: local });

  assert.equal(result.clean, true);
  assert.equal(result.ahead, 1);
  assert.equal(result.behind, 1);
  assert.equal(result.action, "blocked_divergent");
  assert.equal(result.before_head, beforeHead);
  assert.equal(result.after_head, beforeHead);
  assert.match(result.warnings.join("\n"), /divergent/i);
});

// -----------------------------------------------------------------------------
// PR #19 review — session-preflight robustness (D2 + N2)
// -----------------------------------------------------------------------------

test("preflight returns no_upstream action when current branch has no tracking ref", () => {
  // Plain init without a remote — runGit "@{u}" returns null and preflight
  // must mark action = no_upstream with a warning, not silently fall through
  // to up_to_date.
  const dir = tempDir("0th-preflight-no-upstream-");
  sh(dir, ["git", "init", "-b", "feature"]);
  sh(dir, ["git", "config", "user.email", "x@y"]);
  sh(dir, ["git", "config", "user.name", "x"]);
  writeFile(dir, "f.txt", "x\n");
  commit(dir, "init");

  const result = runPreflight({ cwd: dir });

  assert.equal(result.action, "no_upstream");
  assert.equal(result.upstream, null);
  assert.match(result.warnings.join("\n"), /upstream/i);
});

test("preflight returns fast_forward_available (not pulled) when allowPull=false", () => {
  const { remote, local } = initRepoWithRemote();
  pushRemoteCommit(remote, "remote upd", "remote-content\n");
  const beforeHead = sh(local, ["git", "rev-parse", "HEAD"]);

  const result = runPreflight({ cwd: local, allowPull: false });

  assert.equal(result.action, "fast_forward_available");
  assert.equal(result.behind, 1);
  // Critical: HEAD must not have moved because allowPull was false
  assert.equal(result.after_head, beforeHead);
});

test("preflight captures a memory-sync failure into warnings, doesn't reverse the fast-forward", () => {
  // PR #19 review N2: after a successful fast-forward, if runMemorySync
  // throws (corrupt claims.jsonl), the throw used to bubble out and erase
  // the structured preflight result entirely. Now the failure is captured
  // into result.warnings and the rest of the result is preserved.
  const { root, remote, local } = initRepoWithRemote();
  pushRemoteCommit(remote, "trigger pull", "after\n");

  // Corrupt claims.jsonl so memory-sync's readJsonl throws
  const memoryFile = path.join(root, "claims.jsonl");
  fs.writeFileSync(memoryFile, "{NOT JSON\n");

  const result = runPreflight({ cwd: local, memoryFile });

  // Pull DID happen — gate must not undo that
  assert.equal(result.action, "fast_forward_pulled");
  assert.notEqual(result.after_head, result.before_head);

  // Sync failure surfaced as a warning, not a crash
  const joined = result.warnings.join("\n");
  assert.match(joined, /memory[ _-]?sync/i, `expected memory-sync warning, got: ${joined}`);
  assert.match(joined, /corrupt|JSONL|claims\.jsonl/i);
});
