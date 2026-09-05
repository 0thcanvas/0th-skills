import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveLaunchPlan, validateHostCapabilities, verifyExecutionReceipt } from "../scripts/host-capabilities.mjs";

const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
function fixture() {
  const capabilities = read("./fixtures/skills-kernel/codex-runtime-observed.json");
  Object.assign(capabilities, {
    model: "fixture-future-model", reasoning_effort: "adaptive-v2", observed_at: new Date().toISOString()
  });
  const packet = read("./fixtures/skills-kernel/read-only-packet.json");
  Object.assign(packet, { compute_class: "inherit", task_risk: "medium", escalation_class: null });
  return { capabilities, packet, routing: read("../adapters/codex.models.json") };
}

test("an observed unfamiliar model and effort inherit and attest without a release update", () => {
  const input = fixture();
  const result = resolveLaunchPlan(input);
  assert.equal(result.allowed, true);
  assert.equal(result.launch_plan.model, input.capabilities.model);
  assert.equal(result.launch_plan.reasoning_effort, "adaptive-v2");
  const receipt = {
    schema_version: 1, launch_id: result.launch_plan.launch_id, harness: "codex",
    actual_model: input.capabilities.model, actual_reasoning_effort: "adaptive-v2",
    source: "session-metadata", observed_at: new Date().toISOString(), adapter: "fixture",
    runtime_version: "fixture", thread_id: "fixture", attestation_basis: "runtime-metadata"
  };
  assert.equal(verifyExecutionReceipt({ launchPlan: result.launch_plan, receipt }).verified, true);
  receipt.actual_reasoning_effort = "adaptive-v3";
  assert.equal(verifyExecutionReceipt({ launchPlan: result.launch_plan, receipt }).verified, false);
});

test("unfamiliar concrete selectors still require the exact observed runtime pair", () => {
  const input = fixture();
  Object.assign(input.capabilities, {
    model: "fixture-current-model", reasoning_effort: "medium", model_override: true, effort_override: true,
    available_models: ["fixture-future-model"], available_reasoning_efforts: ["adaptive-v2"],
    available_model_effort_pairs: []
  });
  input.packet.compute_class = "frontier";
  input.routing.profiles.frontier = { model: "fixture-future-model", reasoning_effort: "adaptive-v2", selection_mode: "per-invocation" };
  assert.ok(resolveLaunchPlan(input).reasons.includes("model_effort_pair_unavailable"));
  input.capabilities.available_model_effort_pairs.push({ model: "fixture-future-model", reasoning_effort: "adaptive-v2" });
  assert.equal(resolveLaunchPlan(input).allowed, true);
});

test("unfamiliar inherited effort is not silently classified as cheap work", () => {
  const input = fixture();
  Object.assign(input.packet, { compute_class: "economy", task_risk: "low" });
  input.routing.profiles.economy = { model: "inherit", reasoning_effort: "inherit", selection_mode: "inherit" };
  const result = resolveLaunchPlan(input);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("inherited_effort_cost_unclassified"));
});

test("malformed and unresolved effort values cannot masquerade as observations", () => {
  for (const effort of ["", " ", "inherit", "medium\n", "$(command)", 7]) {
    const { capabilities } = fixture();
    capabilities.reasoning_effort = effort;
    assert.throws(() => validateHostCapabilities(capabilities), /reasoning_effort is invalid/);
  }
});
