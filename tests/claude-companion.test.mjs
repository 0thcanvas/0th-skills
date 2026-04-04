import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, "..", "scripts", "claude-companion.mjs");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claude-companion-test-"));
}

function writeStubClaude(binDir) {
  const stubPath = path.join(binDir, "claude");
  const stub = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const logPath = process.env.CLAUDE_STUB_LOG;
const args = process.argv.slice(2);
const prompt = args[args.length - 1];
fs.appendFileSync(logPath, JSON.stringify({ args, prompt }) + "\\n");

const resumeIndex = args.indexOf("--resume");
const sessionId = resumeIndex >= 0 ? args[resumeIndex + 1] : "session-1";
const resultText = resumeIndex >= 0 ? "round-two" : "round-one";

const payload = [
  {
    type: "system",
    subtype: "init",
    session_id: sessionId
  },
  {
    type: "result",
    subtype: "success",
    session_id: sessionId,
    result: resultText
  }
];

process.stdout.write(JSON.stringify(payload));
`;
  fs.writeFileSync(stubPath, stub);
  fs.chmodSync(stubPath, 0o755);
  return stubPath;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("stores Claude session ids and auto-resumes review rounds for the same key", () => {
  const tempDir = makeTempDir();
  const binDir = path.join(tempDir, "bin");
  const stateDir = path.join(tempDir, "state");
  const logPath = path.join(tempDir, "claude.log");

  fs.mkdirSync(binDir);
  fs.mkdirSync(stateDir);
  writeStubClaude(binDir);

  const env = {
    ...process.env,
    CLAUDE_BIN: path.join(binDir, "claude"),
    CLAUDE_STUB_LOG: logPath
  };

  const first = spawnSync(
    "node",
    [scriptPath, "task", "--key", "ship-review", "--state-dir", stateDir, "round one prompt"],
    { encoding: "utf8", env }
  );

  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.trim(), "round-one");

  const reviewState = readJson(path.join(stateDir, "ship-review.json"));
  assert.equal(reviewState.session_id, "session-1");
  assert.equal(reviewState.rounds, 1);

  const second = spawnSync(
    "node",
    [scriptPath, "task", "--key", "ship-review", "--state-dir", stateDir, "round two prompt"],
    { encoding: "utf8", env }
  );

  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout.trim(), "round-two");

  const updatedState = readJson(path.join(stateDir, "ship-review.json"));
  assert.equal(updatedState.session_id, "session-1");
  assert.equal(updatedState.rounds, 2);

  const logLines = fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(logLines.length, 2);
  assert.equal(logLines[0].args.includes("--resume"), false);
  assert.equal(logLines[1].args.includes("--resume"), true);

  const resumeIndex = logLines[1].args.indexOf("--resume");
  assert.equal(logLines[1].args[resumeIndex + 1], "session-1");
});

test("resume-last reuses the most recent saved session", () => {
  const tempDir = makeTempDir();
  const binDir = path.join(tempDir, "bin");
  const stateDir = path.join(tempDir, "state");
  const logPath = path.join(tempDir, "claude.log");

  fs.mkdirSync(binDir);
  fs.mkdirSync(stateDir);
  writeStubClaude(binDir);

  fs.writeFileSync(
    path.join(stateDir, ".last-session.json"),
    JSON.stringify({
      key: "decision-review",
      session_id: "session-9"
    })
  );

  const env = {
    ...process.env,
    CLAUDE_BIN: path.join(binDir, "claude"),
    CLAUDE_STUB_LOG: logPath
  };

  const result = spawnSync(
    "node",
    [scriptPath, "task", "--resume-last", "--state-dir", stateDir, "counter argument"],
    { encoding: "utf8", env }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "round-two");

  const logEntry = JSON.parse(fs.readFileSync(logPath, "utf8").trim());
  const resumeIndex = logEntry.args.indexOf("--resume");
  assert.equal(logEntry.args[resumeIndex + 1], "session-9");
});
