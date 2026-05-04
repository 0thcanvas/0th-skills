import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const claudeScriptPath = path.join(__dirname, "..", "scripts", "claude-failure-hook.mjs");
const codexScriptPath = path.join(__dirname, "..", "scripts", "codex-failure-hook.mjs");

function tempRepo() {
  return mkdtempSync(path.join(tmpdir(), "0th-claude-hook-"));
}

function writeDossier(repo, runId) {
  const runDir = path.join(repo, "verification-report", "runs", runId);
  mkdirSync(runDir, { recursive: true });
  const dossierPath = path.join(runDir, "dossier.json");
  const dossier = {
    version: 1,
    status: "complete",
    run_id: runId,
    cwd: repo,
    command: ["node", "scripts/failure-dossier-runner.mjs", "--run-id", runId, "--", "node", "--test"],
    exit_code: 9,
    started_at: "2026-05-04T04:00:00.000Z",
    finished_at: "2026-05-04T04:00:01.000Z",
    stdout: { text: "shared stdout", truncated: false, original_length: 13 },
    stderr: { text: "shared stderr", truncated: false, original_length: 13 },
    artifacts: []
  };
  writeFileSync(dossierPath, `${JSON.stringify(dossier, null, 2)}\n`);
  return dossierPath;
}

function claudePayload(repo, command) {
  return {
    hook_event_name: "PostToolUseFailure",
    session_id: "claude-session",
    transcript_path: path.join(repo, "transcript.jsonl"),
    tool_name: "Bash",
    tool_input: { command },
    cwd: repo
  };
}

function codexPayload(repo, command) {
  return {
    hook_event_name: "PostToolUse",
    session_id: "claude-session",
    turn_id: "turn-shared",
    tool_use_id: "tool-shared",
    tool_name: "Bash",
    tool_input: { command },
    tool_response: "",
    model: "gpt-5.5",
    cwd: repo,
    permission_mode: "default",
    transcript_path: path.join(repo, "transcript.jsonl")
  };
}

function run(scriptPath, input) {
  return spawnSync("node", [scriptPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
    cwd: __dirname,
    env: process.env,
    timeout: 10000
  });
}

test("Claude failure hook surfaces the same dossier summary contract", () => {
  const repo = tempRepo();
  const dossierPath = writeDossier(repo, "shared-1");
  const result = run(
    claudeScriptPath,
    claudePayload(repo, "node scripts/failure-dossier-runner.mjs --run-id shared-1 -- node --test")
  );

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "PostToolUseFailure");
  const context = output.hookSpecificOutput.additionalContext;
  assert.match(context, /0th failure dossier/);
  assert.match(context, new RegExp(dossierPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(context, /session_id=claude-session/);
  assert.match(context, /turn_id=unavailable/);
  assert.match(context, /tool_use_id=unavailable/);
  assert.match(context, /exit_code=9/);
  assert.match(context, /shared stderr/);
});

test("Claude and Codex adapters share the same additionalContext body shape", () => {
  const repo = tempRepo();
  writeDossier(repo, "shared-2");
  const command = "node scripts/failure-dossier-runner.mjs --run-id shared-2 -- node --test";

  const claude = JSON.parse(run(claudeScriptPath, claudePayload(repo, command)).stdout)
    .hookSpecificOutput.additionalContext;
  const codex = JSON.parse(run(codexScriptPath, codexPayload(repo, command)).stdout)
    .hookSpecificOutput.additionalContext;

  assert.equal(
    claude
      .replace("turn_id=unavailable", "turn_id=turn-shared")
      .replace("tool_use_id=unavailable", "tool_use_id=tool-shared"),
    codex
  );
});
