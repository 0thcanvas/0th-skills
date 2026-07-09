#!/usr/bin/env node

import process from "node:process";
import { runCapabilitiesCommand } from "./host-capabilities.mjs";

function usage() {
  return [
    "Usage: node scripts/0th.mjs <command> [options]",
    "",
    "Commands:",
    "  capabilities --harness <name> [--runtime-json <path>] [--packet-json <path>]",
    ""
  ].join("\n");
}

function main(argv) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }
  if (command !== "capabilities") {
    throw new Error(`unknown 0th command: ${command}`);
  }
  const output = runCapabilitiesCommand(args);
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`0th: ${error.message}\n`);
  process.exitCode = 1;
}
