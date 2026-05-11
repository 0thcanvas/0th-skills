#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { runBriefGeneration } from "./memory-brief.mjs";

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function changedSources(cwd, from, to) {
  const out = runGit(cwd, ["diff", "--name-only", `${from}..${to}`]);
  if (!out) return [];
  return out.split("\n").filter(Boolean).sort();
}

function normalizeSourcePath(sourcePath) {
  return sourcePath
    .replace(/^\.\//, "")
    .replace(/#.*$/, "")
    .replace(/:\d+(?::\d+)?$/, "");
}

function readMemoryClaims(filePath) {
  // memory-sync wants to distinguish "no memory file yet" (null = nothing to
  // do) from "memory file is present but currently empty" ([]). Pass the
  // missingValue knob so the shared helper preserves that signal.
  return readJsonl(filePath, { missingValue: null });
}

function matchingSources(claim, changed) {
  const changedSet = new Set(changed);
  return (claim.source_paths ?? [])
    .map(normalizeSourcePath)
    .filter((sourcePath) => changedSet.has(sourcePath));
}

export function runMemorySync({
  cwd = process.cwd(),
  from,
  to,
  memoryFile = path.join(cwd, ".0th", "memory", "claims.jsonl"),
  briefFile = path.join(cwd, ".0th", "memory", "brief.md"),
  syncedAt = new Date().toISOString(),
  updateBrief = true
} = {}) {
  if (!from) throw new Error("--from is required");
  if (!to) throw new Error("--to is required");

  const changed = changedSources(cwd, from, to);
  const claims = readMemoryClaims(memoryFile);
  if (claims === null) {
    return {
      memory_file: memoryFile,
      memory_file_exists: false,
      from_revision: from,
      to_revision: to,
      changed_sources: changed,
      affected_claim_ids: [],
      brief_updated: false,
      brief_error: null
    };
  }

  const affected = [];
  const updatedClaims = claims.map((claim) => {
    const matches = matchingSources(claim, changed);
    if (matches.length === 0) return claim;

    affected.push(claim.id);
    return {
      ...claim,
      lifecycle_state: "needs_review",
      review: {
        reason: "source_changed",
        from_revision: from,
        to_revision: to,
        changed_sources: matches,
        marked_at: syncedAt
      }
    };
  });

  writeJsonlAtomic(memoryFile, updatedClaims);

  // Regenerate the machine-facing brief after lifecycle-state flips so
  // .0th/memory/brief.md doesn't keep claiming "active" for claims that
  // memory-sync just demoted to "needs_review". The decision record names
  // the brief as "the primary machine-facing memory layer" — if we mutate
  // claims without refreshing the brief, agents read a lying view until
  // the next memory-write. Brief failure is non-fatal: surface it on the
  // returned record but don't undo the claim updates.
  let brief = null;
  let briefError = null;
  if (updateBrief && affected.length > 0) {
    try {
      brief = runBriefGeneration({ cwd, memoryFile, outputFile: briefFile });
    } catch (err) {
      briefError = err.message;
    }
  }

  return {
    memory_file: memoryFile,
    memory_file_exists: true,
    from_revision: from,
    to_revision: to,
    changed_sources: changed,
    affected_claim_ids: affected,
    brief_updated: Boolean(brief),
    brief_error: briefError
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--from") {
      options.from = argv[++index];
      continue;
    }
    if (token === "--to") {
      options.to = argv[++index];
      continue;
    }
    if (token === "--memory-file") {
      options.memoryFile = argv[++index];
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function main() {
  const result = runMemorySync({ cwd: process.cwd(), ...parseArgs(process.argv.slice(2)) });
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
