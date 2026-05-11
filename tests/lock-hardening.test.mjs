import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { withFileLock } from "../scripts/lib/lock.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lock-hardening-"));
}

test("withFileLock rejects non-finite TTL parameters", () => {
  const dir = tempDir();
  const target = path.join(dir, "file.jsonl");

  // Each of these is a degenerate value that pre-PR-21 silently caused
  // misbehavior. NaN staleMs meant "lockIsStale always returns false" =
  // deadlock; Infinity timeoutMs is a synonym for "wait forever, never
  // surface contention"; negative retryMs makes Atomics.wait reject or
  // busy-loop.
  for (const [field, value] of [
    ["staleMs", NaN],
    ["timeoutMs", Number.POSITIVE_INFINITY],
    ["retryMs", -1],
    ["staleMs", "thirty"]
  ]) {
    assert.throws(
      () => withFileLock(target, () => "ok", { [field]: value }),
      new RegExp(field),
      `expected ${field}=${value} to throw, got silent acceptance`
    );
  }
});

test("withFileLock rejects async callbacks instead of releasing lock early", () => {
  const dir = tempDir();
  const target = path.join(dir, "file.jsonl");

  // The current finally-release pattern releases the lock the moment the
  // callback returns. If the callback is an AsyncFunction, the lock is gone
  // before the awaited work resolves — silently breaking mutual exclusion.
  // Until we redesign the API to chain through .finally(), reject this shape
  // up front rather than silently break mutual exclusion.
  async function asyncCallback() {
    return "done";
  }
  assert.throws(
    () => withFileLock(target, asyncCallback),
    /async/i
  );
});

test("withFileLock rejects sync callbacks that return a Promise", () => {
  // PR #21 verifier F-partial: a plain `() => Promise.resolve(...)` is not
  // an `AsyncFunction` but it returns a thenable. Releasing the lock in
  // finally before the promise resolves silently breaks mutual exclusion
  // the same way. Detect the thenable return and throw.
  const dir = tempDir();
  const target = path.join(dir, "file.jsonl");
  assert.throws(
    () => withFileLock(target, () => Promise.resolve("done")),
    /Promise/i
  );
});

test("a stale reaper file (e.g., SIGKILL during reclaim) does not permanently block contention", () => {
  // PR #21 verifier finding: previously, if the reaper-holder crashed
  // (SIGKILL between openSync(reaper) and finally-unlink), every future
  // acquirer hit EEXIST on the reaper and reclaim returned null forever
  // until timeoutMs. Pin the recovery: pre-plant a stale reaper file with
  // an ancient mtime, alongside a stale lockdir; a fresh acquirer should
  // unlink the orphan reaper, reclaim the lockdir, and run its callback.
  const dir = tempDir();
  const target = path.join(dir, "claims.jsonl");
  const lockDir = `${target}.lock`;
  const reaperPath = `${lockDir}.reap`;

  // Pre-plant stale lockdir owned by dead pid (so lockIsStale returns true).
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, "owner.json"), JSON.stringify({
    pid: 99999997,
    host: os.hostname(),
    acquired_at: new Date().toISOString()
  }));
  // Pre-plant ancient reaper file (orphan from a crashed reaper-holder).
  fs.writeFileSync(reaperPath, "");
  const old = new Date("2000-01-01T00:00:00.000Z");
  fs.utimesSync(reaperPath, old, old);

  let ran = false;
  withFileLock(target, (state) => {
    ran = true;
    assert.equal(state.stale_removed, true);
  }, { timeoutMs: 500, retryMs: 5, staleMs: 200 });
  assert.equal(ran, true);
  // After release, neither reaper nor lockdir residue should remain.
  assert.equal(fs.existsSync(reaperPath), false, "stale reaper not cleaned up");
  assert.equal(fs.existsSync(lockDir), false, "lockdir not cleaned up after release");
});

test("withFileLock finally-rm error does not mask the callback's original error", () => {
  const dir = tempDir();
  const target = path.join(dir, "file.jsonl");
  // Mid-callback we replace lockDir with a regular file with mode 0 so rmSync
  // throws EACCES (or similar). The callback also throws its own diagnostic
  // error — the user MUST see the callback's error, not the rm error.
  const lockDir = `${target}.lock`;
  const callbackError = new Error("the real problem");
  let observed;
  try {
    withFileLock(target, () => {
      // Sabotage the lock dir so the upcoming rmSync in `finally` will throw.
      // Replacing the directory with a file is a deterministic way to make
      // fs.rmSync (recursive: true, force: true) raise ENOTDIR on the dir
      // itself when iterating. This simulates the EACCES/EBUSY classes
      // identified by the silent-failure review.
      fs.rmSync(lockDir, { recursive: true, force: true });
      fs.writeFileSync(lockDir, "intentionally not a dir");
      throw callbackError;
    });
  } catch (err) {
    observed = err;
  } finally {
    // Clean up the residue file we planted.
    if (fs.existsSync(lockDir)) {
      try { fs.unlinkSync(lockDir); } catch {}
    }
  }
  assert.equal(observed, callbackError, "callback error must propagate, not be masked by rm failure");
});

