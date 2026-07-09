import fs from "node:fs";
import path from "node:path";

const SOURCES = new Set(["documented-only", "session-metadata", "runtime-probe"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const REQUESTED_EFFORTS = new Set(["proportionate", "inherit", ...EFFORTS]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const MUTATION_SCOPES = new Set(["read-only", "mutable"]);
const REQUIRED_CAPABILITY_KEYS = [
  "schema_version",
  "harness",
  "source",
  "observed_at",
  "model",
  "reasoning_effort",
  "model_override",
  "effort_override",
  "max_parallelism",
  "max_depth",
  "workspace_isolation",
  "resume",
  "hooks",
  "external_write_controls"
];
const REQUIRED_PACKET_KEYS = [
  "objective",
  "independent",
  "ordered",
  "mutation_scope",
  "shared_mutable_state",
  "evidence_advantage",
  "requested_model",
  "requested_effort",
  "task_risk",
  "budget",
  "output_schema"
];

export const DEFAULT_MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1000;

function readJson(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`failed to read JSON from ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`failed to parse JSON from ${filePath}: ${error.message}`);
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertRequiredKeys(value, keys, label) {
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${label}: missing ${key}`);
    }
  }
}

function assertNullableString(value, label) {
  if (value !== null && (typeof value !== "string" || value.trim() === "")) {
    throw new Error(`${label} must be null or a non-empty string`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be boolean`);
  }
}

function assertNullableBoolean(value, label) {
  if (value !== null && typeof value !== "boolean") {
    throw new Error(`${label} must be null or boolean`);
  }
}

function assertNullableInteger(value, label, minimum) {
  if (value !== null && (!Number.isInteger(value) || value < minimum)) {
    throw new Error(`${label} must be null or an integer >= ${minimum}`);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
}

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} must be an ISO date-time`);
  }
  return timestamp;
}

export function validateHostCapabilities(value) {
  assertObject(value, "host capabilities");
  assertRequiredKeys(value, REQUIRED_CAPABILITY_KEYS, "host capabilities");

  if (value.schema_version !== 1) throw new Error("host capabilities: schema_version must be 1");
  if (typeof value.harness !== "string" || value.harness.trim() === "") {
    throw new Error("host capabilities: harness must be a non-empty string");
  }
  if (!SOURCES.has(value.source)) {
    throw new Error(`host capabilities: unsupported source ${JSON.stringify(value.source)}`);
  }

  if (value.observed_at !== null) parseTimestamp(value.observed_at, "host capabilities: observed_at");
  if (value.source !== "documented-only" && value.observed_at === null) {
    throw new Error("host capabilities: live observations require observed_at");
  }
  assertNullableString(value.model, "host capabilities: model");
  if (value.reasoning_effort !== null && !EFFORTS.has(value.reasoning_effort)) {
    throw new Error("host capabilities: reasoning_effort is invalid");
  }
  assertBoolean(value.model_override, "host capabilities: model_override");
  assertBoolean(value.effort_override, "host capabilities: effort_override");
  assertNullableInteger(value.max_parallelism, "host capabilities: max_parallelism", 1);
  assertNullableInteger(value.max_depth, "host capabilities: max_depth", 0);
  assertNullableBoolean(value.workspace_isolation, "host capabilities: workspace_isolation");
  assertNullableBoolean(value.resume, "host capabilities: resume");
  assertStringArray(value.hooks, "host capabilities: hooks");
  assertStringArray(value.external_write_controls, "host capabilities: external_write_controls");
  return value;
}

export function validateCapabilityPacket(value) {
  assertObject(value, "capability packet");
  assertRequiredKeys(value, REQUIRED_PACKET_KEYS, "capability packet");

  for (const key of ["objective", "evidence_advantage", "output_schema"]) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error(`capability packet: ${key} must be a non-empty string`);
    }
  }
  for (const key of ["independent", "ordered", "shared_mutable_state"]) {
    assertBoolean(value[key], `capability packet: ${key}`);
  }
  if (!MUTATION_SCOPES.has(value.mutation_scope)) {
    throw new Error("capability packet: mutation_scope is invalid");
  }
  assertNullableString(value.requested_model, "capability packet: requested_model");
  if (!REQUESTED_EFFORTS.has(value.requested_effort)) {
    throw new Error("capability packet: requested_effort is invalid");
  }
  if (!RISKS.has(value.task_risk)) throw new Error("capability packet: task_risk is invalid");
  assertObject(value.budget, "capability packet: budget");
  assertRequiredKeys(value.budget, ["max_workers", "max_rounds"], "capability packet: budget");
  for (const key of ["max_workers", "max_rounds"]) {
    if (!Number.isInteger(value.budget[key]) || value.budget[key] < 1) {
      throw new Error(`capability packet: budget.${key} must be an integer >= 1`);
    }
  }
  return value;
}

