import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const SOURCES = new Set(["documented-only", "session-metadata", "runtime-probe"]);
const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const MUTATION_SCOPES = new Set(["read-only", "mutable"]);
const COMPUTE_CLASSES = new Set(["auto", "economy", "balanced", "frontier", "inherit"]);
const ROUTABLE_COMPUTE_CLASSES = ["economy", "balanced", "frontier"];
const COMPUTE_RANK = new Map([["economy", 0], ["balanced", 1], ["frontier", 2]]);
const WORK_KINDS = new Set([
  "source_discovery",
  "evidence_extraction",
  "test_execution",
  "log_condensation",
  "bounded_implementation",
  "routine_review",
  "cross_source_synthesis",
  "architecture",
  "high_risk_implementation"
]);
const WORK_KIND_DEFAULTS = new Map([
  ["source_discovery", "economy"],
  ["evidence_extraction", "economy"],
  ["test_execution", "economy"],
  ["log_condensation", "economy"],
  ["bounded_implementation", "balanced"],
  ["routine_review", "balanced"],
  ["cross_source_synthesis", "frontier"],
  ["architecture", "frontier"],
  ["high_risk_implementation", "frontier"]
]);
const RISK_FLOORS = new Map([
  ["low", "economy"],
  ["medium", "economy"],
  ["high", "balanced"],
  ["critical", "frontier"]
]);
const SELECTION_MODES = new Set(["per-invocation", "named-profile", "inherit"]);
const RECEIPT_SOURCES = new Set(["session-metadata", "runtime-probe"]);
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
  "work_kind",
  "compute_class",
  "escalation_class",
  "task_risk",
  "budget",
  "output_schema"
];
const ROUTING_KEYS = ["schema_version", "harness", "profiles"];
const ROUTING_PROFILE_KEYS = ["model", "reasoning_effort", "selection_mode"];
const RECEIPT_KEYS = [
  "schema_version",
  "launch_id",
  "harness",
  "actual_model",
  "actual_reasoning_effort",
  "source",
  "observed_at"
];
const LAUNCH_PLAN_KEYS = [
  "schema_version",
  "harness",
  "compute_class",
  "model",
  "reasoning_effort",
  "selection_mode",
  "escalation_class",
  "selection_rationale",
  "attestation_required",
  "launch_id"
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

function assertAllowedKeys(value, keys, label) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}: unsupported key ${key}`);
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
  assertAllowedKeys(value, REQUIRED_PACKET_KEYS, "capability packet");

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
  if (!WORK_KINDS.has(value.work_kind)) throw new Error("capability packet: work_kind is invalid");
  if (!COMPUTE_CLASSES.has(value.compute_class)) {
    throw new Error("capability packet: compute_class is invalid");
  }
  if (value.escalation_class !== null && !ROUTABLE_COMPUTE_CLASSES.includes(value.escalation_class)) {
    throw new Error("capability packet: escalation_class is invalid");
  }
  if (!RISKS.has(value.task_risk)) throw new Error("capability packet: task_risk is invalid");
  assertObject(value.budget, "capability packet: budget");
  assertRequiredKeys(value.budget, ["max_workers", "max_rounds"], "capability packet: budget");
  for (const key of ["max_workers", "max_rounds"]) {
    if (!Number.isInteger(value.budget[key]) || value.budget[key] < 1) {
      throw new Error(`capability packet: budget.${key} must be an integer >= 1`);
    }
  }
  const selected = selectComputeClass(value).selected;
  if (selected === "inherit" && value.escalation_class !== null) {
    throw new Error("capability packet: escalation_class must be null when compute_class is inherit");
  }
  if (
    value.escalation_class !== null
    && selected !== "inherit"
    && COMPUTE_RANK.get(value.escalation_class) <= COMPUTE_RANK.get(selected)
  ) {
    throw new Error("capability packet: escalation_class must be stronger than the selected compute class");
  }
  return value;
}

export function selectComputeClass(packet) {
  const requested = packet.compute_class;
  if (requested === "inherit") {
    return { requested, selected: "inherit", rationale: "packet explicitly requested parent runtime inheritance" };
  }

  let selected = requested === "auto" ? WORK_KIND_DEFAULTS.get(packet.work_kind) : requested;
  const riskFloor = RISK_FLOORS.get(packet.task_risk);
  const reasons = [
    requested === "auto"
      ? `${packet.work_kind} defaults to ${selected}`
      : `packet explicitly requested ${selected}`
  ];
  if (COMPUTE_RANK.get(riskFloor) > COMPUTE_RANK.get(selected)) {
    selected = riskFloor;
    reasons.push(`${packet.task_risk} risk raises the floor to ${riskFloor}`);
  }
  return { requested, selected, rationale: reasons.join("; ") };
}

export function validateModelRouting(value) {
  assertObject(value, "model routing");
  assertRequiredKeys(value, ROUTING_KEYS, "model routing");
  assertAllowedKeys(value, ROUTING_KEYS, "model routing");
  if (value.schema_version !== 1) throw new Error("model routing: schema_version must be 1");
  if (typeof value.harness !== "string" || value.harness.trim() === "") {
    throw new Error("model routing: harness must be a non-empty string");
  }
  assertObject(value.profiles, "model routing: profiles");
  assertRequiredKeys(value.profiles, ROUTABLE_COMPUTE_CLASSES, "model routing: profiles");
  assertAllowedKeys(value.profiles, ROUTABLE_COMPUTE_CLASSES, "model routing: profiles");
  for (const computeClass of ROUTABLE_COMPUTE_CLASSES) {
    const profile = value.profiles[computeClass];
    assertObject(profile, `model routing: profiles.${computeClass}`);
    assertRequiredKeys(profile, ROUTING_PROFILE_KEYS, `model routing: profiles.${computeClass}`);
    assertAllowedKeys(profile, ROUTING_PROFILE_KEYS, `model routing: profiles.${computeClass}`);
    if (typeof profile.model !== "string" || profile.model.trim() === "") {
      throw new Error(`model routing: profiles.${computeClass}.model must be a non-empty string`);
    }
    if (profile.reasoning_effort !== "inherit" && !EFFORTS.has(profile.reasoning_effort)) {
      throw new Error(`model routing: profiles.${computeClass}.reasoning_effort is invalid`);
    }
    if (!SELECTION_MODES.has(profile.selection_mode)) {
      throw new Error(`model routing: profiles.${computeClass}.selection_mode is invalid`);
    }
    if (profile.selection_mode === "inherit" && (profile.model !== "inherit" || profile.reasoning_effort !== "inherit")) {
      throw new Error(`model routing: profiles.${computeClass} inherit mode must inherit model and effort`);
    }
  }
  return value;
}

export function loadModelRouting({ routingPath, harness } = {}) {
  if (!routingPath) throw new Error("routingPath is required");
  const routing = validateModelRouting(readJson(routingPath));
  if (harness && routing.harness !== harness) {
    throw new Error(`model routing harness ${routing.harness} does not match ${harness}`);
  }
  return routing;
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

function launchIdFor(plan) {
  return crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

export function resolveLaunchPlan({ capabilities, packet, routing } = {}) {
  validateHostCapabilities(capabilities);
  validateCapabilityPacket(packet);
  validateModelRouting(routing);
  const reasons = [];

  if (routing.harness !== capabilities.harness) reasons.push("routing_harness_mismatch");

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
  const selection = selectComputeClass(packet);
  const profile = selection.selected === "inherit"
    ? { model: "inherit", reasoning_effort: "inherit", selection_mode: "inherit" }
    : routing.profiles[selection.selected];
  const resolvedModel = profile.model === "inherit" ? capabilities.model : profile.model;
  const resolvedEffort = profile.reasoning_effort === "inherit"
    ? capabilities.reasoning_effort
    : profile.reasoning_effort;
  if (selection.selected !== "inherit" && selection.selected !== "frontier" && profile.selection_mode === "inherit") {
    reasons.push("compute_class_unavailable");
  }
  if (resolvedModel === null) reasons.push("runtime_model_unknown");
  if (resolvedEffort === null) reasons.push("runtime_effort_unknown");
  if (profile.model !== "inherit" && profile.model !== capabilities.model && !capabilities.model_override) {
    reasons.push("model_override_unavailable");
  }
  if (
    profile.reasoning_effort !== "inherit"
    && profile.reasoning_effort !== capabilities.reasoning_effort
    && !capabilities.effort_override
  ) reasons.push("effort_override_unavailable");
  if (
    packet.task_risk === "low"
    && selection.selected === "economy"
    && ["xhigh", "max"].includes(capabilities.reasoning_effort)
    && (profile.reasoning_effort === "inherit" || !capabilities.effort_override)
  ) {
    reasons.push("disproportionate_inherited_effort");
  }

  if (reasons.length > 0) {
    return { allowed: false, topology: "single-root", reasons: [...new Set(reasons)], launch_plan: null };
  }
  const unsignedPlan = {
    schema_version: 1,
    harness: capabilities.harness,
    compute_class: selection.selected,
    model: resolvedModel,
    reasoning_effort: resolvedEffort,
    selection_mode: profile.selection_mode,
    escalation_class: packet.escalation_class,
    selection_rationale: selection.rationale,
    attestation_required: true
  };
  return {
    allowed: true,
    topology: "bounded-worker",
    reasons: [],
    launch_plan: { ...unsignedPlan, launch_id: launchIdFor(unsignedPlan) }
  };
}

export function decideDelegation(input = {}) {
  return resolveLaunchPlan(input);
}

export function validateExecutionReceipt(value) {
  assertObject(value, "execution receipt");
  assertRequiredKeys(value, RECEIPT_KEYS, "execution receipt");
  assertAllowedKeys(value, RECEIPT_KEYS, "execution receipt");
  if (value.schema_version !== 1) throw new Error("execution receipt: schema_version must be 1");
  if (typeof value.launch_id !== "string" || !/^[a-f0-9]{64}$/.test(value.launch_id)) {
    throw new Error("execution receipt: launch_id must be a SHA-256 hex string");
  }
  for (const key of ["harness", "actual_model"]) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error(`execution receipt: ${key} must be a non-empty string`);
    }
  }
  if (!EFFORTS.has(value.actual_reasoning_effort)) {
    throw new Error("execution receipt: actual_reasoning_effort is invalid");
  }
  if (!RECEIPT_SOURCES.has(value.source)) throw new Error("execution receipt: source is invalid");
  parseTimestamp(value.observed_at, "execution receipt: observed_at");
  return value;
}

export function validateLaunchPlan(value) {
  assertObject(value, "launch plan");
  assertRequiredKeys(value, LAUNCH_PLAN_KEYS, "launch plan");
  assertAllowedKeys(value, LAUNCH_PLAN_KEYS, "launch plan");
  if (value.schema_version !== 1) throw new Error("launch plan: schema_version must be 1");
  for (const key of ["harness", "model", "selection_rationale"]) {
    if (typeof value[key] !== "string" || value[key].trim() === "") {
      throw new Error(`launch plan: ${key} must be a non-empty string`);
    }
  }
  if (![...ROUTABLE_COMPUTE_CLASSES, "inherit"].includes(value.compute_class)) {
    throw new Error("launch plan: compute_class is invalid");
  }
  if (!EFFORTS.has(value.reasoning_effort)) throw new Error("launch plan: reasoning_effort is invalid");
  if (!SELECTION_MODES.has(value.selection_mode)) throw new Error("launch plan: selection_mode is invalid");
  if (value.escalation_class !== null && !ROUTABLE_COMPUTE_CLASSES.includes(value.escalation_class)) {
    throw new Error("launch plan: escalation_class is invalid");
  }
  if (value.attestation_required !== true) throw new Error("launch plan: attestation_required must be true");
  const { launch_id: launchId, ...unsignedPlan } = value;
  if (typeof launchId !== "string" || launchIdFor(unsignedPlan) !== launchId) {
    throw new Error("launch plan: launch_id does not match plan contents");
  }
  return value;
}

export function verifyExecutionReceipt({ launchPlan, receipt } = {}) {
  validateLaunchPlan(launchPlan);
  validateExecutionReceipt(receipt);
  const reasons = [];
  if (receipt.launch_id !== launchPlan.launch_id) reasons.push("launch_id_mismatch");
  if (receipt.harness !== launchPlan.harness) reasons.push("harness_mismatch");
  if (receipt.actual_model !== launchPlan.model) reasons.push("actual_model_mismatch");
  if (receipt.actual_reasoning_effort !== launchPlan.reasoning_effort) {
    reasons.push("actual_reasoning_effort_mismatch");
  }
  return { verified: reasons.length === 0, reasons };
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
  const routingPath = path.resolve(cwd, "adapters", `${options.harness}.models.json`);
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
    const routing = loadModelRouting({ routingPath, harness: options.harness });
    output.delegation = decideDelegation({ capabilities, packet, routing });
  }
  return output;
}

export function runAttestCommand(argv, { cwd = process.cwd() } = {}) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--launch-plan-json") options.launchPlanJson = argv[++index];
    else if (token === "--receipt-json") options.receiptJson = argv[++index];
    else throw new Error(`unknown attest option: ${token}`);
  }
  if (!options.launchPlanJson) throw new Error("--launch-plan-json is required");
  if (!options.receiptJson) throw new Error("--receipt-json is required");
  const launchPlan = readJson(path.resolve(cwd, options.launchPlanJson));
  const receipt = readJson(path.resolve(cwd, options.receiptJson));
  return verifyExecutionReceipt({ launchPlan, receipt });
}
