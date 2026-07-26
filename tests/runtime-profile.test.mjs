import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  initializeRuntimeProfile,
  loadRuntimeProfile,
  resolveRuntimeCapability,
  validateRuntimeProfile
} from "../scripts/runtime-profile.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("runtime profile schema and portable templates exist", () => {
  for (const relativePath of [
    "protocol/schemas/runtime-profile.schema.json",
    "adapters/templates/runtime-profiles/minimal.json",
    "adapters/templates/runtime-profiles/mcp-workers.json",
    "adapters/templates/runtime-profiles/personal.json",
    "adapters/templates/runtime-profiles/pi.json"
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  }
});

test("bundled runtime-profile guidance resolves inside the package", () => {
  const templatesRoot = path.join(repoRoot, "adapters/templates/runtime-profiles");
  for (const file of fs.readdirSync(templatesRoot).filter((name) => name.endsWith(".json"))) {
    const profile = loadRuntimeProfile({ profilePath: path.join(templatesRoot, file) });
    for (const [capability, binding] of Object.entries(profile.capabilities)) {
      for (const guidance of binding.guidance) {
        assert.equal(
          fs.existsSync(path.join(repoRoot, guidance)),
          true,
          `${file}:${capability} guidance should resolve: ${guidance}`
        );
      }
    }
  }
});

test("minimal profile is single-agent and does not invent capabilities", () => {
  const profile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/minimal.json")
  });

  assert.equal(profile.topology.mode, "single-agent");
  assert.deepEqual(profile.capabilities, {});
  assert.deepEqual(resolveRuntimeCapability({ profile, capability: "secret_runtime" }), {
    profile_id: "minimal",
    harness: "generic",
    capability: "secret_runtime",
    configured: false,
    binding: null,
    authorizes_execution: false,
    reason: "capability_not_configured"
  });
});

test("Pi profile uses the portable 0th state layer without ambient host memory", () => {
  const profile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/pi.json")
  });

  assert.equal(profile.topology.mode, "single-agent");
  assert.equal(profile.state.workflow_store, "0th-state");
  assert.equal(profile.state.ambient_memory, "none");
});

test("personal providers are selectable configuration but never execution authority", () => {
  const profile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/personal.json")
  });
  const resolved = resolveRuntimeCapability({ profile, capability: "secret_runtime" });

  assert.equal(resolved.configured, true);
  assert.equal(resolved.binding.provider, "onepassword");
  assert.equal(resolved.binding.invocation, "local");
  assert.deepEqual(resolved.binding.guidance, ["adapters/providers/onepassword.md"]);
  assert.equal(resolved.authorizes_execution, false);
  assert.equal(resolved.reason, "configuration_requires_live_capability_evidence");
});

test("MCP worker topology exposes an optional versioned knowledge provider", () => {
  const profile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/mcp-workers.json")
  });
  const resolved = resolveRuntimeCapability({ profile, capability: "knowledge_provider" });

  assert.equal(profile.topology.mode, "coordinator-workers");
  assert.equal(resolved.configured, true);
  assert.equal(resolved.binding.invocation, "delegated");
  assert.equal(resolved.binding.worker, "project-knowledge");
  assert.equal(resolved.binding.required, false);
  assert.deepEqual(resolved.binding.guidance, ["references/knowledge-provider.md"]);
  assert.equal(resolved.authorizes_execution, false);
});

test("MCP worker topology separates project discovery from cached code navigation", () => {
  const profile = loadRuntimeProfile({
    profilePath: path.join(repoRoot, "adapters/templates/runtime-profiles/mcp-workers.json")
  });
  const registry = resolveRuntimeCapability({ profile, capability: "project_registry" });
  const knowledge = resolveRuntimeCapability({ profile, capability: "knowledge_provider" });

  assert.equal(registry.configured, true);
  assert.equal(registry.binding.result_contract, "versioned-project-registry-receipt");
  assert.deepEqual(registry.binding.guidance, ["references/project-registry.md"]);
  assert.equal(knowledge.binding.result_contract, "versioned-knowledge-receipt");
  assert.notEqual(registry.binding.result_contract, knowledge.binding.result_contract);
});

test("runtime profiles reject unknown fields and unsafe implied authority", () => {
  const base = {
    schema_version: 1,
    profile_id: "bad",
    harness: "generic",
    topology: {
      mode: "single-agent",
      max_workers: 1,
      workspace_isolation: "none"
    },
    state: {
      workflow_store: "0th-state",
      ambient_memory: "none"
    },
    capabilities: {}
  };

  assert.throws(
    () => validateRuntimeProfile({ ...base, authorizes_execution: true }),
    /unsupported key authorizes_execution/
  );
  assert.throws(
    () => validateRuntimeProfile({
      ...base,
      capabilities: {
        secret_runtime: {
          provider: "onepassword",
          invocation: "local",
          worker: null,
          bindings: ["cli:op"],
          effects: ["secret-use"],
          workspace: "host-managed",
          result_contract: "sanitized-receipt",
          guidance: [],
          required: false,
          authorizes_execution: true
        }
      }
    }),
    /unsupported key authorizes_execution/
  );
});

test("profile init copies a named template without overwriting local configuration", () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "0th-profile-config-"));
  const first = initializeRuntimeProfile({
    template: "pi",
    profileId: "pi-eval",
    configDir,
    pluginRoot: repoRoot
  });
  const second = () => initializeRuntimeProfile({
    template: "pi",
    profileId: "pi-eval",
    configDir,
    pluginRoot: repoRoot
  });

  assert.equal(first.created, true);
  assert.equal(first.profile.profile_id, "pi-eval");
  assert.throws(second, /already exists/);
});

test("profile init rejects path-like template and profile identifiers", () => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "0th-profile-traversal-"));

  assert.throws(() => initializeRuntimeProfile({
    template: "../personal",
    profileId: "safe",
    configDir,
    pluginRoot: repoRoot
  }), /identifier/);
  assert.throws(() => initializeRuntimeProfile({
    template: "pi",
    profileId: "../outside",
    configDir,
    pluginRoot: repoRoot
  }), /identifier/);
});

test("runtime profiles are documented as optional configuration rather than capability proof", () => {
  const protocol = fs.readFileSync(path.join(repoRoot, "protocol/README.md"), "utf8");
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");

  assert.match(protocol, /runtime profile/i);
  assert.match(protocol, /never execution authority/i);
  assert.match(readme, /0th\.mjs profile validate/);
  assert.match(readme, /skill-portability-smoke/);
});
