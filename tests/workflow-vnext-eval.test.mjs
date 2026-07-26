import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCodingRuns,
  buildExperimentReceipt,
  buildOrchestrationWorkerPrompt,
  buildPortabilityPrompt,
  buildRecoveryPrompt,
  buildRecoveryRuns,
  buildSynthesisPrompt,
  buildWorkerPrompt,
  canonicalHash,
  decidePilot,
  loadProtocol,
  materializeTask,
  scoreCodingRun,
  scoreOrchestration,
  scorePortabilityOutput,
  scoreRecovery,
  taskFixtureHash,
  validateExperimentReceipt
} from "../scripts/workflow-vnext-eval.mjs";
import {
  archiveWorkspace,
  prepareRunDirectory
} from "../scripts/workflow-vnext-live.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const fixtureRoot = path.join(repoRoot, "tests", "fixtures", "workflow-vnext");
const protocolPath = path.join(fixtureRoot, "protocol.json");

test("live runner creates an evidence run directory independently from the worker workspace", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-vnext-run-dir-"));
  const runDir = path.join(root, "evidence", "runs", "coding", "run-1");
  const workspace = path.join(root, "separate-workspaces", "run-1");

  prepareRunDirectory({ runDir, workspace });

  assert.equal(fs.existsSync(runDir), true);
  assert.equal(fs.existsSync(workspace), false);
});

test("live runner archives the stable worker workspace between scored runs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-vnext-archive-"));
  const workspace = path.join(root, "current");
  const archiveRoot = path.join(root, "archive");
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, "marker.txt"), "run one\n");

  const archived = archiveWorkspace({
    workspace,
    archiveRoot,
    runId: "one-file-feature-r1-formal-plan"
  });

  assert.equal(archived, path.join(archiveRoot, "one-file-feature-r1-formal-plan"));
  assert.equal(fs.readFileSync(path.join(archived, "marker.txt"), "utf8"), "run one\n");
  assert.equal(fs.existsSync(workspace), false);
  assert.throws(
    () => archiveWorkspace({ workspace: archived, archiveRoot, runId: "one-file-feature-r1-formal-plan" }),
    /archive destination already exists/
  );
});

test("protocol freezes three tasks, three conditions, two repetitions, and the exact Latin schedule", () => {
  const protocol = loadProtocol(protocolPath);
  const runs = buildCodingRuns(protocol);

  assert.deepEqual(protocol.coding.tasks, [
    "one-file-feature",
    "ordered-multi-file",
    "root-cause-debug"
  ]);
  assert.deepEqual(protocol.coding.conditions, ["formal-plan", "adaptive-state", "direct"]);
  assert.equal(protocol.coding.repetitions, 2);
  assert.deepEqual(protocol.coding.schedule, [
    ["formal-plan", "adaptive-state", "direct"],
    ["direct", "adaptive-state", "formal-plan"],
    ["adaptive-state", "direct", "formal-plan"],
    ["formal-plan", "direct", "adaptive-state"],
    ["direct", "formal-plan", "adaptive-state"],
    ["adaptive-state", "formal-plan", "direct"]
  ]);
  assert.equal(runs.length, 18);
  assert.equal(new Set(runs.map((run) => run.id)).size, 18);
});

test("recovery protocol alternates checkpoint and summary over four fresh contexts", () => {
  const protocol = loadProtocol(protocolPath);
  const runs = buildRecoveryRuns(protocol);

  assert.deepEqual(runs, [
    { id: "recovery-r1-checkpoint", repetition: 1, condition: "checkpoint", order_position: 1 },
    { id: "recovery-r1-summary", repetition: 1, condition: "summary", order_position: 2 },
    { id: "recovery-r2-summary", repetition: 2, condition: "summary", order_position: 1 },
    { id: "recovery-r2-checkpoint", repetition: 2, condition: "checkpoint", order_position: 2 }
  ]);
});

test("recovery prompts share one contract and bind only the selected handoff artifact", () => {
  const protocol = loadProtocol(protocolPath);
  const checkpoint = buildRecoveryPrompt({ fixtureRoot, protocol, condition: "checkpoint" });
  const summary = buildRecoveryPrompt({ fixtureRoot, protocol, condition: "summary" });

  assert.match(checkpoint, /claim-current/);
  assert.match(checkpoint, /source-authoritative/);
  assert.doesNotMatch(summary, /claim-current/);
  assert.doesNotMatch(summary, /source-authoritative/);
  assert.match(checkpoint, /Do not invent identifiers/);
  assert.match(summary, /Do not invent identifiers/);
  assert.notEqual(canonicalHash(checkpoint), canonicalHash(summary));
});

