import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  decideDelegation,
  loadHostCapabilities,
  loadModelRouting,
  validateCapabilityPacket,
  validateHostCapabilities
} from "../scripts/host-capabilities.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const adapterPath = path.join(repoRoot, "adapters", "codex.capabilities.json");
const routingPath = path.join(repoRoot, "tests", "fixtures", "model-router", "codex-routing.json");
const runtimePath = path.join(repoRoot, "tests", "fixtures", "skills-kernel", "codex-runtime-observed.json");
const packetPath = path.join(repoRoot, "tests", "fixtures", "skills-kernel", "read-only-packet.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const routing = loadModelRouting({ routingPath, harness: "codex" });

test("portable capability schemas exist", () => {
  for (const relativePath of [
    "protocol/schemas/host-capabilities.schema.json",
    "protocol/schemas/capability-packet.schema.json",
    "protocol/schemas/task-spec.schema.json",
    "protocol/schemas/exit-status.schema.json"
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  }
});

test("documented-only capabilities cannot authorize delegation", () => {
  const capabilities = loadHostCapabilities({ adapterPath });
  const packet = readJson(packetPath);
  const decision = decideDelegation({ capabilities, packet, routing });

  assert.equal(decision.allowed, false);
  assert.equal(decision.topology, "single-root");
  assert.ok(decision.reasons.includes("live_observation_required"));
});

test("a live low-risk task rejects inherited xhigh when effort cannot be overridden", () => {
  const capabilities = loadHostCapabilities({
    adapterPath,
    runtimePath,
    now: new Date("2026-07-09T20:00:00Z")
  });
  const packet = readJson(packetPath);
  const decision = decideDelegation({ capabilities, packet, routing });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("disproportionate_inherited_effort"));
});

test("an observed proportionate read-only worker is eligible", () => {
  const capabilities = {
    ...loadHostCapabilities({
      adapterPath,
      runtimePath,
      now: new Date("2026-07-09T20:00:00Z")
    }),
    reasoning_effort: "medium",
    available_models: ["gpt-5.6-sol", "gpt-5.4-mini", "gpt-5.4"],
    available_reasoning_efforts: ["medium", "high", "xhigh"],
    model_override: true,
    effort_override: true
  };
  const packet = readJson(packetPath);
  const decision = decideDelegation({ capabilities, packet, routing });

  assert.equal(decision.allowed, true);
  assert.equal(decision.topology, "bounded-worker");
  assert.deepEqual(decision.reasons, []);
  assert.equal(decision.launch_plan.compute_class, "economy");
});

test("shared mutable work is rejected without workspace isolation", () => {
  const capabilities = {
    ...loadHostCapabilities({
      adapterPath,
      runtimePath,
      now: new Date("2026-07-09T20:00:00Z")
    }),
    reasoning_effort: "medium",
    available_models: ["gpt-5.6-sol", "gpt-5.4-mini", "gpt-5.4"],
    available_reasoning_efforts: ["medium", "high", "xhigh"],
    model_override: true,
    effort_override: true
  };
  const packet = {
    ...readJson(packetPath),
    mutation_scope: "mutable",
    shared_mutable_state: true
  };
  const decision = decideDelegation({ capabilities, packet, routing });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("workspace_isolation_required"));
});

test("adapter-selected effort requires an observed override control", () => {
  const capabilities = {
    ...loadHostCapabilities({
      adapterPath,
      runtimePath,
      now: new Date("2026-07-09T20:00:00Z")
    }),
    model: "gpt-5.4-mini"
  };
  const packet = readJson(packetPath);
  const decision = decideDelegation({ capabilities, packet, routing });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("effort_override_unavailable"));
});

test("stale observations fail closed", () => {
  assert.throws(
    () => loadHostCapabilities({
      adapterPath,
      runtimePath,
      now: new Date("2026-07-10T22:00:00Z"),
      maxAgeMs: 24 * 60 * 60 * 1000
    }),
    /stale/
  );
});

test("capability validators reject incomplete records and packets", () => {
  assert.throws(() => validateHostCapabilities({ harness: "codex" }), /schema_version/);
  assert.throws(() => validateCapabilityPacket({ objective: "lookup" }), /independent/);
});

test("public 0th capabilities command emits a routed capability record", () => {
  const result = spawnSync(process.execPath, [
    "scripts/0th.mjs",
    "capabilities",
    "--harness",
    "codex",
    "--runtime-json",
    path.relative(repoRoot, runtimePath),
    "--packet-json",
    path.relative(repoRoot, packetPath),
    "--now",
    "2026-07-09T20:00:00Z"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.capabilities.model, "gpt-5.6-sol");
  assert.equal(output.capabilities.reasoning_effort, "xhigh");
  assert.equal(output.delegation.allowed, false);
  assert.ok(output.delegation.reasons.includes("disproportionate_inherited_effort"));
});