export function loadHostCapabilities({
  adapterPath,
  runtimePath,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_OBSERVATION_AGE_MS
} = {}) {
  if (!adapterPath) throw new Error("adapterPath is required");
  const adapter = validateHostCapabilities(readJson(adapterPath));
  if (!runtimePath) return adapter;

  const runtime = readJson(runtimePath);
  const capabilities = validateHostCapabilities({ ...adapter, ...runtime });
  if (capabilities.harness !== adapter.harness) {
    throw new Error(`runtime harness ${capabilities.harness} does not match adapter ${adapter.harness}`);
  }
  if (capabilities.source === "documented-only") {
    throw new Error("runtime capability input must be a live observation");
  }
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) throw new Error("maxAgeMs must be non-negative");

  const observedAt = parseTimestamp(capabilities.observed_at, "host capabilities: observed_at");
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(currentTime)) throw new Error("now must be a valid date");
  const ageMs = currentTime - observedAt;
  if (ageMs > maxAgeMs) {
    throw new Error(`host capability observation is stale by ${ageMs - maxAgeMs}ms`);
  }
  if (ageMs < -5 * 60 * 1000) {
    throw new Error("host capability observation is too far in the future");
  }
  return capabilities;
}

export function decideDelegation({ capabilities, packet } = {}) {
  validateHostCapabilities(capabilities);
  validateCapabilityPacket(packet);
  const reasons = [];

  if (capabilities.source === "documented-only") reasons.push("live_observation_required");
  if (!packet.independent) reasons.push("work_not_independent");
  if (packet.ordered) reasons.push("ordered_work_requires_root");
  if (!packet.evidence_advantage.trim()) reasons.push("evidence_advantage_required");
  if (capabilities.max_parallelism === null || packet.budget.max_workers > capabilities.max_parallelism) {
    reasons.push("parallelism_unavailable");
  }
  if (packet.mutation_scope === "mutable" && packet.shared_mutable_state && capabilities.workspace_isolation !== true) {
    reasons.push("workspace_isolation_required");
  }
  if (
    packet.requested_model !== null
    && packet.requested_model !== capabilities.model
    && !capabilities.model_override
  ) {
    reasons.push("model_override_unavailable");
  }
  if (
    !["proportionate", "inherit"].includes(packet.requested_effort)
    && packet.requested_effort !== capabilities.reasoning_effort
    && !capabilities.effort_override
  ) {
    reasons.push("effort_override_unavailable");
  }
  if (
    packet.task_risk === "low"
    && ["xhigh", "max"].includes(capabilities.reasoning_effort)
    && !capabilities.effort_override
  ) {
    reasons.push("disproportionate_inherited_effort");
  }

  return reasons.length > 0
    ? { allowed: false, topology: "single-root", reasons }
    : { allowed: true, topology: "bounded-worker", reasons: [] };
}

function parseCliOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--harness") options.harness = argv[++index];
    else if (token === "--runtime-json") options.runtimeJson = argv[++index];
    else if (token === "--packet-json") options.packetJson = argv[++index];
    else if (token === "--now") options.now = argv[++index];
    else if (token === "--max-age-ms") options.maxAgeMs = Number(argv[++index]);
    else throw new Error(`unknown capabilities option: ${token}`);
  }
  return options;
}

export function runCapabilitiesCommand(argv, { cwd = process.cwd() } = {}) {
  const options = parseCliOptions(argv);
  if (!options.harness) throw new Error("--harness is required");
  const adapterPath = path.resolve(cwd, "adapters", `${options.harness}.capabilities.json`);
  const runtimePath = options.runtimeJson ? path.resolve(cwd, options.runtimeJson) : undefined;
  const capabilities = loadHostCapabilities({
    adapterPath,
    runtimePath,
    now: options.now ? new Date(options.now) : new Date(),
    maxAgeMs: options.maxAgeMs ?? DEFAULT_MAX_OBSERVATION_AGE_MS
  });
  const output = { capabilities };

  if (options.packetJson) {
    const packet = readJson(path.resolve(cwd, options.packetJson));
    output.delegation = decideDelegation({ capabilities, packet });
  }
  return output;
}
