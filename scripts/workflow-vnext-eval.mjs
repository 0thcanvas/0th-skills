import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CONDITIONS = ["formal-plan", "adaptive-state", "direct"];
const TASKS = ["one-file-feature", "ordered-multi-file", "root-cause-debug"];
const RECOVERY_CONDITIONS = ["checkpoint", "summary"];
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
}

export function canonicalHash(value) {
  const source = typeof value === "string" || Buffer.isBuffer(value)
    ? value
    : JSON.stringify(stableValue(value));
  return crypto.createHash("sha256").update(source).digest("hex");
}

function assertExactArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match the frozen protocol`);
  }
}

export function loadProtocol(protocolPath) {
  const protocol = JSON.parse(fs.readFileSync(protocolPath, "utf8"));
  if (protocol.schema_version !== 1) throw new Error("protocol schema_version must be 1");
  assertExactArray(protocol.coding?.tasks, TASKS, "coding.tasks");
  assertExactArray(protocol.coding?.conditions, CONDITIONS, "coding.conditions");
  if (protocol.coding?.repetitions !== 2) throw new Error("coding.repetitions must be 2");
  if (!Array.isArray(protocol.coding.schedule) || protocol.coding.schedule.length !== 6) {
    throw new Error("coding.schedule must contain six frozen rows");
  }
  for (const [index, row] of protocol.coding.schedule.entries()) {
    if (row.length !== 3 || new Set(row).size !== 3 || row.some((item) => !CONDITIONS.includes(item))) {
      throw new Error(`coding.schedule row ${index + 1} must contain every condition exactly once`);
    }
  }
  assertExactArray(protocol.recovery?.conditions, RECOVERY_CONDITIONS, "recovery.conditions");
  if (protocol.recovery?.repetitions !== 2) throw new Error("recovery.repetitions must be 2");
  if (!Array.isArray(protocol.recovery.schedule) || protocol.recovery.schedule.length !== 2) {
    throw new Error("recovery.schedule must contain two frozen rows");
  }
  for (const [index, row] of protocol.recovery.schedule.entries()) {
    if (row.length !== 2
        || new Set(row).size !== 2
        || row.some((item) => !RECOVERY_CONDITIONS.includes(item))) {
      throw new Error(`recovery.schedule row ${index + 1} must contain every condition exactly once`);
    }
  }
  if (protocol.orchestration?.parent_id !== "orchestration-1") {
    throw new Error("orchestration.parent_id must match the frozen parent");
  }
  assertExactArray(
    protocol.orchestration?.workers,
    ["worker-release", "worker-guide", "worker-runtime"],
    "orchestration.workers"
  );
  if (protocol.orchestration?.synthesizer !== "synth") {
    throw new Error("orchestration.synthesizer must be synth");
  }
  assertExactArray(protocol.portability?.harnesses, ["codex", "claude"], "portability.harnesses");
  if (protocol.portability?.claude_version !== "2.1.139"
      || protocol.portability?.claude_model !== "opus"
      || protocol.portability?.claude_effort !== "low") {
    throw new Error("Claude portability runtime does not match the frozen profile");
  }
  if (protocol.runtime?.harness !== "codex"
      || protocol.runtime?.model !== "gpt-5.6-sol"
      || protocol.runtime?.reasoning_effort !== "low") {
    throw new Error("runtime identity does not match the frozen pilot profile");
  }
  return protocol;
}

export function buildCodingRuns(protocol) {
  const runs = [];
  let scheduleIndex = 0;
  for (const task of protocol.coding.tasks) {
    for (let repetition = 1; repetition <= protocol.coding.repetitions; repetition += 1) {
      const order = protocol.coding.schedule[scheduleIndex];
      scheduleIndex += 1;
      for (let position = 0; position < order.length; position += 1) {
        const condition = order[position];
        runs.push({
          id: `${task}-r${repetition}-${condition}`,
          task,
          repetition,
          condition,
          order_position: position + 1
        });
      }
    }
  }
  return runs;
}

export function buildRecoveryRuns(protocol) {
  const runs = [];
  for (let repetition = 1; repetition <= protocol.recovery.repetitions; repetition += 1) {
    const order = protocol.recovery.schedule[repetition - 1];
    for (let position = 0; position < order.length; position += 1) {
      const condition = order[position];
      runs.push({
        id: `recovery-r${repetition}-${condition}`,
        repetition,
        condition,
        order_position: position + 1
      });
    }
  }
  return runs;
}

function readRequired(filePath) {
  const source = fs.readFileSync(filePath, "utf8").trim();
  if (!source) throw new Error(`required fixture file is empty: ${filePath}`);
  return source;
}

export function buildWorkerPrompt({ fixtureRoot, protocol, task, condition }) {
  if (!protocol.coding.tasks.includes(task)) throw new Error(`unknown task: ${task}`);
  if (!protocol.coding.conditions.includes(condition)) throw new Error(`unknown condition: ${condition}`);
  const common = readRequired(path.join(fixtureRoot, "prompts", "common.md"));
  const taskPrompt = readRequired(path.join(fixtureRoot, "tasks", task, "task.md"));
  const policy = readRequired(path.join(fixtureRoot, "policies", `${condition}.md`));
  const finalResponse = readRequired(path.join(fixtureRoot, "prompts", "final-response.md"));
  return [
    "<common_contract>",
    common,
    "</common_contract>",
    "",
    "<task>",
    taskPrompt,
    "</task>",
    "",
    "<condition_policy>",
    policy,
    "</condition_policy>",
    "",
    "<final_response>",
    finalResponse,
    "</final_response>",
    ""
  ].join("\n");
}

export function buildRecoveryPrompt({ fixtureRoot, protocol, condition }) {
  if (!protocol.recovery.conditions.includes(condition)) {
    throw new Error(`unknown recovery condition: ${condition}`);
  }
  const contract = readRequired(path.join(fixtureRoot, "recovery", "prompt.md"));
  const artifact = readRequired(
    path.join(fixtureRoot, "recovery", "artifacts", `${condition}.md`)
  );
  return [
    "<recovery_contract>",
    contract,
    "</recovery_contract>",
    "",
    `<handoff_artifact condition="${condition}">`,
    artifact,
    "</handoff_artifact>",
    ""
  ].join("\n");
}

export function buildOrchestrationWorkerPrompt({ fixtureRoot, protocol, workerId }) {
  if (!protocol.orchestration.workers.includes(workerId)) {
    throw new Error(`unknown orchestration worker: ${workerId}`);
  }
  const contract = readRequired(path.join(fixtureRoot, "orchestration", "worker-prompt.md"));
  const source = readRequired(
    path.join(fixtureRoot, "orchestration", "sources", `${workerId}.md`)
  );
  return [
    "<worker_contract>",
    contract,
    "</worker_contract>",
    "",
    `<source_bucket worker="${workerId}">`,
    source,
    "</source_bucket>",
    ""
  ].join("\n");
}

export function buildSynthesisPrompt({ fixtureRoot, protocol, workerOutputs }) {
  const expectedWorkers = protocol.orchestration.workers;
  assertExactArray(
    Object.keys(workerOutputs).sort(),
    [...expectedWorkers].sort(),
    "synthesis worker output ids"
  );
  const contract = readRequired(path.join(fixtureRoot, "orchestration", "synthesis-prompt.md"));
  return [
    "<synthesis_contract>",
    contract,
    "</synthesis_contract>",
    "",
    "<worker_outputs>",
    JSON.stringify(stableValue(workerOutputs), null, 2),
    "</worker_outputs>",
    ""
  ].join("\n");
}

export function buildPortabilityPrompt({ fixtureRoot, protocol }) {
  if (JSON.stringify(protocol.portability.harnesses) !== JSON.stringify(["codex", "claude"])) {
    throw new Error("portable prompt requires the frozen Codex and Claude harnesses");
  }
  const packetObject = JSON.parse(
    readRequired(path.join(fixtureRoot, "portability", "packet.json"))
  );
  const packet = JSON.stringify(stableValue(packetObject));
  const packetHash = canonicalHash(packet);
  const contract = readRequired(path.join(fixtureRoot, "portability", "prompt.md"));
  return {
    packet,
    packet_hash: packetHash,
    prompt: [
      "<portability_contract>",
      contract,
      "</portability_contract>",
      "",
      `<canonical_packet sha256="${packetHash}">`,
      packet,
      "</canonical_packet>",
      ""
    ].join("\n")
  };
}

export function scorePortabilityOutput({ expected, packetHash, output }) {
  const failures = [];
  if (output?.packet_hash !== packetHash) failures.push("packet_hash");
  for (const field of ["record_ids", "open_loop_ids"]) {
    if (JSON.stringify(output?.[field] ?? []) !== JSON.stringify(expected[field] ?? [])) {
      failures.push(field);
    }
  }
  if (output?.decision !== expected.decision) failures.push("decision");
  return {
    outcome: failures.length === 0 ? "PASS" : "FAIL",
    failures
  };
}

function filesUnder(root) {
  const output = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile()) output.push(filePath);
    }
  }
  visit(root);
  return output;
}

function directoryHash(root) {
  const parts = filesUnder(root).map((filePath) => ({
    path: path.relative(root, filePath),
    hash: canonicalHash(fs.readFileSync(filePath))
  }));
  return canonicalHash(parts);
}

export function taskFixtureHash({ fixtureRoot, task }) {
  const source = path.join(fixtureRoot, "tasks", task, "workspace");
  if (!fs.existsSync(source)) throw new Error(`task workspace does not exist: ${task}`);
  return directoryHash(source);
}

export function materializeTask({ fixtureRoot, task, targetDir }) {
  const source = path.join(fixtureRoot, "tasks", task, "workspace");
  if (!fs.existsSync(source)) throw new Error(`task workspace does not exist: ${task}`);
  if (fs.existsSync(targetDir)) throw new Error(`target already exists: ${targetDir}`);
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(source, targetDir, { recursive: true, errorOnExist: true });
  return {
    task,
    workspace: path.resolve(targetDir),
    fixture_hash: taskFixtureHash({ fixtureRoot, task })
  };
}

function tokenCount(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
  const output = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  return input + output;
}

export function scoreCodingRun({ condition, run }) {
  const failures = [];
  const receipt = run.receipt ?? {};
  if (receipt.harness !== "codex"
      || receipt.actual_model !== "gpt-5.6-sol"
      || receipt.actual_reasoning_effort !== "low"
      || typeof receipt.thread_id !== "string"
      || !receipt.thread_id) {
    return {
      outcome: "INVALID_RUNTIME",
      failures: ["runtime_identity_mismatch"],
      tokens: tokenCount(run.usage),
      duration_ms: run.duration_ms ?? null
    };
  }
  if (run.test_exit_code !== 0) failures.push("test_oracle_failed");
  if (run.invariant_exit_code !== 0) failures.push("invariant_oracle_failed");
  if ((run.protected_files_changed ?? []).length > 0) failures.push("protected_fixture_changed");
  const changed = new Set(run.changed_paths ?? []);
  const evalArtifacts = [...changed].filter((item) => item.startsWith(".eval/"));
  if (condition === "formal-plan") {
    if (!changed.has(".eval/plan.md")) failures.push("formal_plan_artifact_missing");
    if (changed.has(".eval/state.json")) failures.push("unexpected_adaptive_state");
  } else if (condition === "adaptive-state") {
    if (!changed.has(".eval/state.json")) failures.push("adaptive_state_artifact_missing");
    if (changed.has(".eval/plan.md")) failures.push("unexpected_formal_plan");
  } else if (condition === "direct") {
    if (evalArtifacts.length > 0) failures.push("direct_condition_created_coordination_artifact");
  } else {
    failures.push("unknown_condition");
  }
  return {
    outcome: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    tokens: tokenCount(run.usage),
    duration_ms: run.duration_ms ?? null,
    artifact_count: evalArtifacts.length
  };
}

const RECOVERY_FIELDS = [
  "claim_ids",
  "source_ids",
  "caveat_ids",
  "contradiction_ids",
  "unresolved_gap_ids",
  "next_read_ids"
];

export function scoreRecovery({ expected, output }) {
  const missing = [];
  const unexpected = [];
  for (const field of RECOVERY_FIELDS) {
    const expectedValues = new Set(expected[field] ?? []);
    const outputValues = new Set(output[field] ?? []);
    for (const value of expectedValues) {
      if (!outputValues.has(value)) missing.push(`${field}:${value}`);
    }
    for (const value of outputValues) {
      if (!expectedValues.has(value)) unexpected.push(`${field}:${value}`);
    }
  }
  return {
    outcome: missing.length === 0 && unexpected.length === 0 ? "PASS" : "FAIL",
    missing,
    unexpected
  };
}

const RECEIPT_KEYS = [
  "schema_version",
  "run_id",
  "parent_id",
  "condition",
  "input_hash",
  "output_hash",
  "launch_id",
  "harness",
  "model",
  "reasoning_effort",
  "adapter",
  "runtime_version",
  "started_at",
  "completed_at",
  "attested"
];

export function validateExperimentReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new Error("experiment receipt must be an object");
  }
  for (const key of RECEIPT_KEYS) {
    if (!Object.hasOwn(receipt, key)) throw new Error(`experiment receipt missing ${key}`);
  }
  for (const key of ["input_hash", "output_hash", "launch_id"]) {
    if (!HASH_PATTERN.test(receipt[key])) throw new Error(`${key} must be a SHA-256 hash`);
  }
  for (const key of [
    "run_id", "parent_id", "condition", "harness", "model", "reasoning_effort",
    "adapter", "runtime_version"
  ]) {
    if (typeof receipt[key] !== "string" || !receipt[key]) throw new Error(`${key} must be non-empty`);
  }
  for (const key of ["started_at", "completed_at"]) {
    if (!Number.isFinite(Date.parse(receipt[key]))) throw new Error(`${key} must be an ISO date-time`);
  }
  if (receipt.schema_version !== 1) throw new Error("schema_version must be 1");
  if (receipt.attested !== true) throw new Error("attested must be true");
  return receipt;
}

export function buildExperimentReceipt({
  runId,
  parentId,
  condition,
  input,
  output,
  executionReceipt,
  startedAt,
  completedAt,
  attested
}) {
  return validateExperimentReceipt({
    schema_version: 1,
    run_id: runId,
    parent_id: parentId,
    condition,
    input_hash: canonicalHash(input),
    output_hash: canonicalHash(output),
    launch_id: executionReceipt?.launch_id,
    harness: executionReceipt?.harness,
    model: executionReceipt?.actual_model,
    reasoning_effort: executionReceipt?.actual_reasoning_effort,
    adapter: executionReceipt?.adapter,
    runtime_version: executionReceipt?.runtime_version,
    started_at: startedAt,
    completed_at: completedAt,
    attested
  });
}

export function scoreOrchestration({
  expected,
  receipts,
  output,
  inputsByRunId = {},
  outputsByRunId = {}
}) {
  const failures = [];
  if (!Array.isArray(receipts) || receipts.length !== 4) failures.push("receipt_count");
  for (const receipt of receipts ?? []) {
    try {
      validateExperimentReceipt(receipt);
    } catch (error) {
      failures.push(`receipt:${error.message}`);
    }
  }
  const runIds = (receipts ?? []).map((receipt) => receipt.run_id);
  if (new Set(runIds).size !== runIds.length) failures.push("duplicate_run_id");
  if (expected.receipt_run_ids
      && JSON.stringify([...runIds].sort()) !== JSON.stringify([...expected.receipt_run_ids].sort())) {
    failures.push("receipt_run_ids");
  }
  for (const receipt of receipts ?? []) {
    if (expected.parent_id && receipt.parent_id !== expected.parent_id) {
      failures.push(`parent_id:${receipt.run_id}`);
    }
    if (!Object.hasOwn(inputsByRunId, receipt.run_id)) {
      failures.push(`input_binding_missing:${receipt.run_id}`);
    } else if (canonicalHash(inputsByRunId[receipt.run_id]) !== receipt.input_hash) {
      failures.push(`input_hash:${receipt.run_id}`);
    }
    if (!Object.hasOwn(outputsByRunId, receipt.run_id)) {
      failures.push(`output_binding_missing:${receipt.run_id}`);
    } else if (canonicalHash(outputsByRunId[receipt.run_id]) !== receipt.output_hash) {
      failures.push(`output_hash:${receipt.run_id}`);
    }
  }
  if (expected.receipt_run_ids?.includes("synth")
      && canonicalHash(outputsByRunId.synth) !== canonicalHash(output)) {
    failures.push("synth_output_binding");
  }
  const recovery = scoreRecovery({
    expected: {
      claim_ids: [],
      source_ids: expected.source_ids,
      caveat_ids: [],
      contradiction_ids: expected.contradiction_ids,
      unresolved_gap_ids: [],
      next_read_ids: []
    },
    output: {
      claim_ids: [],
      source_ids: output.source_ids ?? [],
      caveat_ids: [],
      contradiction_ids: output.contradiction_ids ?? [],
      unresolved_gap_ids: [],
      next_read_ids: []
    }
  });
  failures.push(...recovery.missing, ...recovery.unexpected);
  return {
    outcome: failures.length === 0 ? "PASS" : "FAIL",
    failures: [...new Set(failures)]
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return Infinity;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function allPass(results) {
  return Array.isArray(results) && results.length > 0 && results.every((result) => result.outcome === "PASS");
}

export function decidePilot(report) {
  if ((report.integrity_failures ?? []).length > 0) {
    return {
      bounded_candidate: "retain-formal-plan",
      ordered_debug_candidate: "retain-formal-plan",
      structured_handoff: "not-established",
      multi_agent: "single-root",
      portability: "not-established",
      production_default: "not-authorized",
      next: "repair-evaluation-integrity"
    };
  }
  const bounded = report.coding["one-file-feature"];
  const directBounded = allPass(bounded.direct)
    && bounded.direct.length === 2
    && median(bounded.direct.map((entry) => entry.tokens))
      < median(bounded["formal-plan"].map((entry) => entry.tokens));
  const complexAdaptive = ["ordered-multi-file", "root-cause-debug"].every((task) => {
    const results = report.coding[task];
    return allPass(results["adaptive-state"])
      && results["adaptive-state"].length === 2
      && results["adaptive-state"].filter((entry) => entry.outcome === "PASS").length
        >= results["formal-plan"].filter((entry) => entry.outcome === "PASS").length
      && median(results["adaptive-state"].map((entry) => entry.tokens))
        <= median(results["formal-plan"].map((entry) => entry.tokens));
  });
  const checkpointPass = allPass(report.recovery.checkpoint)
    && report.recovery.checkpoint.length === 2;
  const summaryLost = report.recovery.summary.some((result) => result.outcome !== "PASS");
  const portabilityPass = report.portability.codex === "PASS"
    && report.portability.claude === "PASS"
    && report.portability.same_packet_hash === true;
  return {
    bounded_candidate: directBounded ? "direct" : "retain-formal-plan",
    ordered_debug_candidate: complexAdaptive ? "adaptive-state" : "retain-formal-plan",
    structured_handoff: checkpointPass && summaryLost ? "adopt" : "not-established",
    multi_agent: report.orchestration.outcome === "PASS" ? "supported" : "single-root",
    portability: portabilityPass ? "contract-supported" : "not-established",
    production_default: "not-authorized",
    next: "implement-smallest-vnext-slice"
  };
}
