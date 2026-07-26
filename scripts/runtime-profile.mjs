#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isInvokedAsCli } from "./lib/cli.mjs";

const DEFAULT_PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_KEYS = [
  "schema_version",
  "profile_id",
  "harness",
  "topology",
  "state",
  "capabilities"
];
const TOPOLOGY_KEYS = ["mode", "max_workers", "workspace_isolation"];
const STATE_KEYS = ["workflow_store", "ambient_memory"];
const BINDING_KEYS = [
  "provider",
  "invocation",
  "worker",
  "bindings",
  "effects",
  "workspace",
  "result_contract",
  "guidance",
  "required"
];
const TOPOLOGY_MODES = ["single-agent", "coordinator-workers", "host-native"];
const WORKSPACE_MODES = ["none", "shared", "isolated", "host-managed"];
const WORKFLOW_STORES = ["0th-state", "host-native", "none"];
const AMBIENT_MEMORY = ["0th-state", "host-native", "none"];
const INVOCATIONS = ["local", "delegated", "host-native"];
const EFFECTS = ["read", "workspace-write", "external-write", "secret-use", "session-use"];

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertRequiredKeys(value, keys, label) {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) throw new Error(`${label}: missing ${key}`);
  }
}

function assertAllowedKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}: unsupported key ${key}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertIdentifier(value, label) {
  assertNonEmptyString(value, label);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw new Error(`${label} must be a path-safe identifier`);
  }
}

function assertEnum(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
}

