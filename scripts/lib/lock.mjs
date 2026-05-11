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

function reaperPathFor(lockDir) {
  // The reaper is a sentinel file that serializes the rm-and-remkdir
  // sequence used to reclaim a stale lock. Holding the reaper prevents
  // another acquirer from racing into the "lockdir was removed but not yet
  // recreated" gap and mkdir'ing the lock for itself. See
  // `tests/lock-hardening.test.mjs` "two children racing on a stale lock"
  // for the regression harness (PR #21 review finding A).
  return `${lockDir}.reap`;
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
  // Same-host liveness is the high-confidence signal. If the owner says it's
  // alive on this host and the OS agrees the pid exists, the lock is not
  // stale — even if mtime looks ancient.
  if (owner?.host === os.hostname()) {
    if (processIsAlive(Number(owner.pid))) return false;
    // Same host, dead pid — reclaimable now, no need to wait `staleMs`.
    return true;
  }

  // For locks with no owner.json or for cross-host owners we fall back to
  // mtime. The contract is documented in `references/memory-contract.md`:
  // single-writer assumed; cross-host concurrency uses mtime-only staleness.
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

function markLockReleaseFailed(lockDir, err) {
  try {
    const info = {
      pid: null,
      host: os.hostname(),
      acquired_at: null,
      release_state: "release_failed",
      release_failed_at: new Date().toISOString(),
      release_error: err.message
    };
    fs.writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify(info, null, 2)}\n`);
  } catch {
    // Best effort only. If the marker cannot be written, timeout/stale handling
    // still prevents silent success, and the release error is surfaced below.
  }
}

function fastAcquire(lockDir) {
  // The "no contention" path. mkdirSync is atomic on every filesystem we
  // support: only one process wins. We then write the owner.json so future
  // readers can tell who owns the lock and whether the owner is alive.
  try {
    fs.mkdirSync(lockDir);
  } catch (err) {
    if (err.code === "EEXIST") return null;
    throw err;
  }
  return writeLockInfo(lockDir);
}

function reaperIsStale(reaperPath, { now, staleMs }) {
  // PR #21 verifier finding: if a process SIGKILLed mid-reclaim, the .reap
  // file persists and every subsequent acquirer gets EEXIST on the reaper
  // forever. Treat the reaper itself as stale if its mtime is older than
  // `staleMs` (same threshold as the lockdir). The reaper window is meant
  // to be sub-millisecond, so any age > staleMs strongly implies the holder
  // crashed.
  try {
    const stats = fs.statSync(reaperPath);
    return now() - stats.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

function tryReclaim(lockDir, staleOptions) {
  // The reaper file serializes EVERY mutation of a contested lockdir. Only
  // the process that wins the exclusive `wx` create may modify the lockdir
  // inside this critical section. All other acquirers either back off (if
  // they lose the reaper race) or take the fast path on their next loop
  // iteration. Without this critical section the original code had a TOCTOU
  // race: two acquirers could both rm a stale lockdir and both subsequently
  // mkdir into the gap.
  const reaperPath = reaperPathFor(lockDir);
  let fd;
  try {
    fd = fs.openSync(reaperPath, "wx");
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    // The reaper exists. Most of the time this is fine — another acquirer is
    // doing the reclaim and we should back off. But if the previous reaper
    // holder crashed with SIGKILL, the file persists forever. Detect that
    // case and unlink the orphan, then retry. We only unlink if the reaper
    // is older than `staleMs`, so this never races a live reaper-holder.
    if (reaperIsStale(reaperPath, staleOptions)) {
      try { fs.rmSync(reaperPath, { force: true }); } catch {}
      // Re-attempt the wx create. If we lose again (another contender raced
      // ahead of us), back off normally.
      try {
        fd = fs.openSync(reaperPath, "wx");
      } catch (err2) {
        if (err2.code === "EEXIST") return null;
        throw err2;
      }
    } else {
      return null;
    }
  }
  try {
    // Someone else may have already finished the reclaim while we waited
    // on the reaper open. Re-check from scratch.
    if (!fs.existsSync(lockDir)) {
      // The lockdir was removed by a previous holder's finally-release.
      // Acquire it directly while we still hold the reaper, so no one can
      // sneak in between our existsSync and mkdir.
      return fastAcquire(lockDir);
    }
    if (!lockIsStale(lockDir, staleOptions)) return null;
    // Lockdir is stale. Remove it AND remkdir AND write owner.json all
    // while the reaper protects the sequence. After we release the reaper
    // the lockdir is in a fully populated state — no other process can
    // observe an empty/ownerless interregnum and steal it.
    removeDirIfPresent(lockDir);
    return fastAcquire(lockDir);
  } finally {
    try { fs.closeSync(fd); } catch {}
    fs.rmSync(reaperPath, { force: true });
  }
}

function assertDuration(name, value, { allowZero = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number, got ${typeof value === "number" ? value : typeof value}`);
  }
  if (value < 0 || (!allowZero && value === 0)) {
    throw new Error(`${name} must be ${allowZero ? "≥ 0" : "> 0"}, got ${value}`);
  }
}

