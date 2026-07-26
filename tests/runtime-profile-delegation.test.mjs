import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  decideDelegation,
  loadHostCapabilities,
  loadModelRouting
} from "../scripts/host-capabilities.mjs";
import { loadRuntimeProfile } from "../scripts/runtime-profile.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const readJson = relativePath => JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));

function liveCapabilities() {
  return loadHostCapabilities({
    adapterPath: path.join(repoRoot, "adapters/codex.capabilities.json"),
    runtimePath: path.join(repoRoot, "tests/fixtures/model-router/codex-runtime-controllable.json"),
    now: new Date("2026-07-09T22:30:00.000Z")
  });
}

function routing() {
  return loadModelRouting({
    routingPath: path.join(repoRoot, "tests/fixtures/model-router/codex-routing.json"),
    harness: "codex"
  });
}

test("a single-agent runtime profile prevents worker delegation", () => {
  const runtimeProfile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/minimal.json")
  });
  const decision = decideDelegation({
    capabilities: liveCapabilities(),
    packet: readJson("tests/fixtures/skills-kernel/read-only-packet.json"),
    routing: routing(),
    runtimeProfile
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("runtime_profile_single_agent"));
});

test("a delegated capability returns its configured worker binding", () => {
  const runtimeProfile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/mcp-workers.json")
  });
  const packet = readJson("tests/fixtures/skills-kernel/knowledge-provider-packet.json");
  const decision = decideDelegation({
    capabilities: liveCapabilities(),
    packet,
    routing: routing(),
    runtimeProfile
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.topology, "bounded-worker");
  assert.equal(decision.capability_binding.worker, "project-knowledge");
  assert.equal(decision.capability_binding.result_contract, "versioned-knowledge-receipt");
});

test("an unconfigured named capability fails closed", () => {
  const runtimeProfile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/mcp-workers.json")
  });
  const packet = {
    ...readJson("tests/fixtures/skills-kernel/read-only-packet.json"),
    capability: "production_deployer"
  };
  const decision = decideDelegation({
    capabilities: liveCapabilities(),
    packet,
    routing: routing(),
    runtimeProfile
  });

  assert.equal(decision.allowed, false);
  assert.ok(decision.reasons.includes("runtime_profile_capability_not_configured"));
});

test("capabilities CLI applies the selected runtime profile", () => {
  const result = spawnSync(process.execPath, [
    "scripts/0th.mjs",
    "capabilities",
    "--harness",
    "codex",
    "--runtime-json",
    "tests/fixtures/model-router/codex-runtime-controllable.json",
    "--routing-json",
    "tests/fixtures/model-router/codex-routing.json",
    "--profile-json",
    "adapters/templates/runtime-profiles/minimal.json",
    "--packet-json",
    "tests/fixtures/skills-kernel/read-only-packet.json",
    "--now",
    "2026-07-09T22:30:00.000Z"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.runtime_profile.profile_id, "minimal");
  assert.ok(output.delegation.reasons.includes("runtime_profile_single_agent"));
});
