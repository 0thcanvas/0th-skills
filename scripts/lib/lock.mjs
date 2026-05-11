import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_STALE_MS = 30000;
const DEFAULT_RETRY_MS = 20;

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function lockDirFor(targetPath) {
  return `${targetPath}.lock`;
}

function readLockInfo(lockDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function lockIsStale(lockDir, { now, staleMs }) {
  const owner = readLockInfo(lockDir);
  if (owner?.host === os.hostname() && processIsAlive(Number(owner.pid))) {
    return false;
  }

  try {
    const stats = fs.statSync(lockDir);
    return now() - stats.mtimeMs > staleMs;
  } catch {
    return true;
  }
}

function writeLockInfo(lockDir) {
  const info = {
    pid: process.pid,
    host: os.hostname(),
    acquired_at: new Date().toISOString()
  };
  fs.writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

function removeDirIfPresent(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

export function withFileLock(targetPath, fn, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  staleMs = DEFAULT_STALE_MS,
  retryMs = DEFAULT_RETRY_MS,
  now = () => Date.now()
} = {}) {
  if (!targetPath) throw new Error("lock targetPath is required");
  if (typeof fn !== "function") throw new Error("lock callback is required");

  const lockDir = lockDirFor(targetPath);
  const startedAt = now();
  const state = {
    lock_path: lockDir,
    waited_ms: 0,
    stale_removed: false
  };

  fs.mkdirSync(path.dirname(lockDir), { recursive: true });

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      const owner = writeLockInfo(lockDir);
      state.acquired = true;
      state.owner = owner;
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;

      if (lockIsStale(lockDir, { now, staleMs })) {
        removeDirIfPresent(lockDir);
        state.stale_removed = true;
        continue;
      }

      const waited = now() - startedAt;
      if (waited > timeoutMs) {
        const owner = readLockInfo(lockDir);
        throw new Error(
          `timed out waiting for lock: ${lockDir}${owner?.pid ? ` (owner pid ${owner.pid})` : ""}`
        );
      }

      sleepSync(retryMs);
      state.waited_ms = now() - startedAt;
    }
  }

  try {
    return fn(state);
  } finally {
    removeDirIfPresent(lockDir);
  }
}

export function visibleLockState(lockState) {
  if (!lockState) return null;
  return {
    lock_path: lockState.lock_path,
    waited_ms: Math.round(lockState.waited_ms ?? 0),
    stale_removed: Boolean(lockState.stale_removed)
  };
}
