#!/usr/bin/env node

import process from "node:process";
import {
  runAttestCommand,
  runCapabilitiesCommand,
  runRoutingCommand,
  validateLaunchPlan
} from "./host-capabilities.mjs";
import { runCodexDispatchCommand } from "./codex-exec-adapter.mjs";
import { runSecretsCommand } from "./secrets.mjs";

function usage() {
  return [
    "Usage: node scripts/0th.mjs <command> [options]",
    "",
    "Commands:",
    "  capabilities --harness <name> [--runtime-json <path>] [--packet-json <path>] [--routing-json <path>]",
    "  attest --launch-plan-json <path> --receipt-json <path>",
    "  routing init --harness <name> [--config-dir <path>] [--force]",
    "  routing doctor --harness <name> [--config-dir <path>] [--runtime-json <path>] [--live-probe]",
    "  dispatch --launch-plan-json <path> --prompt-file <path> --output-schema <path> --result-out <path> --events-out <path> --receipt-out <path> [--sandbox read-only|workspace-write]",
    "  secrets <paths|output|check|sync|clean> [environment|all] [--manifest path]",
    ""
  ].join("\n");
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  let output;
  if (command === "capabilities") output = runCapabilitiesCommand(args);
  else if (command === "attest") output = runAttestCommand(args);
  else if (command === "routing") output = runRoutingCommand(args);
  else if (command === "dispatch") output = runCodexDispatchCommand(args, { validateLaunchPlan });
  else if (command === "secrets") {
    process.exitCode = runSecretsCommand(args);
    return;
  } else throw new Error(`unknown 0th command: ${command}`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`0th: ${error.message}\n`);
  process.exitCode = 1;
}
