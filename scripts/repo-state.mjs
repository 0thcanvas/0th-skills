import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { resolveRepoStatePaths } from "./runtime-state.mjs";

/**
 * Read `state.json` for a repo, returning one of three shapes:
 *   - null               → file does not exist; treat as "first preflight"
 *   - { unreadable, … }  → file exists but parse failed; caller decides
 *                          whether to fall back to first-preflight semantics
 *   - <state object>     → normal happy path
 *
 * Pre-PR-21-review, this function did a raw `JSON.parse` and threw straight
 * out into `session-preflight`, aborting the entire workflow before any
 * warning could be raised. `scripts/memory-maintain.mjs:64-70` already had
 * the defensive sentinel pattern; this brings repo-state in line with it.
 */
export function readRepoState({
  cwd,
  repoStateFile = null
} = {}) {
  const resolvedRepoStateFile = repoStateFile ?? resolveRepoStatePaths({ cwd }).repoStateFile;
  if (!fs.existsSync(resolvedRepoStateFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolvedRepoStateFile, "utf8"));
  } catch (err) {
    return {
      unreadable: true,
      repo_state_file: resolvedRepoStateFile,
      error: err.message
    };
  }
}

/**
 * Atomic JSON writer used for `state.json`. Without tmp+rename, a crash
 * mid-write left the file truncated and the next preflight aborted with a
 * raw `SyntaxError`. The atomic pattern guarantees that a reader sees either
 * the previous full content or the new full content, never a partial one
 * (PR #21 review finding E).
 */
function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}

export function writeRepoState({
  cwd,
  repoStateFile = null,
  state
} = {}) {
  if (!state || typeof state !== "object") throw new Error("repo state is required");
  const resolvedRepoStateFile = repoStateFile ?? resolveRepoStatePaths({ cwd }).repoStateFile;
  return withFileLock(resolvedRepoStateFile, (lockState) => {
    writeJsonAtomic(resolvedRepoStateFile, state);
    return {
      repo_state_file: resolvedRepoStateFile,
      written: true,
      lock: visibleLockState(lockState)
    };
  });
}
