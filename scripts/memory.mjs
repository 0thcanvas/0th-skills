#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isInvokedAsCli } from "./lib/cli.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COMMANDS = new Map([
  ["startup", ["memory-startup.mjs"]],
  ["preflight", ["session-preflight.mjs"]],
  ["remember", ["memory-write.mjs"]],
  ["write", ["memory-write.mjs"]],
  ["write-gate", ["memory-gate.mjs"]],
  ["gate", ["memory-gate.mjs"]],
  ["compact", ["memory-compact.mjs"]],
  ["consolidate", ["memory-compact.mjs"]],
  ["recall", ["memory-recall.mjs", "recall"]],
  ["expand", ["memory-recall.mjs", "expand"]],
  ["brief", ["memory-brief.mjs"]],
  ["sync", ["memory-sync.mjs"]],
  ["maintain", ["memory-maintain.mjs"]],
  ["eval", ["memory-eval.mjs"]],
  ["runtime-eval", ["memory-runtime-eval.mjs"]],
  ["reconcile", ["read-set-reconcile.mjs"]],
  ["open-loop", ["open-loop.mjs"]],
  ["tasks", ["open-loop.mjs"]],
  ["task-brief", ["open-loop-brief.mjs"]],
  ["evidence", ["evidence.mjs"]],
  ["source-pack", ["source-pack.mjs"]],
  ["doctor", ["memory-doctor.mjs"]]
]);

function helpText() {
  return [
    "Usage: node scripts/memory.mjs <command> [options]",
    "",
    "Agent workflow commands:",
    "  startup          Return compact repo state and task-relevant memory.",
    "  preflight        Fetch/reconcile repo state before work.",
    "  brief            Generate the compact memory brief.",
    "  task-brief       Generate the open-loop brief.",
    "  remember|write   Write a schema-validated durable memory claim.",
    "  write-gate|gate  Classify and capture a workflow memory event.",
    "  compact          Summarize selected claims and mark originals superseded.",
    "  recall           Search compact memory/open-loop/evidence records.",
    "  expand           Expand one record by id.",
    "  sync             Mark claims needs_review after source changes.",
    "  reconcile        Confirm or caveat claims from an inspected read set.",
    "  open-loop|tasks  Add/list/block/close/drop/reopen unfinished work.",
    "  evidence         Add/list local provenance events.",
    "  source-pack      Ingest/list/expand global source packs.",
    "  doctor           Report project/global runtime paths and install versions.",
    "  maintain         Report stale, duplicate, orphaned, and drifted memory.",
    "  eval             Run memory evaluation reports.",
    "  runtime-eval     Run executable Memory v2 runtime fixtures.",
    "",
    "Examples:",
    "  node scripts/memory.mjs startup --query \"memory startup token optimization\"",
    "  node scripts/memory.mjs brief",
    "  node scripts/memory.mjs recall --query \"repo preflight\" --limit 5",
    "  node scripts/memory.mjs remember --type decision --claim \"...\" --evidence-path docs/x.md --confidence high",
    ""
  ].join("\n");
}

export function runMemoryCommand(argv, {
  cwd = process.cwd()
} = {}) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "-h") {
    return helpText();
  }

  const route = COMMANDS.get(command);
  if (!route) {
    throw new Error(`Unknown memory command: ${command}`);
  }

  const [script, ...prefix] = route;
  try {
    return execFileSync(process.execPath, [path.join(__dirname, script), ...prefix, ...rest], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : "";
    const stdout = err.stdout ? String(err.stdout).trim() : "";
    throw new Error(stderr || stdout || err.message);
  }
}

function main() {
  process.stdout.write(runMemoryCommand(process.argv.slice(2)));
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
