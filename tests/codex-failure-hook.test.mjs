import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "..", "scripts", "codex-failure-hook.mjs");

function tempRepo() {
  return mkdtempSync(path.join(tmpdir(), "0th-codex-hook-"));
}

function writeDossier(repo, runId, overrides = {}) {
  const runDir = path.join(repo, "verification-report", "runs", runId);
  mkdirSync(runDir, { recursive: true });
  const dossierPath = path.join(runDir, "dossier.json");
  const dossier = {
    version: 1,
    status: "complete",
    run_id: runId,
    cwd: repo,
    command: ["node", "--test"],
    exit_code: 1,
    started_at: "2026-05-04T04:00:00.000Z",
    finished_at: "2026-05-04T04:00:01.000Z",
    stdout: { text: "stdout sample", truncated: false, original_length: 13 },
    stderr: { text: "stderr sample", truncated: false, original_length: 13 },
    artifacts: [],
    ...overrides
  };
  writeFileSync(dossierPath, `${JSON.stringify(dossier, null, 2)}\n`);
  return dossierPath;
}

function payload(repo, command) {
  return {
    hook_event_name: "PostToolUse",
    session_id: "session-1",
    turn_id: "turn-1",
    tool_use_id: "tool-1",
    tool_name: "Bash",
    tool_input: { command },
    tool_response: "",
    model: "gpt-5.5",
    cwd: repo,
    permission_mode: "default",
    transcript_path: path.join(repo, "transcript.jsonl")
  };
}

function runHook(input) {
  return spawnSync("node", [scriptPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: __dirname,
    env: process.env,
    timeout: 10000
  });
}

test("stays silent when the current tool input has no managed run id", () => {
  const repo = tempRepo();
  const result = runHook(payload(repo, "node --test tests/*.test.mjs"));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("surfaces a matching valid dossier through Codex additionalContext", () => {
  const repo = tempRepo();
  const dossierPath = writeDossier(repo, "run-123");
  const result = runHook(payload(repo, "node scripts/failure-dossier-runner.mjs --run-id run-123 -- node --test"));

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");

  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUse");
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /0th failure dossier/);
  assert.match(context, new RegExp(dossierPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(context, /session_id=session-1/);
  assert.match(context, /turn_id=turn-1/);
  assert.match(context, /tool_use_id=tool-1/);
  assert.match(context, /exit_code=1/);
  assert.match(context, /stderr sample/);
});

test("rejects a dossier whose run id does not match the current tool input", () => {
  const repo = tempRepo();
  writeDossier(repo, "run-123", { run_id: "other-run" });
  const result = runHook(payload(repo, "node scripts/failure-dossier-runner.mjs --run-id run-123 -- node --test"));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("rejects partial or malformed dossier files", () => {
  const repo = tempRepo();
  const runDir = path.join(repo, "verification-report", "runs", "partial-1");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(path.join(runDir, "dossier.json"), JSON.stringify({ run_id: "partial-1", status: "writing" }));

  const result = runHook(payload(repo, "node scripts/failure-dossier-runner.mjs --run-id partial-1 -- node --test"));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("rejects a dossier whose child command does not match the current tool input", () => {
  const repo = tempRepo();
  writeDossier(repo, "run-123");
  const result = runHook(payload(repo, "node scripts/failure-dossier-runner.mjs --run-id run-123 -- node --version"));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("rejects a dossier whose cwd does not match the current hook cwd", () => {
  const repo = tempRepo();
  writeDossier(repo, "run-123", { cwd: "/some/other/cwd" });
  const result = runHook(payload(repo, "node scripts/failure-dossier-runner.mjs --run-id run-123 -- node --test"));

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});
