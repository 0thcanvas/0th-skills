#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readJsonl } from "./lib/jsonl.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { resolveMemoryPaths } from "./runtime-state.mjs";

const SECTIONS = [
  ["Active Decisions", (claim) => claim.type === "decision" && claim.lifecycle_state !== "archived"],
  ["Vocabulary", (claim) => claim.type === "vocabulary" && claim.lifecycle_state !== "archived"],
  ["Recurring Incidents", (claim) => claim.type === "incident" && claim.lifecycle_state !== "archived"],
  ["Known Root Causes", (claim) => claim.type === "root_cause" && claim.lifecycle_state !== "archived"],
  ["Repo State Warnings", (claim) => claim.type === "repo_state" && claim.lifecycle_state === "needs_review"],
  ["External Research", (claim) => claim.type === "external_research" && claim.lifecycle_state !== "archived"],
  ["Observations", (claim) => claim.type === "observation" && claim.lifecycle_state !== "archived"]
];

function evidenceFor(claim) {
  if (claim.evidence_path) return claim.evidence_path;
  if (claim.source_path) return claim.source_path;
  if (Array.isArray(claim.source_paths) && claim.source_paths.length > 0) {
    return claim.source_paths.join(", ");
  }
  return "unspecified";
}

function itemFor(claim) {
  return `- ${claim.claim} (state: ${claim.lifecycle_state}; source: ${evidenceFor(claim)})`;
}

export function generateBrief(claims) {
  const sorted = [...claims].sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")));
  const lines = [
    "# Project Memory Brief",
    "",
    "Generated from structured memory claims. Treat `needs_review` items as caveated until re-verified."
  ];

  for (const [title, predicate] of SECTIONS) {
    lines.push("", `## ${title}`);
    const sectionClaims = sorted.filter(predicate);
    if (sectionClaims.length === 0) {
      lines.push("- None recorded.");
      continue;
    }
    lines.push(...sectionClaims.map(itemFor));
  }

  return `${lines.join("\n")}\n`;
}

export function runBriefGeneration({
  cwd = process.cwd(),
  memoryFile = null,
  outputFile = null
} = {}) {
  const defaults = resolveMemoryPaths({ cwd });
  const resolvedMemoryFile = memoryFile ?? defaults.memoryFile;
  const resolvedOutputFile = outputFile ?? (
    memoryFile ? path.join(path.dirname(resolvedMemoryFile), "brief.md") : defaults.briefFile
  );
  const claims = readJsonl(resolvedMemoryFile);
  const brief = generateBrief(claims);
  fs.mkdirSync(path.dirname(resolvedOutputFile), { recursive: true });
  fs.writeFileSync(resolvedOutputFile, brief);
  return {
    memory_file: resolvedMemoryFile,
    output_file: resolvedOutputFile,
    claim_count: claims.length,
    written: true
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
    if (token === "--output") {
      options.outputFile = argv[++index];
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function main() {
  const result = runBriefGeneration({ cwd: process.cwd(), ...parseArgs(process.argv.slice(2)) });
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
