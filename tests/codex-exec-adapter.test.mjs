import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildCodexExecArgs,
  loadCodexProbeCapabilities,
  probeCodexRouting,
  routingFingerprint,
  runCodexExecWorker
} from "../scripts/codex-exec-adapter.mjs";
import { resolveLaunchPlan } from "../scripts/host-capabilities.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const routing = {
  schema_version: 1,
  harness: "codex",
  profiles: {
    economy: { model: "gpt-test-luna", reasoning_effort: "medium", selection_mode: "per-invocation" },
    balanced: { model: "gpt-test-terra", reasoning_effort: "high", selection_mode: "per-invocation" },
    frontier: { model: "gpt-test-sol", reasoning_effort: "medium", selection_mode: "per-invocation" }
  }
};

const capabilities = {
  schema_version: 1,
  harness: "codex",
  source: "runtime-probe",
  observed_at: "2026-07-09T23:00:00Z",
  model: null,
  reasoning_effort: null,
  available_models: ["gpt-test-luna", "gpt-test-terra", "gpt-test-sol"],
  available_reasoning_efforts: ["medium", "high"],
  available_model_effort_pairs: [
    { model: "gpt-test-luna", reasoning_effort: "medium" },
    { model: "gpt-test-terra", reasoning_effort: "high" },
    { model: "gpt-test-sol", reasoning_effort: "medium" }
  ],
  model_override: true,
  effort_override: true,
  max_parallelism: 1,
  max_depth: 0,
  workspace_isolation: false,
  resume: false,
  hooks: [],
  external_write_controls: []
};

function packet() {
  return {
    objective: "Extract one source",
    independent: true,
    ordered: false,
    mutation_scope: "read-only",
    shared_mutable_state: false,
    evidence_advantage: "bounded worker context",
    work_kind: "source_discovery",
    compute_class: "economy",
    escalation_class: "balanced",
    task_risk: "low",
    budget: { max_workers: 1, max_rounds: 1 },
    output_schema: "finding"
  };
}