test("condition prompts share one common task body and differ only in the frozen policy block", () => {
  const protocol = loadProtocol(protocolPath);
  const task = protocol.coding.tasks[0];
  const prompts = protocol.coding.conditions.map((condition) =>
    buildWorkerPrompt({ fixtureRoot, protocol, task, condition })
  );

  for (const prompt of prompts) {
    assert.match(prompt, /COMMON TASK CONTRACT/);
    assert.match(prompt, /CONDITION POLICY/);
    assert.match(prompt, /FINAL RESPONSE/);
  }
  const commonParts = prompts.map((prompt) =>
    prompt.replace(/<condition_policy>[\s\S]*?<\/condition_policy>/, "<condition_policy />")
  );
  assert.equal(new Set(commonParts).size, 1);
  assert.equal(new Set(prompts.map(canonicalHash)).size, 3);
});

test("task materialization is isolated and bound to an immutable source hash", () => {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-vnext-materialize-"));
  const first = materializeTask({
    fixtureRoot,
    task: "one-file-feature",
    targetDir: path.join(targetRoot, "first")
  });
  const second = materializeTask({
    fixtureRoot,
    task: "one-file-feature",
    targetDir: path.join(targetRoot, "second")
  });

  assert.equal(first.fixture_hash, second.fixture_hash);
  assert.notEqual(first.workspace, second.workspace);
  fs.writeFileSync(path.join(first.workspace, "worker-only.txt"), "changed\n");
  assert.equal(fs.existsSync(path.join(second.workspace, "worker-only.txt")), false);
});

test("coding score fails closed on runtime mismatch and recognizes condition artifacts", () => {
  const base = {
    test_exit_code: 0,
    invariant_exit_code: 0,
    receipt: {
      actual_model: "gpt-5.6-sol",
      actual_reasoning_effort: "low",
      harness: "codex",
      thread_id: "thread-1"
    },
    changed_paths: ["src/normalize-tag.mjs", ".eval/plan.md"],
    protected_files_changed: [],
    usage: { input_tokens: 100, output_tokens: 50 },
    duration_ms: 1000
  };

  assert.equal(scoreCodingRun({ condition: "formal-plan", run: base }).outcome, "PASS");
  assert.equal(
    scoreCodingRun({
      condition: "formal-plan",
      run: { ...base, receipt: { ...base.receipt, actual_reasoning_effort: "medium" } }
    }).outcome,
    "INVALID_RUNTIME"
  );
  assert.equal(
    scoreCodingRun({
      condition: "direct",
      run: { ...base, changed_paths: ["src/normalize-tag.mjs", ".eval/plan.md"] }
    }).outcome,
    "FAIL"
  );
  assert.equal(
    scoreCodingRun({
      condition: "formal-plan",
      run: { ...base, protected_files_changed: ["tests/normalize-tag.test.mjs"] }
    }).outcome,
    "FAIL"
  );
});

test("recovery score mechanically requires claims, sources, caveats, contradictions, gaps, and next reads", () => {
  const expected = {
    claim_ids: ["claim-current", "claim-superseded"],
    source_ids: ["source-authoritative", "source-old"],
    caveat_ids: ["caveat-scope"],
    contradiction_ids: ["conflict-version"],
    unresolved_gap_ids: ["gap-runtime"],
    next_read_ids: ["read-release-record"]
  };
  assert.equal(scoreRecovery({ expected, output: expected }).outcome, "PASS");
  assert.deepEqual(
    scoreRecovery({
      expected,
      output: { ...expected, contradiction_ids: [] }
    }).missing,
    ["contradiction_ids:conflict-version"]
  );
});

test("experiment receipts bind parent, input, output, runtime, and attestation", () => {
  const receipt = {
    schema_version: 1,
    run_id: "worker-a",
    parent_id: "orchestration-1",
    condition: "fanout",
    input_hash: "a".repeat(64),
    output_hash: "b".repeat(64),
    launch_id: "c".repeat(64),
    harness: "codex",
    model: "gpt-5.6-sol",
    reasoning_effort: "low",
    adapter: "codex-exec",
    runtime_version: "codex-cli test",
    started_at: "2026-07-26T00:00:00.000Z",
    completed_at: "2026-07-26T00:01:00.000Z",
    attested: true
  };

  assert.equal(validateExperimentReceipt(receipt), receipt);
  assert.throws(
    () => validateExperimentReceipt({ ...receipt, output_hash: "short" }),
    /output_hash/
  );
});

