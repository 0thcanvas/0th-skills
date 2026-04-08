#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveDefaultStateDir } from "./companion-state.mjs";

// ---------------------------------------------------------------------------
// Constants (exported for testing)
// ---------------------------------------------------------------------------

export const DRIVER_ALLOWLIST = ["codex", "claude"];

export const KNOWN_HOSTS = ["claude", "codex"];

export const DEFAULT_CONFIG = {
  version: 1,
  counterparts: {
    claude: "codex",
    codex: "claude"
  }
};

const BIN_ENV_VARS = {
  codex: "CODEX_BIN",
  claude: "CLAUDE_BIN"
};

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultStateDir = resolveDefaultStateDir();
const configDir = path.join(os.homedir(), ".0th");
const configPath = path.join(configDir, "reviewer-config.json");

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function sanitizeKey(key) {
  return key
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function detectHost() {
  if (process.env.CLAUDECODE === "1") return "claude";
  if (process.env.CLAUDE_CODE_ENTRYPOINT) return "claude";
  if (process.env.CODEX_SANDBOX) return "codex";
  return null;
}

export function loadAndValidateConfig(cfgPath = configPath) {
  if (!fs.existsSync(cfgPath)) {
    ensureDir(path.dirname(cfgPath));
    writeJson(cfgPath, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  const config = readJson(cfgPath);

  if (config.version !== 1) {
    throw new Error(`reviewer-config.json: unsupported version "${config.version}" (expected 1).`);
  }

  if (!config.counterparts || typeof config.counterparts !== "object") {
    throw new Error("reviewer-config.json: missing or invalid 'counterparts' object.");
  }

  for (const [host, driver] of Object.entries(config.counterparts)) {
    if (!KNOWN_HOSTS.includes(host)) {
      throw new Error(
        `reviewer-config.json: unknown host "${host}". Known hosts: ${KNOWN_HOSTS.join(", ")}.`
      );
    }
    if (!DRIVER_ALLOWLIST.includes(driver)) {
      throw new Error(
        `reviewer-config.json: unknown driver "${driver}" for host "${host}". Allowed drivers: ${DRIVER_ALLOWLIST.join(", ")}.`
      );
    }
    if (host === driver) {
      throw new Error(`reviewer-config.json: host "${host}" must not map to itself.`);
    }
  }

  return config;
}

export function stripAnsi(text) {
  return text
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\x1B\][^\x07]*\x07/g, "")
    .replace(/\x1B[@-_][0-?]*[ -/]*[@-~]/g, "");
}

const PREAMBLE_PATTERNS = [
  /^Current version:/,
  /^Latest version:/,
  /^Executing prompt:/,
  /^Error fetching version:/,
  /^Failed to fetch remote config:/,
  /^Skipping invalid hook/,
  /^Warning:/,
  /^AGENT RESPONSE$/,
  /^\[K/,
  /^\s*$/
];

export function stripPreamble(text) {
  const lines = text.split("\n");
  let startIndex = 0;

  while (startIndex < lines.length && PREAMBLE_PATTERNS.some((p) => p.test(lines[startIndex]))) {
    startIndex += 1;
  }

  return lines.slice(startIndex).join("\n").trimEnd();
}

// ---------------------------------------------------------------------------
// Driver loading
// ---------------------------------------------------------------------------

async function loadDriver(name) {
  if (!DRIVER_ALLOWLIST.includes(name)) {
    fail(`Unknown driver "${name}". Allowed: ${DRIVER_ALLOWLIST.join(", ")}.`);
  }
  const driverPath = path.join(__dirname, "drivers", `${name}.mjs`);
  const mod = await import(driverPath);
  return mod.default;
}

function resolveDriverName(options) {
  // 1. --driver flag
  if (options.driver) {
    if (!DRIVER_ALLOWLIST.includes(options.driver)) {
      fail(`Unknown driver "${options.driver}". Allowed: ${DRIVER_ALLOWLIST.join(", ")}.`);
    }
    return options.driver;
  }

  // 2. COUNTERPART_REVIEWER env var
  if (process.env.COUNTERPART_REVIEWER) {
    const envDriver = process.env.COUNTERPART_REVIEWER;
    if (!DRIVER_ALLOWLIST.includes(envDriver)) {
      fail(
        `COUNTERPART_REVIEWER="${envDriver}" is not an allowed driver. Allowed: ${DRIVER_ALLOWLIST.join(", ")}.`
      );
    }
    return envDriver;
  }

  // 3. Config file lookup by host
  const host = detectHost();
  if (host) {
    let config;
    try {
      config = loadAndValidateConfig();
    } catch (err) {
      fail(err.message);
    }
    if (config.counterparts[host]) {
      return config.counterparts[host];
    }
  }

  // 4. Default
  return "codex";
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || !["task", "review"].includes(command)) {
    fail("Usage: counterpart-companion.mjs <task|review> [options] <prompt>");
  }

  const options = {
    command,
    key: null,
    resumeLast: false,
    stateDir: defaultStateDir,
    cwd: process.cwd(),
    model: null,
    driver: null,
    timeoutMs: Number(process.env.COUNTERPART_TIMEOUT_MS || "180000"),
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
    if (token === "--driver") {
      options.driver = rest[++index];
      continue;
    }
    if (token === "--timeout-ms") {
      options.timeoutMs = Number(rest[++index]);
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

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

function lastSessionPath(stateDir, stateSuffix) {
  return path.join(stateDir, `.last-session${stateSuffix}`);
}

function getStatePath(stateDir, key, stateSuffix) {
  return path.join(stateDir, `${sanitizeKey(key)}${stateSuffix}`);
}

function loadSessionState({ stateDir, key, resumeLast, stateSuffix }) {
  if (resumeLast) {
    const filePath = lastSessionPath(stateDir, stateSuffix);
    if (!fs.existsSync(filePath)) {
      fail(`No previous review session found at ${filePath}.`);
    }
    return readJson(filePath);
  }

  if (!key) {
    return null;
  }

  const filePath = getStatePath(stateDir, key, stateSuffix);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readJson(filePath);
}

function saveSessionState({
  stateDir,
  key,
  priorSession,
  sessionId,
  prompt,
  cwd,
  command,
  text,
  stateSuffix
}) {
  ensureDir(stateDir);

  const now = new Date().toISOString();
  const baseKey = key ?? priorSession?.key;

  if (!baseKey) {
    if (sessionId != null) {
      writeJson(lastSessionPath(stateDir, stateSuffix), {
        key: null,
        session_id: sessionId,
        updated_at: now
      });
    }
    return;
  }

  const filePath = getStatePath(stateDir, baseKey, stateSuffix);
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
  writeJson(lastSessionPath(stateDir, stateSuffix), {
    key: baseKey,
    session_id: sessionId,
    updated_at: now
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Resolve and load driver
  const driverName = resolveDriverName(options);
  const driver = await loadDriver(driverName);

  // Read prompt
  const prompt = readPrompt(options.promptArgs);

  // Load prior session state (only if driver supports resume)
  const priorSession = driver.supportsResume
    ? loadSessionState({
        stateDir: options.stateDir,
        key: options.key,
        resumeLast: options.resumeLast,
        stateSuffix: driver.stateSuffix
      })
    : null;

  // Build args and spawn
  const args = driver.buildArgs({
    prompt,
    cwd: options.cwd,
    model: options.model,
    priorSession
  });

  const result = spawnSync(driver.bin, args, {
    encoding: "utf8",
    cwd: options.cwd,
    env: { ...process.env, ...driver.env },
    timeout: options.timeoutMs
  });

  // --- Failure contract ---

  // ENOENT: binary not found
  if (result.error?.code === "ENOENT") {
    const envVar = BIN_ENV_VARS[driverName] || `${driverName.toUpperCase()}_BIN`;
    fail(`Counterpart binary "${driver.bin}" not found. Install it or set ${envVar}.`, 127);
  }

  // ETIMEDOUT
  if (result.error?.code === "ETIMEDOUT") {
    fail(`Counterpart review timed out after ${options.timeoutMs}ms.`, 124);
  }

  // Non-zero exit
  if (result.status !== 0 && result.status != null) {
    const preview = (result.stderr || "").trim().slice(0, 500);
    fail(`Counterpart exited with code ${result.status}.${preview ? `\n${preview}` : ""}`, result.status);
  }

  // Attempt to extract result
  let parsed;
  try {
    parsed = driver.extractResult(result.stdout || "", result.stderr || "");
  } catch (err) {
    const stdoutPreview = (result.stdout || "").trim().slice(0, 500);
    fail(`Failed to parse counterpart output: ${err.message}${stdoutPreview ? `\n${stdoutPreview}` : ""}`, 2);
  }

  // Empty review
  if (!parsed.text || !parsed.text.trim()) {
    const stderrContent = (result.stderr || "").trim();
    fail(`Counterpart returned an empty review.${stderrContent ? `\n${stderrContent}` : ""}`, 2);
  }

  // --- Save state (only when sessionId is not null) ---
  if (parsed.sessionId != null) {
    saveSessionState({
      stateDir: options.stateDir,
      key: options.key,
      priorSession,
      sessionId: parsed.sessionId,
      prompt,
      cwd: options.cwd,
      command: options.command,
      text: parsed.text,
      stateSuffix: driver.stateSuffix
    });
  }

  // --- Output ---
  // stderr: meta:supports_resume
  process.stderr.write(`meta:supports_resume=${driver.supportsResume}\n`);

  // stdout: review text
  process.stdout.write(`${parsed.text}\n`);
}

// Main guard: only run when executed directly
const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
