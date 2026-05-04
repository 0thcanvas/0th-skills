#!/usr/bin/env node

import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const DEFAULT_STDIO_LIMIT = 12_000;

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex === -1) {
    fail("Usage: failure-dossier-runner.mjs --run-id <id> -- <command> [args...]", 2);
  }

  const optionArgs = argv.slice(0, separatorIndex);
  const command = argv.slice(separatorIndex + 1);
  let runId = null;

  for (let index = 0; index < optionArgs.length; index += 1) {
    const arg = optionArgs[index];
    if (arg === "--run-id") {
      runId = optionArgs[index + 1] ?? null;
      index += 1;
      continue;
    }
    fail(`Unknown option: ${arg}`, 2);
  }

  if (!runId) fail("--run-id is required", 2);
  if (!RUN_ID_PATTERN.test(runId)) {
    fail("--run-id may contain only letters, numbers, dots, underscores, and hyphens", 2);
  }
  if (command.length === 0) fail("Command is required after --", 2);

  return { runId, command };
}

function stdioLimit() {
  const raw = process.env.OTH_DOSSIER_STDIO_LIMIT;
  if (!raw) return DEFAULT_STDIO_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STDIO_LIMIT;
}

function truncate(text, limit) {
  if (text.length <= limit) {
    return { text, truncated: false, original_length: text.length };
  }
  return {
    text: text.slice(0, limit),
    truncated: true,
    original_length: text.length
  };
}

function writeDossier({ runId, command, cwd, startedAt, finishedAt, exitCode, stdout, stderr }) {
  const reportDir = process.env.VERIFICATION_REPORT_DIR ?? "verification-report";
  const runDir = path.resolve(cwd, reportDir, "runs", runId);

  const dossierPath = path.join(runDir, "dossier.json");
  const tmpPath = path.join(runDir, `dossier.${process.pid}.tmp`);
  const limit = stdioLimit();

  const dossier = {
    version: 1,
    status: "complete",
    run_id: runId,
    cwd,
    command,
    exit_code: exitCode,
    started_at: startedAt,
    finished_at: finishedAt,
    stdout: truncate(stdout, limit),
    stderr: truncate(stderr, limit),
    artifacts: []
  };

  try {
    writeFileSync(tmpPath, `${JSON.stringify(dossier, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmpPath, dossierPath);
  } catch (err) {
    try {
      rmSync(tmpPath, { force: true });
    } catch {
      // Best effort cleanup; preserve the original write error below.
    }
    fail(`Failed to write failure dossier: ${err.message}`, 1);
  }
}

function normalizeExitStatus(result) {
  if (typeof result.status === "number") return result.status;
  if (result.error && result.error.code === "ENOENT") return 127;
  if (result.signal) return 128;
  return 1;
}

function main() {
  const { runId, command } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const reportDir = process.env.VERIFICATION_REPORT_DIR ?? "verification-report";
  const runDir = path.resolve(cwd, reportDir, "runs", runId);
  mkdirSync(path.dirname(runDir), { recursive: true });
  try {
    mkdirSync(runDir, { recursive: false });
  } catch (err) {
    if (err.code === "EEXIST") {
      fail(`Run id already exists: ${runId}`, 2);
    }
    fail(`Failed to create run directory for ${runId}: ${err.message}`, 1);
  }

  const startedAt = new Date().toISOString();
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024
  });
  const finishedAt = new Date().toISOString();

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  const exitCode = normalizeExitStatus(result);
  if (exitCode !== 0) {
    const spawnError = result.error ? `${result.error.message}\n` : "";
    writeDossier({
      runId,
      command,
      cwd,
      startedAt,
      finishedAt,
      exitCode,
      stdout,
      stderr: `${stderr}${spawnError}`
    });
  }

  process.exit(exitCode);
}

main();