function createFakeCodex(directory) {
  const binPath = path.join(directory, "fake-codex");
  fs.writeFileSync(binPath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "--version") {
  process.stdout.write((process.env.FAKE_CODEX_VERSION || "codex-cli 9.9.9") + "\\n");
  process.exit(0);
}
if (process.env.FAKE_CODEX_ARGS_OUT) fs.writeFileSync(process.env.FAKE_CODEX_ARGS_OUT, JSON.stringify(args));
const input = fs.readFileSync(0, "utf8");
if (process.env.FAKE_CODEX_STDIN_OUT) fs.writeFileSync(process.env.FAKE_CODEX_STDIN_OUT, input);
const outputIndex = args.indexOf("--output-last-message");
if (outputIndex >= 0) fs.writeFileSync(args[outputIndex + 1], '{"status":"ready"}\\n');
process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: "thread-test-1" }) + "\\n");
process.stdout.write(JSON.stringify({ type: "turn.started" }) + "\\n");
if (process.env.FAKE_CODEX_FAIL === "1") {
  process.stdout.write(JSON.stringify({ type: "error", message: "model rejected" }) + "\\n");
  process.exit(1);
}
process.stdout.write(JSON.stringify({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 1 } }) + "\\n");
`, { mode: 0o755 });
  return binPath;
}

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "0th-codex-adapter-"));
  const schemaPath = path.join(directory, "output.schema.json");
  fs.writeFileSync(schemaPath, JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["status"],
    properties: { status: { const: "ready" } }
  }));
  return { directory, schemaPath, codexBin: createFakeCodex(directory) };
}

function launchPlan() {
  return resolveLaunchPlan({ capabilities, packet: packet(), routing }).launch_plan;
}

test("Codex exec args pin model and effort while keeping the prompt off argv", () => {
  const { directory, schemaPath } = setup();
  const args = buildCodexExecArgs({
    launchPlan: launchPlan(),
    cwd: directory,
    outputSchemaPath: schemaPath,
    resultPath: path.join(directory, "result.json"),
    sandbox: "read-only"
  });

  assert.deepEqual(args.slice(0, 3), ["exec", "--model", "gpt-test-luna"]);
  assert.ok(args.includes('model_reasoning_effort="medium"'));
  assert.ok(args.includes("--ephemeral"));
  assert.ok(args.includes("--json"));
  assert.ok(args.includes("--output-schema"));
  assert.ok(args.includes("read-only"));
  assert.equal(args.at(-1), "-");
  assert.equal(args.some((arg) => arg.includes("sensitive worker prompt")), false);
});

test("Codex exec worker sends prompts over stdin and emits an attestable receipt", () => {
  const { directory, schemaPath, codexBin } = setup();
  const argsOut = path.join(directory, "args.json");
  const stdinOut = path.join(directory, "stdin.txt");
  const resultPath = path.join(directory, "result.json");
  const eventsPath = path.join(directory, "events.jsonl");
  const receiptPath = path.join(directory, "receipt.json");
  const prompt = "sensitive worker prompt stays off argv";
  const result = runCodexExecWorker({
    launchPlan: launchPlan(),
    prompt,
    cwd: directory,
    outputSchemaPath: schemaPath,
    resultPath,
    eventsPath,
    receiptPath,
    sandbox: "read-only",
    codexBin,
    env: { ...process.env, FAKE_CODEX_ARGS_OUT: argsOut, FAKE_CODEX_STDIN_OUT: stdinOut },
    now: new Date("2026-07-09T23:01:00Z")
  });

  assert.equal(result.status, "completed");
  assert.equal(fs.readFileSync(stdinOut, "utf8"), prompt);
  assert.equal(fs.readFileSync(argsOut, "utf8").includes(prompt), false);
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.equal(receipt.actual_model, "gpt-test-luna");
  assert.equal(receipt.actual_reasoning_effort, "medium");
  assert.equal(receipt.adapter, "codex-exec");
  assert.equal(receipt.runtime_version, "codex-cli 9.9.9");
  assert.equal(receipt.thread_id, "thread-test-1");
  assert.equal(receipt.attestation_basis, "explicit-launch-completed");
});

test("Codex exec worker preserves a rejected model as an explicit failure and writes no receipt", () => {
  const { directory, schemaPath, codexBin } = setup();
  assert.throws(() => runCodexExecWorker({
    launchPlan: launchPlan(),
    prompt: "probe",
    cwd: directory,
    outputSchemaPath: schemaPath,
    resultPath: path.join(directory, "result.json"),
    eventsPath: path.join(directory, "events.jsonl"),
    receiptPath: path.join(directory, "receipt.json"),
    sandbox: "read-only",
    codexBin,
    env: { ...process.env, FAKE_CODEX_FAIL: "1" }
  }), /model rejected/);
  assert.equal(fs.existsSync(path.join(directory, "receipt.json")), false);
});

test("Codex exec worker rejects launch plans owned by another harness", () => {
  const { directory, schemaPath, codexBin } = setup();
  assert.throws(() => runCodexExecWorker({
    launchPlan: { ...launchPlan(), harness: "claude" },
    prompt: "probe",
    cwd: directory,
    outputSchemaPath: schemaPath,
    resultPath: path.join(directory, "result.json"),
    eventsPath: path.join(directory, "events.jsonl"),
    receiptPath: path.join(directory, "receipt.json"),
    codexBin
  }), /requires a codex launch plan/);
});

test("live probe cache is bound to routing fingerprint, Codex version, and freshness", () => {
  const { directory, schemaPath, codexBin } = setup();
  const cachePath = path.join(directory, "probe-cache.json");
  const cache = probeCodexRouting({
    routing,
    cwd: directory,
    outputSchemaPath: schemaPath,
    cachePath,
    codexBin,
    env: process.env,
    now: new Date("2026-07-09T23:02:00Z")
  });

  assert.equal(cache.routing_fingerprint, routingFingerprint(routing));
  assert.equal(cache.profiles.economy.status, "ready");
  const loaded = loadCodexProbeCapabilities({
    cachePath,
    routing,
    codexBin,
    env: process.env,
    now: new Date("2026-07-09T23:03:00Z")
  });
  assert.deepEqual(loaded.available_models.sort(), ["gpt-test-luna", "gpt-test-sol", "gpt-test-terra"]);

  assert.throws(() => loadCodexProbeCapabilities({
    cachePath,
    routing: { ...routing, profiles: { ...routing.profiles, economy: { ...routing.profiles.economy, model: "changed" } } },
    codexBin,
    env: process.env,
    now: new Date("2026-07-09T23:03:00Z")
  }), /routing fingerprint/);
  assert.throws(() => loadCodexProbeCapabilities({
    cachePath,
    routing,
    codexBin,
    env: { ...process.env, FAKE_CODEX_VERSION: "codex-cli 10.0.0" },
    now: new Date("2026-07-09T23:03:00Z")
  }), /Codex version/);
  assert.throws(() => loadCodexProbeCapabilities({
    cachePath,
    routing,
    codexBin,
    env: process.env,
    now: new Date("2026-07-11T23:03:00Z")
  }), /stale/);
});

test("public dispatch runs the controlled worker and its receipt passes attestation", () => {
  const { directory, schemaPath, codexBin } = setup();
  const planPath = path.join(directory, "launch.json");
  const promptPath = path.join(directory, "prompt.txt");
  const resultPath = path.join(directory, "result.json");
  const eventsPath = path.join(directory, "events.jsonl");
  const receiptPath = path.join(directory, "receipt.json");
  fs.writeFileSync(planPath, JSON.stringify(launchPlan()));
  fs.writeFileSync(promptPath, "Return the required object.");

  const dispatched = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "0th.mjs"), "dispatch",
    "--launch-plan-json", planPath,
    "--prompt-file", promptPath,
    "--output-schema", schemaPath,
    "--result-out", resultPath,
    "--events-out", eventsPath,
    "--receipt-out", receiptPath,
    "--worker-cwd", directory,
    "--sandbox", "read-only",
    "--codex-bin", codexBin
  ], { cwd: directory, encoding: "utf8" });
  assert.equal(dispatched.status, 0, dispatched.stderr);
  assert.equal(JSON.parse(dispatched.stdout).status, "completed");

  const attested = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "0th.mjs"), "attest",
    "--launch-plan-json", planPath,
    "--receipt-json", receiptPath
  ], { cwd: directory, encoding: "utf8" });
  assert.equal(attested.status, 0, attested.stderr);
  assert.equal(JSON.parse(attested.stdout).verified, true);
});

test("routing doctor live probe writes a reusable cache for later capability decisions", () => {
  const { directory, codexBin } = setup();
  const routingPath = path.join(directory, "routing.json");
  const packetPath = path.join(directory, "packet.json");
  const cachePath = path.join(directory, "probe-cache.json");
  fs.writeFileSync(routingPath, JSON.stringify(routing));
  fs.writeFileSync(packetPath, JSON.stringify(packet()));

  const probed = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "0th.mjs"), "routing", "doctor",
    "--harness", "codex",
    "--routing-json", routingPath,
    "--live-probe",
    "--probe-cache", cachePath,
    "--codex-bin", codexBin,
    "--now", "2026-07-09T23:04:00Z"
  ], { cwd: directory, encoding: "utf8" });
  assert.equal(probed.status, 0, probed.stderr);
  assert.equal(JSON.parse(probed.stdout).status, "ready");

  const routed = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "0th.mjs"), "capabilities",
    "--harness", "codex",
    "--routing-json", routingPath,
    "--packet-json", packetPath,
    "--probe-cache", cachePath,
    "--codex-bin", codexBin,
    "--now", "2026-07-09T23:05:00Z"
  ], { cwd: directory, encoding: "utf8" });
  assert.equal(routed.status, 0, routed.stderr);
  const output = JSON.parse(routed.stdout);
  assert.equal(output.capabilities.source, "runtime-probe");
  assert.equal(output.delegation.allowed, true);
  assert.equal(output.delegation.launch_plan.model, "gpt-test-luna");
});
