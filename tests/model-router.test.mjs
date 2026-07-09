import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  loadModelRouting,
  resolveLaunchPlan,
  selectComputeClass,
  validateCapabilityPacket,
  validateExecutionReceipt,
  validateLaunchPlan,
  validateModelRouting,
  verifyExecutionReceipt
} from "../scripts/host-capabilities.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const capabilities = {
  schema_version: 1,
  harness: "codex",
  source: "session-metadata",
  observed_at: "2026-07-09T22:00:00Z",
  model: "gpt-5.6-sol",
  reasoning_effort: "xhigh",
  model_override: true,
  effort_override: true,
  max_parallelism: 4,
  max_depth: 1,
  workspace_isolation: true,
  resume: true,
  hooks: [],
  external_write_controls: ["approval"]
};

const routing = {
  schema_version: 1,
  harness: "codex",
  profiles: {
    economy: {
      model: "gpt-5.4-mini",
      reasoning_effort: "medium",
      selection_mode: "per-invocation"
    },
    balanced: {
      model: "gpt-5.4",
      reasoning_effort: "high",
      selection_mode: "per-invocation"
    },
    frontier: {
      model: "inherit",
      reasoning_effort: "inherit",
      selection_mode: "inherit"
    }
  }
};

function packet(overrides = {}) {
  return {
    objective: "Research one independent official source",
    independent: true,
    ordered: false,
    mutation_scope: "read-only",
    shared_mutable_state: false,
    evidence_advantage: "isolated source extraction",
    work_kind: "source_discovery",
    compute_class: "auto",
    escalation_class: "balanced",
    task_risk: "low",
    budget: { max_workers: 1, max_rounds: 1 },
    output_schema: "raw-finding",
    ...overrides
  };
}

test("portable model-routing schemas and harness adapters exist", () => {
  for (const relativePath of [
    "protocol/schemas/model-routing.schema.json",
    "protocol/schemas/launch-plan.schema.json",
    "protocol/schemas/execution-receipt.schema.json",
    "adapters/codex.models.json",
    "adapters/claude.models.json",
    "adapters/grok.models.json"
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  }
});

test("auto compute policy uses economy for discovery, balanced for bounded coding, and frontier for architecture", () => {
  assert.equal(selectComputeClass(packet()).selected, "economy");
  assert.equal(selectComputeClass(packet({ work_kind: "bounded_implementation" })).selected, "balanced");
  assert.equal(selectComputeClass(packet({ work_kind: "architecture" })).selected, "frontier");
});

test("critical risk raises auto routing to frontier", () => {
  const selection = selectComputeClass(packet({ task_risk: "critical" }));
  assert.equal(selection.selected, "frontier");
  assert.match(selection.rationale, /critical/);
});

test("packet validation rejects model names and invalid escalation direction", () => {
  assert.throws(
    () => validateCapabilityPacket({ ...packet(), requested_model: "gpt-example" }),
    /unsupported key requested_model/
  );
  assert.throws(
    () => validateCapabilityPacket(packet({ compute_class: "balanced", escalation_class: "economy" })),
    /escalation_class/
  );
});

test("harness routing resolves the cheapest eligible launch plan", () => {
  const result = resolveLaunchPlan({ capabilities, packet: packet(), routing });

  assert.equal(result.allowed, true);
  assert.equal(result.topology, "bounded-worker");
  assert.equal(result.launch_plan.compute_class, "economy");
  assert.equal(result.launch_plan.model, "gpt-5.4-mini");
  assert.equal(result.launch_plan.reasoning_effort, "medium");
  assert.equal(result.launch_plan.escalation_class, "balanced");
  assert.match(result.launch_plan.launch_id, /^[a-f0-9]{64}$/);
  assert.equal(result.launch_plan.attestation_required, true);
  assert.equal(validateLaunchPlan(result.launch_plan), result.launch_plan);
});

test("frontier profile can inherit the observed root runtime", () => {
  const result = resolveLaunchPlan({
    capabilities,
    packet: packet({ work_kind: "architecture", escalation_class: null }),
    routing
  });

  assert.equal(result.allowed, true);
  assert.equal(result.launch_plan.compute_class, "frontier");
  assert.equal(result.launch_plan.model, capabilities.model);
  assert.equal(result.launch_plan.reasoning_effort, capabilities.reasoning_effort);
  assert.equal(result.launch_plan.selection_mode, "inherit");
});

test("inherit-only runtime fails closed instead of pretending economy routing", () => {
  const result = resolveLaunchPlan({
    capabilities: { ...capabilities, model_override: false, effort_override: false },
    packet: packet(),
    routing
  });

  assert.equal(result.allowed, false);
  assert.equal(result.launch_plan, null);
  assert.ok(result.reasons.includes("model_override_unavailable"));
  assert.ok(result.reasons.includes("effort_override_unavailable"));
});

test("routing adapters validate and load independently by harness", () => {
  assert.equal(validateModelRouting(routing), routing);
  assert.throws(
    () => validateModelRouting({ ...routing, harness: "" }),
    /harness/
  );
  const loaded = loadModelRouting({
    routingPath: path.join(repoRoot, "adapters", "codex.models.json"),
    harness: "codex"
  });
  assert.equal(loaded.harness, "codex");
});

test("inherit-only harness adapters cannot pretend to provide economy routing", () => {
  const grokRouting = loadModelRouting({
    routingPath: path.join(repoRoot, "adapters", "grok.models.json"),
    harness: "grok"
  });
  const result = resolveLaunchPlan({
    capabilities: { ...capabilities, harness: "grok", model_override: false, effort_override: false },
    packet: packet(),
    routing: grokRouting
  });

  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("compute_class_unavailable"));
});

