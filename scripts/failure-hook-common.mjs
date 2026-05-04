import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const COMMAND_SEPARATOR = " -- ";

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

export function extractManagedInvocation(toolInput) {
  const command = commandFromToolInput(toolInput);
  if (!command.includes("failure-dossier-runner.mjs")) return null;
  const separatorIndex = command.indexOf(COMMAND_SEPARATOR);
  if (separatorIndex === -1) return null;

  const wrapperArgv = tokenizeShellCommand(command.slice(0, separatorIndex));
  if (!wrapperArgv) return null;
  const runId = extractWrapperRunId(wrapperArgv);
  if (!runId) return null;

  const childCommandText = command.slice(separatorIndex + COMMAND_SEPARATOR.length).trim();
  if (!childCommandText) return null;

  const childCommandArgv = tokenizeShellCommand(childCommandText);
  if (!childCommandArgv) return null;

  return { runId, childCommandText, childCommandArgv };
}

export function extractRunId(toolInput) {
  return extractManagedInvocation(toolInput)?.runId ?? null;
}

function extractWrapperRunId(wrapperArgv) {
  for (let index = 0; index < wrapperArgv.length; index += 1) {
    const token = wrapperArgv[index];
    let candidate = null;
    if (token === "--run-id") {
      candidate = wrapperArgv[index + 1] ?? null;
    }
    if (candidate !== null) {
      return RUN_ID_PATTERN.test(candidate) && candidate !== "." && candidate !== ".."
        ? candidate
        : null;
    }
  }
  return null;
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

export function validateDossier(dossier, runId, payload = null) {
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
  if (payload) {
    const payloadCwd = path.resolve(payload.cwd ?? process.cwd());
    const dossierCwd = path.resolve(dossier.cwd);
    if (payloadCwd !== dossierCwd) return false;
  }
  return true;
}

function tokenizeShellCommand(commandText) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let tokenStarted = false;

  for (const char of commandText) {
    if (escaped) {
      current += char;
      escaped = false;
      tokenStarted = true;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      tokenStarted = true;
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (tokenStarted) {
        tokens.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (escaped || quote) return null;
  if (tokenStarted) tokens.push(current);
  return tokens.length > 0 ? tokens : null;
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

  const invocation = extractManagedInvocation(payload.tool_input);
  if (!invocation) return null;
  if (isDuplicateRunIdRejection(payload.tool_response, invocation.runId)) return null;

  const dossierPath = dossierPathFor(payload, invocation.runId, reportDir);
  if (!existsSync(dossierPath)) return null;

  const dossier = readJson(dossierPath);
  if (!validateDossier(dossier, invocation.runId, payload)) return null;

  return {
    hookSpecificOutput: {
      hookEventName: outputEventName,
      additionalContext: buildContext(payload, dossierPath, dossier)
    }
  };
}

function isDuplicateRunIdRejection(toolResponse, runId) {
  if (typeof toolResponse !== "string") return false;
  return toolResponse.includes(`Run id already exists: ${runId}`);
}
