#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveDefaultStateDir } from "./companion-state.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultStateDir = resolveDefaultStateDir();
const lastSessionPath = (stateDir) => path.join(stateDir, ".last-codex-session.json");

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
  return path.join(stateDir, `${sanitizeKey(key)}.codex.json`);
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
    fail("Usage: codex-companion.mjs <task|review> [options] <prompt>");
  }

  const options = {
    command,
    key: null,
    resumeLast: false,
    stateDir: defaultStateDir,
    cwd: process.cwd(),
    model: null,
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
    if (token === "--state-dir") {
      options.stateDir = rest[++index];
      continue;
    }
    if (token === "--cwd") {
      options.cwd = rest[++index];
      continue;
    }
    if (token === "--model") {
      options.model = rest[++index];
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
      fail(`No previous Codex review session found at ${filePath}.`);
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

function parseJsonLines(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{") && line.endsWith("}"))
    .map((line) => JSON.parse(line));
}

function extractResult(events) {
  const threadStarted = events.find((entry) => entry.type === "thread.started");
  const itemCompleted = [...events].reverse().find((entry) => entry.type === "item.completed");
  const text = itemCompleted?.item?.text?.trim();
  const threadId = threadStarted?.thread_id;

  if (!threadId) {
    fail("Codex response did not include a thread_id.");
  }
  if (!text) {
    fail("Codex response did not include a final message.");
  }

  return {
    threadId,
    text
  };
}

function buildCodexArgs({ prompt, cwd, model, priorSession }) {
  const args = priorSession?.session_id
    ? ["exec", "resume", "--json", priorSession.session_id]
    : ["exec", "--json"];

  if (model) {
    args.push("--model", model);
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

  const codexBin = process.env.CODEX_BIN || "codex";
  const args = buildCodexArgs({
    prompt,
    cwd: options.cwd,
    model: options.model,
    priorSession
  });

  const result = spawnSync(codexBin, args, {
    encoding: "utf8",
    cwd: options.cwd
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || "Codex invocation failed.\n");
    process.exit(result.status ?? 1);
  }

  const events = parseJsonLines(result.stdout);
  const parsed = extractResult(events);

  saveSessionState({
    stateDir: options.stateDir,
    key: options.key,
    priorSession,
    sessionId: parsed.threadId,
    prompt,
    cwd: options.cwd,
    command: options.command,
    text: parsed.text
  });

  process.stdout.write(`${parsed.text}\n`);
}

main();
