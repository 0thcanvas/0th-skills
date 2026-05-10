#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const source = fs.readFileSync(filePath, "utf8").trim();
  if (!source) return [];
  return source.split("\n").map((line) => JSON.parse(line));
}

function writeJsonlAtomic(filePath, entries) {
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  fs.renameSync(tmpPath, filePath);
}

function normalizedArray(value) {
  return [...new Set(value ?? [])].sort();
}

function normalizeReadSet(readSet) {
  return {
    files: normalizedArray(readSet.files),
    symbols: normalizedArray(readSet.symbols),
    tests: normalizedArray(readSet.tests),
    claims: normalizedArray(readSet.claims),
    verified_claims: readSet.verified_claims ?? []
  };
}

function intersects(left, right) {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function inReadSet(claim, readSet) {
  const sourcePaths = claim.source_paths ?? [];
  const sourceSymbols = claim.source_symbols ?? [];
  return intersects(sourcePaths, readSet.files) || intersects(sourceSymbols, readSet.symbols);
}

export function reconcileReadSet({
  memoryFile,
  readSet,
  confirmedAt = new Date().toISOString()
}) {
  if (!memoryFile) throw new Error("memoryFile is required");
  if (!readSet) throw new Error("readSet is required");

  const normalizedReadSet = normalizeReadSet(readSet);
  const claims = readJsonl(memoryFile);
  const verifiedById = new Map(normalizedReadSet.verified_claims.map((claim) => [claim.id, claim]));
  const checked = [];
  const updated = [];

  const nextClaims = claims.map((claim) => {
    if (!inReadSet(claim, normalizedReadSet)) return claim;

    checked.push(claim.id);
    const verification = verifiedById.get(claim.id);
    if (!verification) return claim;

    if (verification.outcome === "contradicted") {
      updated.push(claim.id);
      return {
        ...claim,
        lifecycle_state: "needs_review",
        review: {
          reason: "verified_contradiction",
          evidence: verification.evidence ?? "",
          evidence_path: verification.evidence_path,
          checked_files: normalizedReadSet.files,
          checked_symbols: normalizedReadSet.symbols,
          checked_tests: normalizedReadSet.tests,
          marked_at: confirmedAt
        }
      };
    }

    if (verification.outcome === "confirmed") {
      updated.push(claim.id);
      const { review: _review, ...rest } = claim;
      return {
        ...rest,
        lifecycle_state: "active",
        last_confirmed_at: confirmedAt
      };
    }

    return claim;
  });

  writeJsonlAtomic(memoryFile, nextClaims);

  return {
    memory_file: memoryFile,
    read_set: normalizedReadSet,
    checked_claim_ids: checked,
    updated_claim_ids: updated
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--memory-file") {
      options.memoryFile = argv[++index];
      continue;
    }
    if (token === "--read-set") {
      options.readSetPath = argv[++index];
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  if (!options.readSetPath) throw new Error("--read-set is required");
  return options;
}

function main() {
  const { memoryFile, readSetPath } = parseArgs(process.argv.slice(2));
  const readSet = JSON.parse(fs.readFileSync(readSetPath, "utf8"));
  const result = reconcileReadSet({ memoryFile, readSet });
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
