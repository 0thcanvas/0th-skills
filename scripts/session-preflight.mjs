#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";

function runGit(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (err) {
    if (allowFailure) return null;
    const stderr = err.stderr ? String(err.stderr).trim() : err.message;
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
}

function readAheadBehind(repoRoot) {
  const out = runGit(repoRoot, ["rev-list", "--left-right", "--count", "HEAD...@{u}"], {
    allowFailure: true
  });
  if (!out) return { ahead: 0, behind: 0 };
  const [aheadRaw, behindRaw] = out.split(/\s+/);
  return {
    ahead: Number.parseInt(aheadRaw, 10) || 0,
    behind: Number.parseInt(behindRaw, 10) || 0
  };
}

function relationFor({ upstream, ahead, behind }) {
  if (!upstream) return "none";
  if (ahead > 0 && behind > 0) return "divergent";
  if (behind > 0) return "behind";
  if (ahead > 0) return "ahead";
  return "up_to_date";
}

export function runPreflight({ cwd = process.cwd(), allowPull = true } = {}) {
  const repoRoot = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const branch = runGit(repoRoot, ["branch", "--show-current"]) || "DETACHED";
  const beforeHead = runGit(repoRoot, ["rev-parse", "HEAD"]);
  const fetchedAt = new Date().toISOString();
  const warnings = [];

  const fetchResult = runGit(repoRoot, ["fetch", "--all", "--prune"], { allowFailure: true });
  const fetchOk = fetchResult !== null;
  if (!fetchOk) {
    warnings.push("git fetch failed; upstream relation may be stale");
  }

  const upstream = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
    allowFailure: true
  });
  const status = runGit(repoRoot, ["status", "--porcelain"]);
  const clean = status.length === 0;
  const { ahead, behind } = upstream ? readAheadBehind(repoRoot) : { ahead: 0, behind: 0 };

  let action = "up_to_date";
  if (!upstream) {
    action = "no_upstream";
    warnings.push("current branch has no upstream");
  } else if (ahead > 0 && behind > 0) {
    action = "blocked_divergent";
    warnings.push("branch is divergent; refusing to auto-merge, reset, or stash");
  } else if (behind > 0 && !clean) {
    action = "blocked_dirty_behind";
    warnings.push("branch is behind upstream but working tree is dirty; refusing to auto-pull");
  } else if (behind > 0 && allowPull) {
    runGit(repoRoot, ["pull", "--ff-only"]);
    action = "fast_forward_pulled";
  } else if (behind > 0) {
    action = "fast_forward_available";
  } else if (ahead > 0) {
    action = "ahead_only";
  }

  const afterHead = runGit(repoRoot, ["rev-parse", "HEAD"]);

  return {
    repo_root: repoRoot,
    branch,
    clean,
    upstream,
    upstream_relation: relationFor({ upstream, ahead, behind }),
    ahead,
    behind,
    before_head: beforeHead,
    after_head: afterHead,
    fetched_at: fetchedAt,
    fetch_ok: fetchOk,
    action,
    warnings
  };
}

function main() {
  const args = process.argv.slice(2);
  const allowPull = !args.includes("--no-pull");
  const result = runPreflight({ cwd: process.cwd(), allowPull });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
