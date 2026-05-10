#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

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

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const source = fs.readFileSync(filePath, "utf8").trim();
  if (!source) return [];
  return source.split("\n").map((line) => JSON.parse(line));
}

function writeJsonlAtomic(filePath, entries) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  fs.renameSync(tmpPath, filePath);
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
  syncedAt = new Date().toISOString()
} = {}) {
  if (!from) throw new Error("--from is required");
  if (!to) throw new Error("--to is required");

  const changed = changedSources(cwd, from, to);
  const claims = readJsonl(memoryFile);
  if (claims === null) {
    return {
      memory_file: memoryFile,
      memory_file_exists: false,
      from_revision: from,
      to_revision: to,
      changed_sources: changed,
      affected_claim_ids: []
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

  return {
    memory_file: memoryFile,
    memory_file_exists: true,
    from_revision: from,
    to_revision: to,
    changed_sources: changed,
    affected_claim_ids: affected
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

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
