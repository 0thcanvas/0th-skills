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
  const { remote, local } = initRepoWithRemote();
  const beforeHead = sh(local, ["git", "rev-parse", "HEAD"]);
  pushRemoteCommit(remote, "remote update", "remote\n");

  const result = runPreflight({ cwd: local });

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
