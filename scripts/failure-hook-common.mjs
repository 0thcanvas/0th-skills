import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const RUN_ID_ARG_PATTERN = /(?:^|\s)--run-id(?:=|\s+)([a-zA-Z0-9._-]+)/;

export function parsePayload(raw) {
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

export function dossierPathFor(payload, runId, reportDir = "verification-report") {
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

export function buildContext(payload, dossierPath, dossier) {
  const stderr = oneLine(dossier.stderr.text).slice(0, 500);
  const stdout = oneLine(dossier.stdout.text).slice(0, 500);
  const summary = stderr || stdout || "no captured output";
  return [
    `0th failure dossier: ${dossierPath}`,
    `run_id=${dossier.run_id}`,
    `session_id=${payload.session_id ?? "unknown"}`,
    `turn_id=${payload.turn_id ?? "unavailable"}`,
    `tool_use_id=${payload.tool_use_id ?? "unavailable"}`,
    `exit_code=${dossier.exit_code}`,
    `summary=${summary}`
  ].join("\n");
}

export function outputForPayload(payload, expectedEventName, outputEventName, reportDir = "verification-report") {
  if (!payload || payload.hook_event_name !== expectedEventName) return null;

  const runId = extractRunId(payload.tool_input);
  if (!runId) return null;

  const dossierPath = dossierPathFor(payload, runId, reportDir);
  if (!existsSync(dossierPath)) return null;

  const dossier = readJson(dossierPath);
  if (!validateDossier(dossier, runId)) return null;

  return {
    hookSpecificOutput: {
      hookEventName: outputEventName,
      additionalContext: buildContext(payload, dossierPath, dossier)
    }
  };
}
