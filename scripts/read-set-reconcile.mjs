#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { assertNoSecretLikeText } from "./lib/redaction.mjs";
import { runBriefGeneration } from "./memory-brief.mjs";
import { resolveMemoryPaths } from "./runtime-state.mjs";

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
  briefFile,
  confirmedAt = new Date().toISOString(),
  updateBrief = true,
  cwd = process.cwd()
}) {
  if (!readSet) throw new Error("readSet is required");
  // Default memoryFile + briefFile after cwd is known so the CLI can be
  // invoked as documented in skills/build/SKILL.md:
  //   `node read-set-reconcile.mjs --read-set <path>`
  // without forcing every caller to thread --memory-file through. The default
  // runtime state lives outside the product repo checkout.
  const defaults = resolveMemoryPaths({ cwd });
  const resolvedMemoryFile = memoryFile ?? defaults.memoryFile;
  const resolvedBriefFile = briefFile ?? (
    memoryFile ? path.join(path.dirname(resolvedMemoryFile), "brief.md") : defaults.briefFile
  );

  return withFileLock(resolvedMemoryFile, (lockState) => {
    const normalizedReadSet = normalizeReadSet(readSet);

    // PR #21 review NEW3: verification.evidence and verification.evidence_path
    // get spliced into the on-disk `review` block (and surface in briefs) with
    // no redaction check. The explorer agent emits these strings; an
    // adversarial or careless prompt could land a raw token here. Same guard
    // contract as the canonical writers.
    for (const verified of normalizedReadSet.verified_claims) {
      assertNoSecretLikeText([
        verified.evidence,
        verified.evidence_path
      ], `read-set verification for claim ${verified.id} contains secret-like content; redact it before writing`);
    }

    const claims = readJsonl(resolvedMemoryFile);
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

    writeJsonlAtomic(resolvedMemoryFile, nextClaims);

    // Same brief-staleness guard as memory-sync: lifecycle-state mutations
    // here can flip claims from needs_review -> active (on "confirmed") or
    // active -> needs_review (on "contradicted"). Regenerate the brief so
    // it doesn't show a stale lifecycle until the next memory-write.
    let brief = null;
    let briefError = null;
    if (updateBrief && updated.length > 0) {
      try {
        brief = runBriefGeneration({ cwd, memoryFile: resolvedMemoryFile, outputFile: resolvedBriefFile });
      } catch (err) {
        briefError = err.message;
      }
    }

    return {
      memory_file: resolvedMemoryFile,
      read_set: normalizedReadSet,
      checked_claim_ids: checked,
      updated_claim_ids: updated,
      brief_updated: Boolean(brief),
      brief_error: briefError,
      lock: visibleLockState(lockState)
    };
  });
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

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
