#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";
import { outputForPayload, parsePayload } from "./failure-hook-common.mjs";

function readStdin() {
  try {
    return readFileSync(process.stdin.fd, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const payload = parsePayload(readStdin());
  const output = outputForPayload(
    payload,
    "PostToolUseFailure",
    "PostToolUseFailure",
    process.env.VERIFICATION_REPORT_DIR ?? "verification-report"
  );
  if (!output) return;
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main();