function assertSyncCallback(fn) {
  // The current contract is "fn runs synchronously inside the lock; we
  // release in finally." Returning a Promise from fn would silently release
  // the lock before the awaited work resolved. Until we redesign the API
  // to chain through .finally(), reject async callbacks at the boundary
  // rather than silently break mutual exclusion (PR #21 review finding F).
  if (typeof fn !== "function") throw new Error("lock callback is required");
  const ctorName = fn.constructor?.name;
  if (ctorName === "AsyncFunction") {
    throw new Error("withFileLock callback must be synchronous (received an async function); see scripts/lib/lock.mjs");
  }
}

export function withFileLock(targetPath, fn, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  staleMs = DEFAULT_STALE_MS,
  retryMs = DEFAULT_RETRY_MS,
  now = () => Date.now()
} = {}) {
  if (!targetPath) throw new Error("lock targetPath is required");
  assertSyncCallback(fn);
  // PR #21 review finding G: pre-fix, any of these could slip through as
  // NaN/Infinity/negative, causing silent misbehavior (NaN staleMs = never
  // stale = deadlock; Infinity timeoutMs = wait forever).
  assertDuration("timeoutMs", timeoutMs, { allowZero: true });
  assertDuration("staleMs", staleMs);
  assertDuration("retryMs", retryMs);

  const lockDir = lockDirFor(targetPath);
  const startedAt = now();
  const state = {
    lock_path: lockDir,
    waited_ms: 0,
    stale_removed: false
  };

  fs.mkdirSync(path.dirname(lockDir), { recursive: true });

  while (true) {
    const fast = fastAcquire(lockDir);
    if (fast) {
      state.acquired = true;
      state.owner = fast;
      break;
    }

    if (lockIsStale(lockDir, { now, staleMs })) {
      const reclaimed = tryReclaim(lockDir, { now, staleMs });
      if (reclaimed) {
        state.acquired = true;
        state.owner = reclaimed;
        state.stale_removed = true;
        break;
      }
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

  let returnValue;
  let callbackError = null;
  try {
    returnValue = fn(state);
    // PR #21 review verifier finding F-partial: AsyncFunction is
    // caught at the boundary, but a plain `() => somethingAsync()` returns
    // a thenable too. Detect any thenable return and throw — releasing
    // the lock in finally before the promise resolves would silently break
    // mutual exclusion.
    if (returnValue && typeof returnValue.then === "function") {
      throw new Error("withFileLock callback returned a Promise; the lock would release before the awaited work resolves. Refactor the callback to be synchronous or wrap async work outside the lock.");
    }
  } catch (err) {
    callbackError = err;
  }

  let releaseError = null;
  try {
    removeDirIfPresent(lockDir);
  } catch (err) {
    releaseError = err;
    markLockReleaseFailed(lockDir, err);
  }

  if (callbackError) {
    if (releaseError) callbackError.release_error = releaseError.message;
    throw callbackError;
  }
  if (releaseError) {
    throw new Error(`failed to release lock: ${lockDir}: ${releaseError.message}`);
  }
  return returnValue;
}

export function visibleLockState(lockState) {
  if (!lockState) return null;
  return {
    lock_path: lockState.lock_path,
    waited_ms: Math.round(lockState.waited_ms ?? 0),
    stale_removed: Boolean(lockState.stale_removed)
  };
}
