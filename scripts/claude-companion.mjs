#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveDefaultStateDir } from "./companion-state.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, "..");
const defaultStateDir = resolveDefaultStateDir();
const defaultReviewerModel = "opus";
const defaultTimeoutMs = Number(process.env.CLAUDE_COMPANION_TIMEOUT_MS || "180000");
const lastSessionPath = (stateDir) => path.join(stateDir, ".last-session.json");

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeKey(key) {
  return key.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function getStatePath(stateDir, key) {
  return path.join(stateDir, `${sanitizeKey(key)}.json`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readPrompt(args) {
  if (args.length > 0) {
    return args.join(" ");
  }

  if (process.stdin.isTTY) {
    fail("Prompt is required as an argument or via stdin.");
  }

  const prompt = fs.readFileSync(process.stdin.fd, "utf8").trim();
  if (!prompt) {
    fail("Prompt is required as an argument or via stdin.");
  }
  return prompt;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || ["task", "review"].includes(command) === false) {
    fail("Usage: claude-companion.mjs <task|review> [options] <prompt>");
  }

  const options = {
    command,
    key: null,
    resumeLast: false,
    forkSession: false,
    stateDir: defaultStateDir,
    cwd: process.cwd(),
    pluginDir: pluginRoot,
    model: defaultReviewerModel,
    timeoutMs: defaultTimeoutMs,
    jsonSchema: null,
    promptArgs: []
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "--key") {
      options.key = rest[++index];
      continue;
    }
    if (token === "--resume-last") {
      options.resumeLast = true;
      continue;
    }
    if (token === "--fork-session") {
      options.forkSession = true;
      continue;
    }
    if (token === "--state-dir") {
      options.stateDir = rest[++index];
      continue;
    }
    if (token === "--cwd") {
      options.cwd = rest[++index];
      continue;
    }
    if (token === "--plugin-dir") {
      options.pluginDir = rest[++index];
      continue;
    }
    if (token === "--no-plugin-dir") {
      options.pluginDir = null;
      continue;
    }
    if (token === "--model") {
      options.model = rest[++index];
      continue;
    }
    if (token === "--timeout-ms") {
      options.timeoutMs = Number(rest[++index]);
      continue;
    }
    if (token === "--json-schema") {
      options.jsonSchema = rest[++index];
      continue;
    }

    options.promptArgs = rest.slice(index);
    break;
  }

  if (options.resumeLast && options.key) {
    fail("Use either --key or --resume-last, not both.");
  }

  return options;
}

function loadSessionState({ stateDir, key, resumeLast }) {
  if (resumeLast) {
    const filePath = lastSessionPath(stateDir);
    if (!fs.existsSync(filePath)) {
      fail(`No previous Claude review session found at ${filePath}.`);
    }
    return readJson(filePath);
  }

  if (!key) {
    return null;
  }

  const filePath = getStatePath(stateDir, key);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readJson(filePath);
}

function extractResult(payload) {
  if (!Array.isArray(payload)) {
    fail("Unexpected Claude response: expected a JSON array.");
  }

  const resultEvent = payload.find((entry) => entry.type === "result");
  const assistantEvent = payload.find((entry) => entry.type === "assistant");
  const sessionId =
    resultEvent?.session_id ??
    assistantEvent?.session_id ??
    payload.find((entry) => entry.session_id)?.session_id;

  const text =
    resultEvent?.result ??
    assistantEvent?.message?.content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      ?.trim();

  if (!sessionId) {
    fail("Claude response did not include a session_id.");
  }
  if (!text) {
    fail("Claude response did not include a result payload.");
  }

  return {
    sessionId,
    text
  };
}

function buildClaudeArgs({ prompt, cwd, pluginDir, model, jsonSchema, priorSession, forkSession }) {
  const args = ["-p", "--output-format", "json", "--add-dir", cwd];

  if (pluginDir) {
    args.push("--plugin-dir", pluginDir);
  }
  if (model) {
    args.push("--model", model);
  }
  if (jsonSchema) {
    args.push("--json-schema", jsonSchema);
  }
  if (priorSession?.session_id) {
    args.push("--resume", priorSession.session_id);
    if (forkSession) {
      args.push("--fork-session");
    }
  }

  args.push(prompt);
  return args;
}

function saveSessionState({ stateDir, key, priorSession, sessionId, prompt, cwd, command, text }) {
  ensureDir(stateDir);

  const now = new Date().toISOString();
  const baseKey = key ?? priorSession?.key;

  if (!baseKey) {
    writeJson(lastSessionPath(stateDir), {
      key: null,
      session_id: sessionId,
      updated_at: now
    });
    return;
  }

  const filePath = getStatePath(stateDir, baseKey);
  const priorRounds = priorSession?.rounds ?? 0;
  const state = {
    key: baseKey,
    session_id: sessionId,
    created_at: priorSession?.created_at ?? now,
    updated_at: now,
    rounds: priorRounds + 1,
    command,
    cwd,
    last_prompt_preview: prompt.slice(0, 200),
    last_result_preview: text.slice(0, 200)
  };

  writeJson(filePath, state);
  writeJson(lastSessionPath(stateDir), {
    key: baseKey,
    session_id: sessionId,
    updated_at: now
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const prompt = readPrompt(options.promptArgs);
  const priorSession = loadSessionState(options);

  const claudeBin = process.env.CLAUDE_BIN || "claude";
  const args = buildClaudeArgs({
    prompt,
    cwd: options.cwd,
    pluginDir: options.pluginDir,
    model: options.model,
    jsonSchema: options.jsonSchema,
    priorSession,
    forkSession: options.forkSession
  });

  const result = spawnSync(claudeBin, args, {
    encoding: "utf8",
    cwd: options.cwd,
    timeout: options.timeoutMs
  });

  if (result.error?.code === "ETIMEDOUT") {
    const details = result.stderr?.trim() || result.stdout?.trim();
    fail(
      [
        `Claude review timed out after ${options.timeoutMs}ms. Retry with --timeout-ms <longer-ms> if the review is expected to take longer.`,
        details ? `Partial output:\n${details}` : null
      ]
        .filter(Boolean)
        .join("\n\n")
    );
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Claude invocation failed.\n");
    process.exit(result.status ?? 1);
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    fail(`Claude response was not valid JSON.\n${result.stdout}`.trim());
  }
  const parsed = extractResult(payload);

  saveSessionState({
    stateDir: options.stateDir,
    key: options.key,
    priorSession,
    sessionId: parsed.sessionId,
    prompt,
    cwd: options.cwd,
    command: options.command,
    text: parsed.text
  });

  process.stdout.write(`${parsed.text}\n`);
}

main();
