import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, "..", "scripts", "codex-companion.mjs");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codex-companion-test-"));
}

function writeStubCodex(binDir) {
  const stubPath = path.join(binDir, "codex");
  const stub = `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const logPath = process.env.CODEX_STUB_LOG;
fs.appendFileSync(logPath, JSON.stringify({ args }) + "\\n");

const isResume = args[0] === "exec" && args[1] === "resume";
const threadId = isResume ? args[3] : "thread-1";
const resultText = isResume ? "round-two" : "round-one";

process.stdout.write([
  JSON.stringify({ type: "thread.started", thread_id: threadId }),
  JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "agent_message", text: resultText } }),
  JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } })
].join("\\n"));
`;
  fs.writeFileSync(stubPath, stub);
  fs.chmodSync(stubPath, 0o755);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("stores Codex thread ids and auto-resumes review rounds for the same key", () => {
  const tempDir = makeTempDir();
  const binDir = path.join(tempDir, "bin");
  const stateDir = path.join(tempDir, "state");
  const logPath = path.join(tempDir, "codex.log");

  fs.mkdirSync(binDir);
  fs.mkdirSync(stateDir);
  writeStubCodex(binDir);

  const env = {
    ...process.env,
    CODEX_BIN: path.join(binDir, "codex"),
    CODEX_STUB_LOG: logPath
  };

  const first = spawnSync(
    "node",
    [scriptPath, "task", "--key", "decision-review", "--state-dir", stateDir, "round one prompt"],
    { encoding: "utf8", env }
  );

  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout.trim(), "round-one");

  const reviewState = readJson(path.join(stateDir, "decision-review.codex.json"));
  assert.equal(reviewState.session_id, "thread-1");
  assert.equal(reviewState.rounds, 1);

  const second = spawnSync(
    "node",
    [scriptPath, "task", "--key", "decision-review", "--state-dir", stateDir, "round two prompt"],
    { encoding: "utf8", env }
  );

  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout.trim(), "round-two");

  const updatedState = readJson(path.join(stateDir, "decision-review.codex.json"));
  assert.equal(updatedState.session_id, "thread-1");
  assert.equal(updatedState.rounds, 2);

  const logLines = fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

  assert.equal(logLines.length, 2);
  assert.deepEqual(logLines[0].args.slice(0, 2), ["exec", "--json"]);
  assert.deepEqual(logLines[1].args.slice(0, 4), ["exec", "resume", "--json", "thread-1"]);
});

test("resume-last reuses the most recent saved Codex session", () => {
  const tempDir = makeTempDir();
  const binDir = path.join(tempDir, "bin");
  const stateDir = path.join(tempDir, "state");
  const logPath = path.join(tempDir, "codex.log");

  fs.mkdirSync(binDir);
  fs.mkdirSync(stateDir);
  writeStubCodex(binDir);

  fs.writeFileSync(
    path.join(stateDir, ".last-codex-session.json"),
    JSON.stringify({
      key: "ship-review",
      session_id: "thread-9"
    })
  );

  const env = {
    ...process.env,
    CODEX_BIN: path.join(binDir, "codex"),
    CODEX_STUB_LOG: logPath
  };

  const result = spawnSync(
    "node",
    [scriptPath, "task", "--resume-last", "--state-dir", stateDir, "counter argument"],
    { encoding: "utf8", env }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "round-two");

  const logEntry = JSON.parse(fs.readFileSync(logPath, "utf8").trim());
  assert.deepEqual(logEntry.args.slice(0, 4), ["exec", "resume", "--json", "thread-9"]);
});
