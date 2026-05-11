// Unit tests for the shared JSONL + CLI helpers introduced as part of the
// PR #19 review fixes. The helpers replace six near-duplicated readJsonl
// implementations and four near-duplicated writeJsonlAtomic implementations
// across scripts/memory-*.mjs, scripts/open-loop*.mjs, and
// scripts/read-set-reconcile.mjs.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJsonl, writeJsonlAtomic } from "../scripts/lib/jsonl.mjs";
import { isInvokedAsCli } from "../scripts/lib/cli.mjs";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jsonl-lib-"));
}

test("readJsonl: returns [] when file is missing", () => {
  const dir = tmp();
  assert.deepEqual(readJsonl(path.join(dir, "missing.jsonl")), []);
});

test("readJsonl: returns custom missingValue when file is missing", () => {
  const dir = tmp();
  assert.equal(readJsonl(path.join(dir, "missing.jsonl"), { missingValue: null }), null);
});

test("readJsonl: returns [] on empty file", () => {
  const dir = tmp();
  const f = path.join(dir, "empty.jsonl");
  fs.writeFileSync(f, "");
  assert.deepEqual(readJsonl(f), []);
});

test("readJsonl: parses well-formed JSONL", () => {
  const dir = tmp();
  const f = path.join(dir, "ok.jsonl");
  fs.writeFileSync(f, '{"a":1}\n{"b":2}\n');
  assert.deepEqual(readJsonl(f), [{ a: 1 }, { b: 2 }]);
});

test("readJsonl: error includes file path AND line number on corruption", () => {
  const dir = tmp();
  const f = path.join(dir, "corrupt.jsonl");
  fs.writeFileSync(f, '{"a":1}\nNOT JSON\n{"b":2}\n');

  assert.throws(
    () => readJsonl(f),
    (err) => {
      const msg = err.message;
      assert.match(msg, /corrupt\.jsonl/, "error must include the filename");
      assert.match(msg, /line 2/i, "error must point at the offending line");
      return true;
    }
  );
});

test("writeJsonlAtomic: creates parent directories that do not yet exist", () => {
  const dir = tmp();
  const f = path.join(dir, "deeply", "nested", "claims.jsonl");
  writeJsonlAtomic(f, [{ id: "a" }, { id: "b" }]);
  assert.equal(fs.existsSync(f), true);
  assert.deepEqual(readJsonl(f), [{ id: "a" }, { id: "b" }]);
});

test("writeJsonlAtomic: writes via tmp + rename (atomic on the local FS)", () => {
  const dir = tmp();
  const f = path.join(dir, "atomic.jsonl");
  writeJsonlAtomic(f, [{ x: 1 }]);
  // No leftover tmp file
  const leftovers = fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("writeJsonlAtomic: empty entries writes an empty file (and readJsonl roundtrips to [])", () => {
  const dir = tmp();
  const f = path.join(dir, "empty.jsonl");
  writeJsonlAtomic(f, []);
  assert.deepEqual(readJsonl(f), []);
});

test("isInvokedAsCli: returns false when process.argv[1] is undefined", () => {
  // Simulated; we can't easily mutate import.meta.url, so this checks the
  // defensive null-guard rather than the equality path.
  const fakeMetaUrl = "file:///nowhere.mjs";
  assert.equal(isInvokedAsCli(fakeMetaUrl, undefined), false);
});

test("isInvokedAsCli: returns true when realpath of argv[1] matches import.meta.url", () => {
  // Use this very test file as both inputs to validate the canonical-path
  // matching. The file definitely exists, so realpathSync resolves it.
  const here = new URL(import.meta.url);
  // Strip the file:// prefix and feed both forms in
  const realPath = fs.realpathSync(here.pathname);
  assert.equal(isInvokedAsCli(import.meta.url, realPath), true);
});

test("isInvokedAsCli: tolerates symlinked /tmp -> /private/tmp on macOS", () => {
  // Create a file then a symlink to it; ensure both inputs resolve to canonical
  const dir = tmp();
  const realFile = path.join(dir, "real.mjs");
  fs.writeFileSync(realFile, "// real");
  const linkDir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonl-link-"));
  const link = path.join(linkDir, "link.mjs");
  fs.symlinkSync(realFile, link);

  const fileUrl = `file://${realFile}`;
  assert.equal(isInvokedAsCli(fileUrl, link), true);
});
