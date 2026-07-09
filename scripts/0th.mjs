#!/usr/bin/env node

import process from "node:process";
import { runAttestCommand, runCapabilitiesCommand } from "./host-capabilities.mjs";

function usage() {
  return [
    "Usage: node scripts/0th.mjs <command> [options]",
    "",
    "Commands:",
    "  capabilities --harness <name> [--runtime-json <path>] [--packet-json <path>]",
    "  attest --launch-plan-json <path> --receipt-json <path>",
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
  else throw new Error(`unknown 0th command: ${command}`);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`0th: ${error.message}\n`);
  process.exitCode = 1;
}
