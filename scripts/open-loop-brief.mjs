#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readJsonl } from "./lib/jsonl.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { resolveTaskPaths } from "./runtime-state.mjs";

const PRIORITY_ORDER = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3]
]);

function evidenceFor(loop) {
  if (loop.evidence_path) return loop.evidence_path;
  if (Array.isArray(loop.source_paths) && loop.source_paths.length > 0) {
    return loop.source_paths.join(", ");
  }
  return "unspecified";
}

function scopeFor(loop) {
  const parts = [loop.scope];
  if (loop.project) parts.push(`project: ${loop.project}`);
  if (loop.repo) parts.push(`repo: ${loop.repo}`);
  return parts.filter(Boolean).join("; ");
}

function timestampFor(loop) {
  return loop.updated_at ?? loop.created_at ?? "";
}

function sortLoops(left, right) {
  const priorityDelta = (PRIORITY_ORDER.get(left.priority) ?? 99) - (PRIORITY_ORDER.get(right.priority) ?? 99);
  if (priorityDelta !== 0) return priorityDelta;
  const timeDelta = String(timestampFor(left)).localeCompare(String(timestampFor(right)));
  if (timeDelta !== 0) return timeDelta;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function ageDays(loop, now) {
  const timestamp = timestampFor(loop);
  if (!timestamp) return 0;
  const then = new Date(timestamp);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000);
}

function itemFor(loop) {
  const bits = [
    `- [${loop.priority}] ${loop.title}`,
    `next: ${loop.next_action}`,
    `scope: ${scopeFor(loop)}`,
    `source: ${evidenceFor(loop)}`
  ];
  if (loop.blocked_reason) bits.splice(2, 0, `blocked: ${loop.blocked_reason}`);
  return bits.join(" — ");
}

export function generateOpenLoopBrief(loops, {
  now = new Date(),
  staleDays = 14
} = {}) {
  const actionable = [...loops]
    .filter((loop) => loop.status === "open" || loop.status === "blocked")
    .sort(sortLoops);
  const openLoops = actionable.filter((loop) => loop.status === "open");
  const blockedLoops = actionable.filter((loop) => loop.status === "blocked");
  const staleLoops = actionable.filter((loop) => ageDays(loop, now) >= staleDays);

  const lines = [
    "# Project Open Loops Brief",
    "",
    "Generated from structured open loops. Read this after the memory brief at session start."
  ];

  for (const [title, sectionLoops] of [
    ["Open", openLoops],
    ["Blocked", blockedLoops],
    ["Stale Review", staleLoops]
  ]) {
    lines.push("", `## ${title}`);
    if (sectionLoops.length === 0) {
      lines.push("- None recorded.");
      continue;
    }
    lines.push(...sectionLoops.map(itemFor));
  }

  return `${lines.join("\n")}\n`;
}

export function runOpenLoopBriefGeneration({
  cwd = process.cwd(),
  taskFile = null,
  outputFile = null,
  now = new Date(),
  staleDays = 14
} = {}) {
  const defaults = resolveTaskPaths({ cwd });
  const resolvedTaskFile = taskFile ?? defaults.taskFile;
  const resolvedOutputFile = outputFile ?? (
    taskFile ? path.join(path.dirname(resolvedTaskFile), "brief.md") : defaults.briefFile
  );
  const loops = readJsonl(resolvedTaskFile);
  const brief = generateOpenLoopBrief(loops, { now, staleDays });
  fs.mkdirSync(path.dirname(resolvedOutputFile), { recursive: true });
  fs.writeFileSync(resolvedOutputFile, brief);
  return {
    task_file: resolvedTaskFile,
    output_file: resolvedOutputFile,
    loop_count: loops.length,
    written: true
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--task-file") {
      options.taskFile = argv[++index];
      continue;
    }
    if (token === "--output") {
      options.outputFile = argv[++index];
      continue;
    }
    if (token === "--stale-days") {
      options.staleDays = Number(argv[++index]);
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write([
      "Usage: node scripts/open-loop-brief.mjs [--task-file FILE] [--output FILE] [--stale-days N]",
      "",
      "Generates the open-loop brief from the user-level runtime state directory.",
      ""
    ].join("\n"));
    return;
  }
  const result = runOpenLoopBriefGeneration({ cwd: process.cwd(), ...options });
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
