// Shared JSONL helpers used by every memory/open-loop script.
//
// Before this module existed, six scripts each carried a near-identical copy
// of readJsonl + writeJsonlAtomic, and the copies had already drifted (the
// read-set-reconcile copy was missing mkdirSync on the write path, and the
// memory-sync copy returned null instead of [] when the source file was
// missing). The PR #19 review caught both as silent-failure surfaces.
//
// Invariants enforced here:
//   1. Parse failures include the filename AND line number, so a single bad
//      line in claims.jsonl does not brick the memory store with a generic
//      "Unexpected token" error.
//   2. writeJsonlAtomic always mkdirs the parent (recursive: true) so fresh
//      runtime state works without pre-existing directories.
//   3. The temp-file pattern uses pid suffixes to avoid same-process tmp
//      collisions and renames atomically on the local filesystem.
//
// Concurrency limitation (documented in references/memory-contract.md): the
// "read all, mutate, write all" pattern under concurrent writers can drop
// updates. Callers MUST treat memory + open-loop writes as single-writer.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Read a JSONL file into an array of parsed entries.
 *
 * @param {string} filePath
 * @param {object} [options]
 * @param {*} [options.missingValue]   Returned when the file does not exist.
 *                                     Defaults to `[]`. memory-sync uses
 *                                     `null` here to distinguish "no memory
 *                                     file yet" from "memory file is empty".
 * @returns {Array<object>}
 */
export function readJsonl(filePath, options = {}) {
  const missingValue = "missingValue" in options ? options.missingValue : [];
  if (!fs.existsSync(filePath)) return missingValue;
  const source = fs.readFileSync(filePath, "utf8").trim();
  if (!source) return [];

  const lines = source.split("\n");
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(
        `${filePath}: corrupt JSONL at line ${index + 1}: ${err.message}`
      );
    }
  });
}

/**
 * Write `entries` to `filePath` atomically (tmp + rename). Always recreates
 * any missing parent directories so callers never see ENOENT on first run.
 */
export function writeJsonlAtomic(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  const body = entries.length
    ? entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
    : "";
  fs.writeFileSync(tmpPath, body);
  fs.renameSync(tmpPath, filePath);
}
