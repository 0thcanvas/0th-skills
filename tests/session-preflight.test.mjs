import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { compactPreflightResult, runPreflight } from "../scripts/session-preflight.mjs";

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

  sh(root, ["git", "init", "--bare", "--initial-branch", "main", remote]);
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
  sh(path.dirname(remote), ["git", "clone", "--branch", "main", remote, clone]);
  sh(clone, ["git", "config", "user.email", "test@example.com"]);
  sh(clone, ["git", "config", "user.name", "Test User"]);
  writeFile(clone, "memory.txt", content);
  commit(clone, message);
  sh(clone, ["git", "push", "origin", "main"]);
}

test("preflight fast-forwards a clean branch that is behind upstream", () => {
  const { root, remote, local } = initRepoWithRemote();
  const memoryFile = path.join(root, "claims.jsonl");
  const repoStateFile = path.join(root, "repo-state.json");
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

  const result = runPreflight({ cwd: local, memoryFile, repoStateFile });
  const [claim] = readJsonl(memoryFile);
  const repoState = JSON.parse(fs.readFileSync(repoStateFile, "utf8"));

  assert.equal(result.branch, "main");
  assert.equal(result.clean, true);
  assert.equal(result.upstream, "origin/main");
  assert.equal(result.ahead, 0);
  assert.equal(result.behind, 0);
  assert.equal(result.upstream_relation, "up_to_date");
  assert.equal(result.action, "fast_forward_pulled");
  assert.equal(result.before_head, beforeHead);
  assert.notEqual(result.after_head, beforeHead);
  assert.match(result.fetched_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fs.readFileSync(path.join(local, "memory.txt"), "utf8"), "remote\n");
  assert.deepEqual(result.memory_sync.affected_claim_ids, ["memory-file-behavior"]);
  assert.equal(claim.lifecycle_state, "needs_review");
  assert.equal(claim.review.from_revision, beforeHead);
  assert.equal(claim.review.to_revision, result.after_head);
  assert.equal(repoState.last_seen_head, result.after_head);
  assert.equal(repoState.behind, 0);
  assert.equal(repoState.upstream_relation, "up_to_date");
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

test("preflight from a non-repo workspace returns a structured advisory with child repo candidates", () => {
  const workspace = tempDir("0th-preflight-workspace-");
  const childRepo = path.join(workspace, "skills");
  fs.mkdirSync(childRepo);
  sh(childRepo, ["git", "init", "-b", "main"]);
  sh(childRepo, ["git", "config", "user.email", "test@example.com"]);
  sh(childRepo, ["git", "config", "user.name", "Test User"]);
  writeFile(childRepo, "memory.txt", "initial\n");
  commit(childRepo, "initial");

  const repoStateFile = path.join(workspace, "state", "repo-state.json");
  const result = runPreflight({ cwd: workspace, repoStateFile });

  assert.equal(result.action, "not_a_repo");
  assert.equal(result.upstream_relation, "not_a_repo");
  assert.equal(result.repo_root, null);
  assert.equal(result.cwd, workspace);
  assert.equal(result.repo_state_file, repoStateFile);
  assert.equal(result.repo_state, null);
  assert.match(result.warnings.join("\n"), /not a git repository/i);
  assert.deepEqual(result.advisory.candidate_repos, [
    {
      name: "skills",
      path: childRepo
    }
  ]);
  assert.equal(result.advisory.state_path, repoStateFile);
});

test("compact preflight reports sync counts without embedding verbose arrays", () => {
  const compact = compactPreflightResult({
    repo_root: "/tmp/repo",
    repo_state_file: "/tmp/state.json",
    branch: "feature",
    clean: true,
    upstream: "origin/main",
    upstream_relation: "ahead",
    ahead: 2,
    behind: 0,
    before_head: "a".repeat(40),
    after_head: "b".repeat(40),
    fetched_at: "2026-07-10T00:00:00.000Z",
    fetch_ok: true,
    action: "ahead_only",
    memory_sync_failed: false,
    drift_sync_failed: false,
    repo_state_unreadable: false,
    warnings: [],
    drift_sync: {
      from_revision: "a".repeat(40),
      to_revision: "b".repeat(40),
      changed_sources: Array.from({ length: 200 }, (_, index) => `file-${index}.md`),
      affected_claim_ids: Array.from({ length: 20 }, (_, index) => `claim-${index}`),
      brief_updated: true
    },
    previous_repo_state: { last_seen_head: "a".repeat(40) },
    repo_state: { lock: { lock_path: "/tmp/lock" } }
  });

  assert.equal(compact.drift_sync.changed_source_count, 200);
  assert.equal(compact.drift_sync.affected_claim_count, 20);
  assert.equal(compact.drift_sync.brief_updated, true);
  assert.equal("changed_sources" in compact.drift_sync, false);
  assert.equal("affected_claim_ids" in compact.drift_sync, false);
  assert.equal("previous_repo_state" in compact, false);
  assert.equal("repo_state" in compact, false);
  assert.ok(JSON.stringify(compact).length < 2000);
});
