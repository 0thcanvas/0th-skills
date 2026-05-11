import fs from "node:fs";
import path from "node:path";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { resolveRepoStatePaths } from "./runtime-state.mjs";

export function readRepoState({
  cwd,
  repoStateFile = null
} = {}) {
  const resolvedRepoStateFile = repoStateFile ?? resolveRepoStatePaths({ cwd }).repoStateFile;
  if (!fs.existsSync(resolvedRepoStateFile)) return null;
  return JSON.parse(fs.readFileSync(resolvedRepoStateFile, "utf8"));
}

export function writeRepoState({
  cwd,
  repoStateFile = null,
  state
} = {}) {
  if (!state || typeof state !== "object") throw new Error("repo state is required");
  const resolvedRepoStateFile = repoStateFile ?? resolveRepoStatePaths({ cwd }).repoStateFile;
  return withFileLock(resolvedRepoStateFile, (lockState) => {
    fs.mkdirSync(path.dirname(resolvedRepoStateFile), { recursive: true });
    fs.writeFileSync(resolvedRepoStateFile, `${JSON.stringify(state, null, 2)}\n`);
    return {
      repo_state_file: resolvedRepoStateFile,
      written: true,
      lock: visibleLockState(lockState)
    };
  });
}
