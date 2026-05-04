#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const RUN_ID_ARG_PATTERN = /(?:^|\s)--run-id(?:=|\s+)([a-zA-Z0-9._-]+)/;

function readStdin() {
  try {
    return readFileSync(process.stdin.fd, "utf8");
  } catch {
    return "";
  }
}

function parsePayload(raw) {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function commandFromToolInput(toolInput) {
  if (typeof toolInput === "string") return toolInput;
  if (toolInput && typeof toolInput === "object") {
    if (typeof toolInput.command === "string") return toolInput.command;
    if (typeof toolInput.cmd === "string") return toolInput.cmd;
  }
  return "";
}

export function extractRunId(toolInput) {
  const command = commandFromToolInput(toolInput);
  if (!command.includes("failure-dossier-runner.mjs")) return null;
  const match = command.match(RUN_ID_ARG_PATTERN);
  if (!match) return null;
  const runId = match[1];
  return RUN_ID_PATTERN.test(runId) ? runId : null;
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function dossierPathFor(payload, runId) {
  const reportDir = process.env.VERIFICATION_REPORT_DIR ?? "verification-report";
  return path.resolve(payload.cwd ?? process.cwd(), reportDir, "runs", runId, "dossier.json");
}

function isTextBlock(value) {
  return value &&
    typeof value === "object" &&
    typeof value.text === "string" &&
    typeof value.truncated === "boolean";
}

export function validateDossier(dossier, runId) {
  if (!dossier || typeof dossier !== "object") return false;
  if (dossier.version !== 1) return false;
  if (dossier.status !== "complete") return false;
  if (dossier.run_id !== runId) return false;
  if (!Array.isArray(dossier.command)) return false;
  if (typeof dossier.cwd !== "string") return false;
  if (typeof dossier.exit_code !== "number" || dossier.exit_code === 0) return false;
  if (typeof dossier.started_at !== "string") return false;
  if (typeof dossier.finished_at !== "string") return false;
  if (!isTextBlock(dossier.stdout) || !isTextBlock(dossier.stderr)) return false;
  return true;
}

function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}

function buildContext(payload, dossierPath, dossier) {
  const stderr = oneLine(dossier.stderr.text).slice(0, 500);
  const stdout = oneLine(dossier.stdout.text).slice(0, 500);
  const summary = stderr || stdout || "no captured output";
  return [
    `0th failure dossier: ${dossierPath}`,
    `run_id=${dossier.run_id}`,
    `session_id=${payload.session_id ?? "unknown"}`,
    `turn_id=${payload.turn_id ?? "unknown"}`,
    `tool_use_id=${payload.tool_use_id ?? "unknown"}`,
    `exit_code=${dossier.exit_code}`,
    `summary=${summary}`
  ].join("\n");
}

function main() {
  const payload = parsePayload(readStdin());
  if (!payload || payload.hook_event_name !== "PostToolUse") return;

  const runId = extractRunId(payload.tool_input);
  if (!runId) return;

  const dossierPath = dossierPathFor(payload, runId);
  if (!existsSync(dossierPath)) return;

  const dossier = readJson(dossierPath);
  if (!validateDossier(dossier, runId)) return;

  const output = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: buildContext(payload, dossierPath, dossier)
    }
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main();