function assertUniqueStringArray(value, label, allowed = null) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`);
  if (allowed) {
    for (const item of value) assertEnum(item, allowed, label);
  }
}

function validateCapabilityBinding(value, label) {
  assertObject(value, label);
  assertRequiredKeys(value, BINDING_KEYS, label);
  assertAllowedKeys(value, BINDING_KEYS, label);
  assertNonEmptyString(value.provider, `${label}.provider`);
  assertEnum(value.invocation, INVOCATIONS, `${label}.invocation`);
  if (value.worker !== null) assertNonEmptyString(value.worker, `${label}.worker`);
  assertUniqueStringArray(value.bindings, `${label}.bindings`);
  assertUniqueStringArray(value.effects, `${label}.effects`, EFFECTS);
  assertEnum(value.workspace, WORKSPACE_MODES, `${label}.workspace`);
  assertNonEmptyString(value.result_contract, `${label}.result_contract`);
  assertUniqueStringArray(value.guidance, `${label}.guidance`);
  if (typeof value.required !== "boolean") throw new Error(`${label}.required must be boolean`);
  if (value.invocation === "delegated" && value.worker === null) {
    throw new Error(`${label}.worker is required for delegated invocation`);
  }
}

export function validateRuntimeProfile(value) {
  assertObject(value, "runtime profile");
  assertRequiredKeys(value, PROFILE_KEYS, "runtime profile");
  assertAllowedKeys(value, PROFILE_KEYS, "runtime profile");
  if (value.schema_version !== 1) throw new Error("runtime profile: schema_version must be 1");
  assertIdentifier(value.profile_id, "runtime profile.profile_id");
  assertNonEmptyString(value.harness, "runtime profile.harness");

  assertObject(value.topology, "runtime profile.topology");
  assertRequiredKeys(value.topology, TOPOLOGY_KEYS, "runtime profile.topology");
  assertAllowedKeys(value.topology, TOPOLOGY_KEYS, "runtime profile.topology");
  assertEnum(value.topology.mode, TOPOLOGY_MODES, "runtime profile.topology.mode");
  if (
    value.topology.max_workers !== null
    && (!Number.isInteger(value.topology.max_workers) || value.topology.max_workers < 1)
  ) throw new Error("runtime profile.topology.max_workers must be null or an integer >= 1");
  assertEnum(
    value.topology.workspace_isolation,
    WORKSPACE_MODES,
    "runtime profile.topology.workspace_isolation"
  );
  if (value.topology.mode === "single-agent" && value.topology.max_workers !== 1) {
    throw new Error("runtime profile: single-agent topology requires max_workers 1");
  }

  assertObject(value.state, "runtime profile.state");
  assertRequiredKeys(value.state, STATE_KEYS, "runtime profile.state");
  assertAllowedKeys(value.state, STATE_KEYS, "runtime profile.state");
  assertEnum(value.state.workflow_store, WORKFLOW_STORES, "runtime profile.state.workflow_store");
  assertEnum(value.state.ambient_memory, AMBIENT_MEMORY, "runtime profile.state.ambient_memory");

  assertObject(value.capabilities, "runtime profile.capabilities");
  for (const [capability, binding] of Object.entries(value.capabilities)) {
    assertNonEmptyString(capability, "runtime profile capability name");
    validateCapabilityBinding(binding, `runtime profile.capabilities.${capability}`);
  }
  return value;
}

export function loadRuntimeProfile({ profilePath }) {
  if (!profilePath) throw new Error("profilePath is required");
  let source;
  try {
    source = fs.readFileSync(profilePath, "utf8");
  } catch (error) {
    throw new Error(`failed to read runtime profile ${profilePath}: ${error.message}`);
  }
  let profile;
  try {
    profile = JSON.parse(source);
  } catch (error) {
    throw new Error(`failed to parse runtime profile ${profilePath}: ${error.message}`);
  }
  return validateRuntimeProfile(profile);
}

export function resolveRuntimeCapability({ profile, capability }) {
  validateRuntimeProfile(profile);
  assertNonEmptyString(capability, "capability");
  const binding = profile.capabilities[capability] ?? null;
  return {
    profile_id: profile.profile_id,
    harness: profile.harness,
    capability,
    configured: Boolean(binding),
    binding,
    authorizes_execution: false,
    reason: binding
      ? "configuration_requires_live_capability_evidence"
      : "capability_not_configured"
  };
}

export function initializeRuntimeProfile({
  template,
  profileId = template,
  configDir,
  pluginRoot = DEFAULT_PLUGIN_ROOT
}) {
  assertIdentifier(template, "template");
  assertIdentifier(profileId, "profileId");
  if (!configDir) throw new Error("configDir is required");
  const templatePath = path.join(
    pluginRoot,
    "adapters",
    "templates",
    "runtime-profiles",
    `${template}.json`
  );
  const templateProfile = loadRuntimeProfile({ profilePath: templatePath });
  const outputPath = path.join(path.resolve(configDir), `${profileId}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  if (fs.existsSync(outputPath)) throw new Error(`runtime profile already exists: ${outputPath}`);
  const profile = validateRuntimeProfile({ ...templateProfile, profile_id: profileId });
  fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
  return {
    created: true,
    path: outputPath,
    template,
    profile
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--profile-json") options.profilePath = rest[++index];
    else if (token === "--capability") options.capability = rest[++index];
    else if (token === "--template") options.template = rest[++index];
    else if (token === "--profile-id") options.profileId = rest[++index];
    else if (token === "--config-dir") options.configDir = rest[++index];
    else throw new Error(`unknown profile option: ${token}`);
  }
  return options;
}

export function runRuntimeProfileCommand(argv, { pluginRoot = DEFAULT_PLUGIN_ROOT } = {}) {
  const options = parseArgs(argv);
  if (options.command === "validate") {
    const profile = loadRuntimeProfile({ profilePath: options.profilePath });
    return {
      valid: true,
      profile_id: profile.profile_id,
      harness: profile.harness,
      topology: profile.topology
    };
  }
  if (options.command === "resolve") {
    const profile = loadRuntimeProfile({ profilePath: options.profilePath });
    return resolveRuntimeCapability({ profile, capability: options.capability });
  }
  if (options.command === "init") {
    return initializeRuntimeProfile({
      template: options.template,
      profileId: options.profileId,
      configDir: options.configDir,
      pluginRoot
    });
  }
  throw new Error("usage: profile <validate|resolve|init> [options]");
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(runRuntimeProfileCommand(process.argv.slice(2)), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