test("release failure marks the lock as reclaimable while preserving callback errors", () => {
  const dir = tempDir();
  const target = path.join(dir, "file.jsonl");
  const lockDir = `${target}.lock`;
  const originalRmSync = fs.rmSync;
  const callbackError = new Error("the real problem");
  let observed;
  let intercepted = false;

  fs.rmSync = function patchedRmSync(filePath, options) {
    if (filePath === lockDir && !intercepted) {
      intercepted = true;
      throw new Error("simulated release failure");
    }
    return originalRmSync.call(this, filePath, options);
  };

  try {
    withFileLock(target, () => {
      throw callbackError;
    });
  } catch (err) {
    observed = err;
  } finally {
    fs.rmSync = originalRmSync;
  }

  assert.equal(observed, callbackError, "callback error must remain primary");
  assert.equal(observed.release_error, "simulated release failure");

  const owner = JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
  assert.equal(owner.release_state, "release_failed");
  assert.equal(owner.pid, null);

  let reclaimed = false;
  withFileLock(target, (state) => {
    reclaimed = true;
    assert.equal(state.stale_removed, true);
  }, { timeoutMs: 500, staleMs: 10_000, retryMs: 5 });
  assert.equal(reclaimed, true);
});

test("two children racing on a stale lock do not both enter the critical section", async () => {
  // PR #21 review critical finding A: scripts/lib/lock.mjs:95-99 lets two
  // acquirers both rmSync the stale lock; both call mkdirSync and both
  // "succeed" because the second rm deletes the first's owner. Without the
  // O_EXCL reaper or rename-based fix, this test fails — the JSONL ends up
  // with fewer lines than children launched (lost writes).

  const dir = tempDir();
  const target = path.join(dir, "claims.jsonl");
  const lockDir = `${target}.lock`;

  // Pre-plant a lock owned by a dead pid on the SAME host. lockIsStale
  // returns true via the dead-pid signal regardless of `staleMs`, so every
  // child sees the pre-planted lock as immediately reclaimable. This is the
  // condition under which the TOCTOU race (PR #21 review finding A) was
  // most likely to trigger in production — a previous holder crashed and
  // the next session has six workflow agents racing to start.
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify({
    pid: 99999999,
    host: os.hostname(),
    acquired_at: new Date().toISOString()
  })}\n`);

  // Make the child do a read-modify-write WITH a small busy delay so the
  // critical section is long enough for a parallel intruder to overlap. If
  // the lock is honest, the N children's writes serialize and the JSONL has
  // exactly N lines. If the TOCTOU race lets two children into fn at once,
  // their read-then-write sequence loses at least one line.
  const child = `
    import { withFileLock } from "${path.resolve("scripts/lib/lock.mjs").replace(/\\\\/g, "/")}";
    import fs from "node:fs";
    const target = ${JSON.stringify(target)};
    withFileLock(target, () => {
      const line = JSON.stringify({ pid: process.pid, at: Date.now() }) + "\\n";
      const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
      // Widen the critical-section window so overlapping fn calls actually
      // collide. ~20ms is enough to make the race trigger reliably on macOS
      // and Linux CI runners without making the test slow.
      const start = Date.now();
      while (Date.now() - start < 20) {}
      fs.writeFileSync(target, existing + line);
    }, { staleMs: 500, timeoutMs: 8000, retryMs: 5 });
  `;

  const N = 6;
  const finished = await Promise.all(Array.from({ length: N }, () => {
    return new Promise((resolve) => {
      const c = spawn(process.execPath, ["--input-type=module", "-e", child], {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stderr = "";
      c.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      c.on("close", (code) => resolve({ code, stderr }));
    });
  }));
  const failures = finished.filter((r) => r.code !== 0);
  assert.equal(failures.length, 0, `child failures: ${failures.map((r) => r.stderr).join("\n")}`);
  const lines = fs.readFileSync(target, "utf8").trim().split("\n");
  assert.equal(lines.length, N, `expected ${N} writes, got ${lines.length} — TOCTOU race lost a write`);
  for (const line of lines) {
    assert.doesNotThrow(() => JSON.parse(line), `torn JSONL line: ${line}`);
  }
});

test("dead-pid lockfile is reclaimable on the same host", () => {
  // Companion to the cross-process test: this pins the documented
  // `processIsAlive` branch. A previous holder crashed (SIGKILL) and left
  // an owner.json with its dead pid. The next caller MUST reclaim, not
  // wait `staleMs` for mtime to tick over.

  const dir = tempDir();
  const target = path.join(dir, "claims.jsonl");
  const lockDir = `${target}.lock`;
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify({
    pid: 99999998,
    host: os.hostname(),
    acquired_at: new Date().toISOString()
  })}\n`);
  // Fresh mtime — so the only signal that this is reclaimable is the dead pid.
  const fresh = new Date();
  fs.utimesSync(lockDir, fresh, fresh);

  let ran = false;
  withFileLock(target, (state) => {
    ran = true;
    assert.equal(state.stale_removed, true, "expected stale_removed flag on dead-pid reclaim");
  }, { timeoutMs: 500, retryMs: 5 });
  assert.equal(ran, true);
});