test("logical agent roles do not own provider model selection", () => {
  for (const directory of ["agents", path.join(".codex", "agents")]) {
    const fullDirectory = path.join(repoRoot, directory);
    for (const fileName of fs.readdirSync(fullDirectory)) {
      const source = fs.readFileSync(path.join(fullDirectory, fileName), "utf8");
      assert.doesNotMatch(source, /^model(?:_reasoning_effort)?\s*[:=]/m, `${directory}/${fileName}`);
    }
  }
});

test("execution receipts attest the actual child model and effort", () => {
  const { launch_plan: launchPlan } = resolveLaunchPlan({ capabilities, packet: packet(), routing });
  const receipt = {
    schema_version: 1,
    launch_id: launchPlan.launch_id,
    harness: "codex",
    actual_model: "gpt-5.4-mini",
    actual_reasoning_effort: "medium",
    source: "session-metadata",
    observed_at: "2026-07-09T22:01:00Z"
  };

  assert.equal(validateExecutionReceipt(receipt), receipt);
  assert.deepEqual(verifyExecutionReceipt({ launchPlan, receipt }), {
    verified: true,
    reasons: []
  });

  const mismatch = verifyExecutionReceipt({
    launchPlan,
    receipt: { ...receipt, actual_model: "gpt-5.6-sol" }
  });
  assert.equal(mismatch.verified, false);
  assert.ok(mismatch.reasons.includes("actual_model_mismatch"));
  assert.throws(
    () => verifyExecutionReceipt({
      launchPlan: { ...launchPlan, model: "tampered-model" },
      receipt
    }),
    /launch_id does not match/
  );
});

test("public CLI emits a launch plan and verifies its receipt", () => {
  const runtimePath = path.join("tests", "fixtures", "model-router", "codex-runtime-controllable.json");
  const packetPath = path.join("tests", "fixtures", "model-router", "source-discovery-packet.json");
  const route = spawnSync(process.execPath, [
    "scripts/0th.mjs",
    "capabilities",
    "--harness", "codex",
    "--runtime-json", runtimePath,
    "--packet-json", packetPath,
    "--now", "2026-07-09T22:02:00Z"
  ], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(route.status, 0, route.stderr);
  const routed = JSON.parse(route.stdout);
  assert.equal(routed.delegation.allowed, true);
  assert.equal(routed.delegation.launch_plan.compute_class, "economy");

  const receipt = {
    schema_version: 1,
    launch_id: routed.delegation.launch_plan.launch_id,
    harness: "codex",
    actual_model: routed.delegation.launch_plan.model,
    actual_reasoning_effort: routed.delegation.launch_plan.reasoning_effort,
    source: "session-metadata",
    observed_at: "2026-07-09T22:03:00Z"
  };
  const tempDir = fs.mkdtempSync(path.join(repoRoot, "verification-report", "receipt-"));
  const launchPath = path.join(tempDir, "launch.json");
  const receiptPath = path.join(tempDir, "receipt.json");
  fs.writeFileSync(launchPath, `${JSON.stringify(routed.delegation.launch_plan)}\n`);
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`);

  const attest = spawnSync(process.execPath, [
    "scripts/0th.mjs",
    "attest",
    "--launch-plan-json", path.relative(repoRoot, launchPath),
    "--receipt-json", path.relative(repoRoot, receiptPath)
  ], { cwd: repoRoot, encoding: "utf8" });

  assert.equal(attest.status, 0, attest.stderr);
  assert.equal(JSON.parse(attest.stdout).verified, true);
});