test("experiment receipt builder hashes the exact worker input and output", () => {
  const receipt = buildExperimentReceipt({
    runId: "worker-release",
    parentId: "orchestration-1",
    condition: "fanout",
    input: "worker prompt",
    output: { source_ids: ["source-release"] },
    executionReceipt: {
      launch_id: "c".repeat(64),
      harness: "codex",
      actual_model: "gpt-5.6-sol",
      actual_reasoning_effort: "low",
      adapter: "codex-exec",
      runtime_version: "codex-cli test"
    },
    startedAt: "2026-07-26T00:00:00.000Z",
    completedAt: "2026-07-26T00:01:00.000Z",
    attested: true
  });

  assert.equal(receipt.input_hash, canonicalHash("worker prompt"));
  assert.equal(receipt.output_hash, canonicalHash({ source_ids: ["source-release"] }));
  assert.equal(validateExperimentReceipt(receipt), receipt);
});

test("orchestration prompts isolate source buckets and synthesis sees only worker outputs", () => {
  const protocol = loadProtocol(protocolPath);
  const release = buildOrchestrationWorkerPrompt({
    fixtureRoot,
    protocol,
    workerId: "worker-release"
  });
  const guide = buildOrchestrationWorkerPrompt({
    fixtureRoot,
    protocol,
    workerId: "worker-guide"
  });
  const outputs = {
    "worker-release": { source_ids: ["source-release"] },
    "worker-guide": { source_ids: ["source-guide"] },
    "worker-runtime": { source_ids: ["source-runtime"] }
  };
  const synthesis = buildSynthesisPrompt({ fixtureRoot, protocol, workerOutputs: outputs });

  assert.match(release, /source-release/);
  assert.doesNotMatch(release, /source-guide/);
  assert.match(guide, /source-guide/);
  assert.doesNotMatch(guide, /source-release/);
  assert.match(synthesis, /source-release/);
  assert.match(synthesis, /source-guide/);
  assert.match(synthesis, /source-runtime/);
  assert.doesNotMatch(synthesis, /Current release record/);
});

test("orchestration fails when any receipt or contradiction is missing", () => {
  const expected = {
    parent_id: "orchestration-1",
    receipt_run_ids: ["worker-a", "worker-b", "worker-c", "synth"],
    source_ids: ["source-a", "source-b", "source-c"],
    contradiction_ids: ["conflict-release"]
  };
  const receipt = {
    schema_version: 1,
    run_id: "worker-a",
    parent_id: "orchestration-1",
    condition: "fanout",
    input_hash: "a".repeat(64),
    output_hash: "b".repeat(64),
    launch_id: "c".repeat(64),
    harness: "codex",
    model: "gpt-5.6-sol",
    reasoning_effort: "low",
    adapter: "codex-exec",
    runtime_version: "codex-cli test",
    started_at: "2026-07-26T00:00:00.000Z",
    completed_at: "2026-07-26T00:01:00.000Z",
    attested: true
  };
  const receipts = ["worker-a", "worker-b", "worker-c", "synth"].map((runId) => ({
    ...receipt,
    run_id: runId,
    output_hash: canonicalHash(runId)
  }));
  const output = {
    source_ids: expected.source_ids,
    contradiction_ids: expected.contradiction_ids
  };
  const inputsByRunId = Object.fromEntries(receipts.map((item) => [item.run_id, item.run_id]));
  const outputsByRunId = Object.fromEntries(receipts.map((item) => [
    item.run_id,
    item.run_id === "synth" ? output : { source_ids: [item.run_id] }
  ]));
  const boundReceipts = receipts.map((item) => ({
    ...item,
    input_hash: canonicalHash(inputsByRunId[item.run_id]),
    output_hash: canonicalHash(outputsByRunId[item.run_id])
  }));

  assert.equal(scoreOrchestration({
    expected,
    receipts: boundReceipts,
    output,
    inputsByRunId,
    outputsByRunId
  }).outcome, "PASS");
  assert.equal(
    scoreOrchestration({
      expected,
      receipts: boundReceipts.slice(0, 3),
      output,
      inputsByRunId,
      outputsByRunId
    }).outcome,
    "FAIL"
  );
  assert.equal(
    scoreOrchestration({
      expected,
      receipts: boundReceipts,
      output,
      inputsByRunId: { ...inputsByRunId, synth: "tampered prompt" },
      outputsByRunId
    }).outcome,
    "FAIL"
  );
});

test("portable packet prompt is canonical and scored by one exact oracle", () => {
  const protocol = loadProtocol(protocolPath);
  const built = buildPortabilityPrompt({ fixtureRoot, protocol });
  const packet = JSON.parse(built.packet);
  const output = {
    packet_hash: built.packet_hash,
    record_ids: packet.records.map((record) => record.id),
    open_loop_ids: packet.open_loops.map((item) => item.id),
    decision: "retain-neutral-contract"
  };

  assert.equal(canonicalHash(built.packet), built.packet_hash);
  assert.match(built.prompt, new RegExp(built.packet_hash));
  assert.equal(scorePortabilityOutput({
    expected: JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, "portability", "expected.json"), "utf8")
    ),
    packetHash: built.packet_hash,
    output
  }).outcome, "PASS");
  assert.equal(scorePortabilityOutput({
    expected: JSON.parse(
      fs.readFileSync(path.join(fixtureRoot, "portability", "expected.json"), "utf8")
    ),
    packetHash: built.packet_hash,
    output: { ...output, open_loop_ids: [] }
  }).outcome, "FAIL");
});

