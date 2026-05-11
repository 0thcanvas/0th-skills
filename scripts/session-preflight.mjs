#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import process from "node:process";
import { runMemorySync } from "./memory-sync.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { writeStderrLine } from "./lib/diagnostics.mjs";
import { readRepoState, writeRepoState } from "./repo-state.mjs";
import { resolveRepoStatePaths } from "./runtime-state.mjs";

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

export function runPreflight({
  cwd = process.cwd(),
  allowPull = true,
  memoryFile,
  repoStateFile
} = {}) {
  const repoRoot = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  const branch = runGit(repoRoot, ["branch", "--show-current"]) || "DETACHED";
  const beforeHead = runGit(repoRoot, ["rev-parse", "HEAD"]);
  const fetchedAt = new Date().toISOString();
  const resolvedRepoStateFile = repoStateFile ?? resolveRepoStatePaths({ cwd: repoRoot }).repoStateFile;
  const warnings = [];
  // PR #21 review: readRepoState now returns a structured `{ unreadable }`
  // sentinel rather than throwing on parse failure. Surface the unreadable
  // case as a warning and fall back to first-preflight semantics
  // (`previousRepoState = null`). Without this guard the entire preflight
  // aborted on a corrupt or partially-written `state.json`.
  const previousRepoStateRaw = readRepoState({ cwd: repoRoot, repoStateFile: resolvedRepoStateFile });
  const repoStateUnreadable = previousRepoStateRaw?.unreadable === true;
  if (repoStateUnreadable) {
    warnings.push(`repo state unreadable; ignoring ${previousRepoStateRaw.repo_state_file}: ${previousRepoStateRaw.error}`);
  }
  const previousRepoState = repoStateUnreadable ? null : previousRepoStateRaw;
  let driftSync = null;
  let memorySyncFailed = false;
  let driftSyncFailed = false;

  if (
    previousRepoState?.last_seen_head &&
    previousRepoState.last_seen_head !== beforeHead
  ) {
    try {
      driftSync = runMemorySync({
        cwd: repoRoot,
        from: previousRepoState.last_seen_head,
        to: beforeHead,
        ...(memoryFile ? { memoryFile } : {})
      });
    } catch (err) {
      // PR #21 verifier I5-partial: pre-fix the drift-sync failure was
      // warning-only, parallel to the post-FF memory-sync failure which
      // (after the first slice) gained a structured `memory_sync_failed`
      // flag. Surface drift-sync failure the same way so downstream gates
      // can branch on it without string-matching warnings.
      driftSyncFailed = true;
      warnings.push(`memory-sync failed for previously unseen HEAD drift: ${err.message}`);
    }
  }

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
  const initialRelation = upstream ? readAheadBehind(repoRoot) : { ahead: 0, behind: 0 };
  const { ahead: initialAhead, behind: initialBehind } = initialRelation;

  let action = "up_to_date";
  let memorySync = null;
  if (!upstream) {
    action = "no_upstream";
    warnings.push("current branch has no upstream");
  } else if (initialAhead > 0 && initialBehind > 0) {
    action = "blocked_divergent";
    warnings.push("branch is divergent; refusing to auto-merge, reset, or stash");
  } else if (initialBehind > 0 && !clean) {
    action = "blocked_dirty_behind";
    warnings.push("branch is behind upstream but working tree is dirty; refusing to auto-pull");
  } else if (initialBehind > 0 && allowPull) {
    // Pull with allowFailure so a failed --ff-only (ref-lock contention,
    // remote moved between fetch and pull, hook rejection) doesn't erase
    // the structured preflight result. The agent gets a named action +
    // warning instead of a raw git stack trace.
    const pullResult = runGit(repoRoot, ["pull", "--ff-only"], { allowFailure: true });
    if (pullResult === null) {
      action = "fast_forward_failed";
      warnings.push("git pull --ff-only failed after a successful fetch; HEAD is unchanged");
    } else {
      action = "fast_forward_pulled";
    }
  } else if (initialBehind > 0) {
    action = "fast_forward_available";
  } else if (initialAhead > 0) {
    action = "ahead_only";
  }

  const afterHead = runGit(repoRoot, ["rev-parse", "HEAD"]);
  if (action === "fast_forward_pulled") {
    // Capture memory-sync failure (e.g., corrupt claims.jsonl) into the
    // warnings array so the fast-forward result survives the failure. The
    // pull already moved HEAD; throwing here would erase that structured
    // signal and the user would have no idea what state the repo is in
    // (caught by PR #19 counterpart review as N2).
    try {
      memorySync = runMemorySync({
        cwd: repoRoot,
        from: beforeHead,
        to: afterHead,
        ...(memoryFile ? { memoryFile } : {})
      });
    } catch (err) {
      // PR #21 review I5: pre-fix, only the warning carried the signal that
      // memory-sync failed after the fast-forward. Downstream agent gates
      // keyed on `action: "fast_forward_pulled"` saw a healthy-looking
      // result and proceeded on stale claims. The structured flag below
      // lets gates branch on the failure without string-matching warnings.
      memorySyncFailed = true;
      warnings.push(`memory-sync failed after fast-forward: ${err.message}`);
    }
  }

  const { ahead, behind } = upstream ? readAheadBehind(repoRoot) : { ahead: 0, behind: 0 };
  const upstreamRelation = relationFor({ upstream, ahead, behind });
  const repoState = {
    repo_root: repoRoot,
    branch,
    clean,
    upstream,
    upstream_relation: upstreamRelation,
    ahead,
    behind,
    last_seen_head: afterHead,
    previous_seen_head: previousRepoState?.last_seen_head ?? null,
    fetched_at: fetchedAt,
    last_memory_sync_at: (memorySync || driftSync) ? new Date().toISOString() : previousRepoState?.last_memory_sync_at ?? null,
    action,
    memory_sync_failed: memorySyncFailed,
    drift_sync_failed: driftSyncFailed,
    repo_state_unreadable: repoStateUnreadable,
    warnings
  };
  const repoStateWrite = writeRepoState({
    cwd: repoRoot,
    repoStateFile: resolvedRepoStateFile,
    state: repoState
  });

  if (memorySyncFailed) {
    writeStderrLine("preflight-degraded: memory_sync_failed after fast-forward; memory claims may be stale until reconciled");
  }
  if (driftSyncFailed) {
    writeStderrLine("preflight-degraded: drift_sync_failed for unseen HEAD drift; memory claims may be stale until reconciled");
  }
  if (repoStateUnreadable) {
    writeStderrLine(`preflight-degraded: repo_state_unreadable; ignoring corrupt ${previousRepoStateRaw.repo_state_file}`);
  }

  const result = {
    repo_root: repoRoot,
    repo_state_file: resolvedRepoStateFile,
    branch,
    clean,
    upstream,
    upstream_relation: upstreamRelation,
    ahead,
    behind,
    before_head: beforeHead,
    after_head: afterHead,
    fetched_at: fetchedAt,
    fetch_ok: fetchOk,
    action,
    memory_sync_failed: memorySyncFailed,
    drift_sync_failed: driftSyncFailed,
    repo_state_unreadable: repoStateUnreadable,
    warnings
  };

  if (previousRepoState) {
    result.previous_repo_state = {
      last_seen_head: previousRepoState.last_seen_head,
      branch: previousRepoState.branch,
      last_memory_sync_at: previousRepoState.last_memory_sync_at
    };
  }
  if (driftSync) {
    result.drift_sync = driftSync;
  }
  if (memorySync) {
    result.memory_sync = memorySync;
  }
  result.repo_state = repoStateWrite;

  return result;
}

function main() {
  const args = process.argv.slice(2);
  const allowPull = !args.includes("--no-pull");
  const memoryFileIndex = args.indexOf("--memory-file");
  const memoryFile = memoryFileIndex === -1 ? undefined : args[memoryFileIndex + 1];
  const repoStateFileIndex = args.indexOf("--repo-state-file");
  const repoStateFile = repoStateFileIndex === -1 ? undefined : args[repoStateFileIndex + 1];
  const result = runPreflight({ cwd: process.cwd(), allowPull, memoryFile, repoStateFile });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