test("promoted manifest stays bound to current protocol, schemas, adapters, fixtures, and prompts", () => {
  const protocol = loadProtocol(protocolPath);
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "docs", "evals", "2026-07-26-workflow-vnext-manifest.json"),
      "utf8"
    )
  );
  const hashes = manifest.content_hashes;
  const fileHashes = {
    protocol: canonicalHash(fs.readFileSync(protocolPath)),
    plan: canonicalHash(
      fs.readFileSync(path.join(repoRoot, "docs", "plans", "2026-07-26-workflow-vnext-evaluation.md"))
    ),
    scorer: canonicalHash(fs.readFileSync(path.join(repoRoot, "scripts", "workflow-vnext-eval.mjs"))),
    codex_adapter: canonicalHash(fs.readFileSync(path.join(repoRoot, "scripts", "codex-exec-adapter.mjs"))),
    claude_adapter: canonicalHash(fs.readFileSync(path.join(repoRoot, "scripts", "claude-print-adapter.mjs")))
  };

  assert.deepEqual(
    Object.fromEntries(Object.keys(fileHashes).map((key) => [key, hashes[key]])),
    fileHashes
  );
  for (const task of protocol.coding.tasks) {
    assert.equal(hashes.fixtures[task], taskFixtureHash({ fixtureRoot, task }));
    for (const condition of protocol.coding.conditions) {
      assert.equal(
        hashes.coding_prompts[task][condition],
        canonicalHash(buildWorkerPrompt({ fixtureRoot, protocol, task, condition }))
      );
    }
  }
  for (const condition of protocol.recovery.conditions) {
    assert.equal(
      hashes.recovery_prompts[condition],
      canonicalHash(buildRecoveryPrompt({ fixtureRoot, protocol, condition }))
    );
  }
  for (const workerId of protocol.orchestration.workers) {
    assert.equal(
      hashes.orchestration_worker_prompts[workerId],
      canonicalHash(buildOrchestrationWorkerPrompt({ fixtureRoot, protocol, workerId }))
    );
  }
  const portability = buildPortabilityPrompt({ fixtureRoot, protocol });
  assert.equal(hashes.portability_packet, portability.packet_hash);
  assert.equal(hashes.portability_prompt, canonicalHash(portability.prompt));
});

test("pilot decision follows precommitted routing, handoff, orchestration, and portability gates", () => {
  const report = {
    coding: {
      "one-file-feature": {
        "formal-plan": [{ outcome: "PASS", tokens: 200 }, { outcome: "PASS", tokens: 220 }],
        "adaptive-state": [{ outcome: "PASS", tokens: 180 }, { outcome: "PASS", tokens: 190 }],
        direct: [{ outcome: "PASS", tokens: 100 }, { outcome: "PASS", tokens: 110 }]
      },
      "ordered-multi-file": {
        "formal-plan": [{ outcome: "PASS", tokens: 300 }, { outcome: "PASS", tokens: 320 }],
        "adaptive-state": [{ outcome: "PASS", tokens: 280 }, { outcome: "PASS", tokens: 290 }],
        direct: [{ outcome: "FAIL", tokens: 210 }, { outcome: "PASS", tokens: 240 }]
      },
      "root-cause-debug": {
        "formal-plan": [{ outcome: "PASS", tokens: 350 }, { outcome: "PASS", tokens: 360 }],
        "adaptive-state": [{ outcome: "PASS", tokens: 330 }, { outcome: "PASS", tokens: 340 }],
        direct: [{ outcome: "FAIL", tokens: 200 }, { outcome: "FAIL", tokens: 220 }]
      }
    },
    recovery: {
      checkpoint: [{ outcome: "PASS" }, { outcome: "PASS" }],
      summary: [{ outcome: "FAIL" }, { outcome: "PASS" }]
    },
    orchestration: { outcome: "PASS" },
    portability: { codex: "PASS", claude: "PASS", same_packet_hash: true },
    integrity_failures: []
  };

  assert.deepEqual(decidePilot(report), {
    bounded_candidate: "direct",
    ordered_debug_candidate: "adaptive-state",
    structured_handoff: "adopt",
    multi_agent: "supported",
    portability: "contract-supported",
    production_default: "not-authorized",
    next: "implement-smallest-vnext-slice"
  });
});
