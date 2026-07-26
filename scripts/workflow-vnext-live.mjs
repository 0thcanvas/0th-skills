#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runCodexExecWorker } from "./codex-exec-adapter.mjs";
import { runClaudePrintWorker } from "./claude-print-adapter.mjs";
import { verifyExecutionReceipt } from "./host-capabilities.mjs";
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
  loadProtocol,
  materializeTask,
  scoreCodingRun,
  scoreOrchestration,
  scorePortabilityOutput,
  scoreRecovery
} from "./workflow-vnext-eval.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command, limit: Infinity };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--protocol") options.protocol = rest[++index];
    else if (token === "--fixture-root") options.fixtureRoot = rest[++index];
    else if (token === "--launch-plan") options.launchPlan = rest[++index];
    else if (token === "--evidence-dir") options.evidenceDir = rest[++index];
    else if (token === "--workspace-root") options.workspaceRoot = rest[++index];
    else if (token === "--limit") options.limit = Number(rest[++index]);
    else fail(`unknown option: ${token}`);
  }
  if (!["coding", "recovery", "orchestration", "portability"].includes(command)) {
    fail("usage: workflow-vnext-live.mjs <coding|recovery|orchestration|portability> [options]");
  }
  for (const key of ["protocol", "fixtureRoot", "launchPlan", "evidenceDir", "workspaceRoot"]) {
    if (!options[key]) fail(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  if (options.limit !== Infinity && (!Number.isInteger(options.limit) || options.limit < 1)) {
    fail("--limit must be a positive integer");
  }
  return options;
}

function usageTokens(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = Number(usage.input_tokens ?? 0);
  const output = Number(usage.output_tokens ?? 0);
  return Number.isFinite(input) && Number.isFinite(output) ? input + output : null;
}

function run(command, args, { cwd, timeout = 30000 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
    maxBuffer: 10 * 1024 * 1024
  });
  return {
    exit_code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error?.message ?? null
  };
}

function mustRun(command, args, cwd) {
  const result = run(command, args, { cwd });
  if (result.exit_code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
}

function initializeFixtureRepo(workspace) {
  mustRun("git", ["init", "-q"], workspace);
  mustRun("git", ["config", "user.email", "workflow-vnext@example.invalid"], workspace);
  mustRun("git", ["config", "user.name", "Workflow vNext Eval"], workspace);
  mustRun("git", ["add", "."], workspace);
  mustRun("git", ["commit", "-qm", "fixture baseline"], workspace);
}

function protectedHashes(workspace) {
  const protectedPaths = ["package.json"];
  const testsDir = path.join(workspace, "tests");
  for (const entry of fs.readdirSync(testsDir).sort()) {
    protectedPaths.push(path.posix.join("tests", entry));
  }
  return Object.fromEntries(protectedPaths.map((relativePath) => [
    relativePath,
    canonicalHash(fs.readFileSync(path.join(workspace, relativePath)))
  ]));
}

function changedProtectedFiles(workspace, before) {
  return Object.entries(before)
    .filter(([relativePath, expectedHash]) => {
      const filePath = path.join(workspace, relativePath);
      return !fs.existsSync(filePath) || canonicalHash(fs.readFileSync(filePath)) !== expectedHash;
    })
    .map(([relativePath]) => relativePath);
}

function changedPaths(workspace) {
  const result = run("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: workspace });
  if (result.exit_code !== 0) throw new Error(`git status failed: ${result.stderr.trim()}`);
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .sort();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function prepareRunDirectory({ runDir, workspace }) {
  if (fs.existsSync(runDir)) throw new Error(`evidence run directory already exists: ${runDir}`);
  if (fs.existsSync(workspace)) throw new Error(`worker workspace already exists: ${workspace}`);
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

export function archiveWorkspace({ workspace, archiveRoot, runId }) {
  const destination = path.join(archiveRoot, runId);
  if (fs.existsSync(destination)) {
    throw new Error(`archive destination already exists: ${destination}`);
  }
  if (!fs.existsSync(workspace)) {
    throw new Error(`worker workspace does not exist: ${workspace}`);
  }
  fs.mkdirSync(archiveRoot, { recursive: true });
  fs.renameSync(workspace, destination);
  return destination;
}

function executeCodingRun({ protocol, fixtureRoot, launchPlan, evidenceDir, workspaceRoot, runSpec }) {
  const runDir = path.join(evidenceDir, "runs", "coding", runSpec.id);
  const workspace = path.join(workspaceRoot, "current");
  const archiveRoot = path.join(workspaceRoot, "archive");
  prepareRunDirectory({ runDir, workspace });
  const materialized = materializeTask({
    fixtureRoot,
    task: runSpec.task,
    targetDir: workspace
  });
  initializeFixtureRepo(workspace);
  const protectedBefore = protectedHashes(workspace);
  const prompt = buildWorkerPrompt({
    fixtureRoot,
    protocol,
    task: runSpec.task,
    condition: runSpec.condition
  });
  const promptHash = canonicalHash(prompt);
  fs.writeFileSync(path.join(runDir, "prompt.txt"), prompt);
  const resultPath = path.join(runDir, "result.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  const receiptPath = path.join(runDir, "execution-receipt.json");
  const startedAt = new Date();
  let execution;
  let workerError = null;
  try {
    execution = runCodexExecWorker({
      launchPlan,
      prompt,
      cwd: workspace,
      outputSchemaPath: path.join(fixtureRoot, "result.schema.json"),
      resultPath,
      eventsPath,
      receiptPath,
      sandbox: "workspace-write",
      timeoutMs: protocol.runtime.timeout_ms,
      ignoreUserConfig: false,
      ignoreRules: true,
      isolateSkills: true
    });
  } catch (error) {
    workerError = error.message;
  }
  const completedAt = new Date();
  const testResult = run("npm", ["test"], { cwd: workspace, timeout: 60000 });
  const invariantResult = run("npm", ["run", "invariant"], { cwd: workspace, timeout: 60000 });
  const receipt = fs.existsSync(receiptPath) ? readJson(receiptPath) : null;
  const attestation = receipt
    ? verifyExecutionReceipt({ launchPlan, receipt })
    : { verified: false, reasons: ["receipt_missing"] };
  const runRecord = {
    schema_version: 1,
    ...runSpec,
    fixture_hash: materialized.fixture_hash,
    workspace,
    prompt_hash: promptHash,
    launch_id: launchPlan.launch_id,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    worker_error: workerError,
    receipt,
    attestation,
    usage: execution?.usage ?? null,
    result: fs.existsSync(resultPath) ? readJson(resultPath) : null,
    test_exit_code: testResult.exit_code,
    invariant_exit_code: invariantResult.exit_code,
    changed_paths: changedPaths(workspace),
    protected_files_changed: changedProtectedFiles(workspace, protectedBefore),
    oracle: {
      test_stdout_hash: canonicalHash(testResult.stdout),
      test_stderr: testResult.stderr.trim().slice(0, 2000),
      invariant_stdout_hash: canonicalHash(invariantResult.stdout),
      invariant_stderr: invariantResult.stderr.trim().slice(0, 2000)
    }
  };
  runRecord.score = scoreCodingRun({ condition: runSpec.condition, run: runRecord });
  if (!attestation.verified && runRecord.score.outcome !== "INVALID_RUNTIME") {
    runRecord.score = {
      ...runRecord.score,
      outcome: "INVALID_RUNTIME",
      failures: [...new Set([...(runRecord.score.failures ?? []), ...attestation.reasons])]
    };
  }
  runRecord.workspace_archive = archiveWorkspace({
    workspace,
    archiveRoot,
    runId: runSpec.id
  });
  writeJson(path.join(runDir, "run.json"), runRecord);
  return runRecord;
}

function runCoding(options) {
  const protocolPath = path.resolve(options.protocol);
  const fixtureRoot = path.resolve(options.fixtureRoot);
  const evidenceDir = path.resolve(options.evidenceDir);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const protocol = loadProtocol(protocolPath);
  const launchPlan = readJson(path.resolve(options.launchPlan));
  const runs = buildCodingRuns(protocol);
  const completed = [];
  const skipped = [];
  for (const runSpec of runs) {
    const recordPath = path.join(evidenceDir, "runs", "coding", runSpec.id, "run.json");
    if (fs.existsSync(recordPath)) {
      skipped.push(runSpec.id);
      continue;
    }
    if (completed.length >= options.limit) break;
    const record = executeCodingRun({
      protocol,
      fixtureRoot,
      launchPlan,
      evidenceDir,
      workspaceRoot,
      runSpec
    });
    completed.push({
      id: record.id,
      outcome: record.score.outcome,
      failures: record.score.failures,
      tokens: record.score.tokens,
      duration_ms: record.duration_ms
    });
  }
  const summary = {
    command: "coding",
    completed,
    skipped_count: skipped.length,
    remaining: runs.length - skipped.length - completed.length
  };
  writeJson(path.join(evidenceDir, "coding-last-batch.json"), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function executeRecoveryRun({
  protocol,
  fixtureRoot,
  launchPlan,
  evidenceDir,
  workspaceRoot,
  expected,
  runSpec
}) {
  const runDir = path.join(evidenceDir, "runs", "recovery", runSpec.id);
  const workspace = path.join(workspaceRoot, "current");
  const archiveRoot = path.join(workspaceRoot, "archive");
  prepareRunDirectory({ runDir, workspace });
  fs.mkdirSync(workspace, { recursive: true });
  const prompt = buildRecoveryPrompt({
    fixtureRoot,
    protocol,
    condition: runSpec.condition
  });
  const resultPath = path.join(runDir, "result.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  const receiptPath = path.join(runDir, "execution-receipt.json");
  fs.writeFileSync(path.join(runDir, "prompt.txt"), prompt);
  const startedAt = new Date();
  let execution;
  let workerError = null;
  try {
    execution = runCodexExecWorker({
      launchPlan,
      prompt,
      cwd: workspace,
      outputSchemaPath: path.join(fixtureRoot, "recovery", "result.schema.json"),
      resultPath,
      eventsPath,
      receiptPath,
      sandbox: "read-only",
      timeoutMs: protocol.runtime.timeout_ms,
      ignoreUserConfig: false,
      ignoreRules: true,
      isolateSkills: true
    });
  } catch (error) {
    workerError = error.message;
  }
  const completedAt = new Date();
  const receipt = fs.existsSync(receiptPath) ? readJson(receiptPath) : null;
  const attestation = receipt
    ? verifyExecutionReceipt({ launchPlan, receipt })
    : { verified: false, reasons: ["receipt_missing"] };
  const output = fs.existsSync(resultPath) ? readJson(resultPath) : {};
  const recoveryScore = scoreRecovery({ expected, output });
  const score = attestation.verified
    ? {
        ...recoveryScore,
        tokens: usageTokens(execution?.usage),
        duration_ms: completedAt.getTime() - startedAt.getTime()
      }
    : {
        outcome: "INVALID_RUNTIME",
        failures: attestation.reasons,
        tokens: usageTokens(execution?.usage),
        duration_ms: completedAt.getTime() - startedAt.getTime()
      };
  const runRecord = {
    schema_version: 1,
    ...runSpec,
    prompt_hash: canonicalHash(prompt),
    artifact_hash: canonicalHash(
      fs.readFileSync(
        path.join(fixtureRoot, "recovery", "artifacts", `${runSpec.condition}.md`)
      )
    ),
    expected_hash: canonicalHash(expected),
    workspace,
    launch_id: launchPlan.launch_id,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    worker_error: workerError,
    receipt,
    attestation,
    usage: execution?.usage ?? null,
    result: output,
    score
  };
  runRecord.workspace_archive = archiveWorkspace({
    workspace,
    archiveRoot,
    runId: runSpec.id
  });
  writeJson(path.join(runDir, "run.json"), runRecord);
  return runRecord;
}

function runRecovery(options) {
  const protocol = loadProtocol(path.resolve(options.protocol));
  const fixtureRoot = path.resolve(options.fixtureRoot);
  const evidenceDir = path.resolve(options.evidenceDir);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const launchPlan = readJson(path.resolve(options.launchPlan));
  const expected = readJson(path.join(fixtureRoot, "recovery", "expected.json"));
  const runs = buildRecoveryRuns(protocol);
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const completed = [];
  const skipped = [];
  for (const runSpec of runs) {
    const recordPath = path.join(evidenceDir, "runs", "recovery", runSpec.id, "run.json");
    if (fs.existsSync(recordPath)) {
      skipped.push(runSpec.id);
      continue;
    }
    if (completed.length >= options.limit) break;
    const record = executeRecoveryRun({
      protocol,
      fixtureRoot,
      launchPlan,
      evidenceDir,
      workspaceRoot,
      expected,
      runSpec
    });
    completed.push({
      id: record.id,
      outcome: record.score.outcome,
      missing: record.score.missing ?? [],
      unexpected: record.score.unexpected ?? [],
      tokens: record.score.tokens,
      duration_ms: record.duration_ms
    });
  }
  const summary = {
    command: "recovery",
    completed,
    skipped_count: skipped.length,
    remaining: runs.length - skipped.length - completed.length
  };
  writeJson(path.join(evidenceDir, "recovery-last-batch.json"), summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function executeOrchestrationNode({
  protocol,
  launchPlan,
  runDir,
  workspaceRoot,
  runId,
  parentId,
  condition,
  prompt,
  outputSchemaPath
}) {
  const workspace = path.join(workspaceRoot, "current");
  const archiveRoot = path.join(workspaceRoot, "archive");
  prepareRunDirectory({ runDir, workspace });
  fs.mkdirSync(workspace, { recursive: true });
  const resultPath = path.join(runDir, "result.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  const receiptPath = path.join(runDir, "execution-receipt.json");
  fs.writeFileSync(path.join(runDir, "prompt.txt"), prompt);
  const startedAt = new Date();
  let execution;
  let workerError = null;
  try {
    execution = runCodexExecWorker({
      launchPlan,
      prompt,
      cwd: workspace,
      outputSchemaPath,
      resultPath,
      eventsPath,
      receiptPath,
      sandbox: "read-only",
      timeoutMs: protocol.runtime.timeout_ms,
      ignoreUserConfig: false,
      ignoreRules: true,
      isolateSkills: true
    });
  } catch (error) {
    workerError = error.message;
  }
  const completedAt = new Date();
  const executionReceipt = fs.existsSync(receiptPath) ? readJson(receiptPath) : null;
  const attestation = executionReceipt
    ? verifyExecutionReceipt({ launchPlan, receipt: executionReceipt })
    : { verified: false, reasons: ["receipt_missing"] };
  const output = fs.existsSync(resultPath) ? readJson(resultPath) : {};
  let experimentReceipt = null;
  let experimentReceiptError = null;
  try {
    experimentReceipt = buildExperimentReceipt({
      runId,
      parentId,
      condition,
      input: prompt,
      output,
      executionReceipt,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      attested: attestation.verified
    });
  } catch (error) {
    experimentReceiptError = error.message;
  }
  const record = {
    schema_version: 1,
    run_id: runId,
    parent_id: parentId,
    condition,
    prompt_hash: canonicalHash(prompt),
    workspace,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    worker_error: workerError,
    execution_receipt: executionReceipt,
    attestation,
    experiment_receipt: experimentReceipt,
    experiment_receipt_error: experimentReceiptError,
    usage: execution?.usage ?? null,
    result: output
  };
  record.workspace_archive = archiveWorkspace({
    workspace,
    archiveRoot,
    runId: `orchestration-${runId}`
  });
  writeJson(path.join(runDir, "run.json"), record);
  return record;
}

function runOrchestration(options) {
  const protocol = loadProtocol(path.resolve(options.protocol));
  const fixtureRoot = path.resolve(options.fixtureRoot);
  const evidenceDir = path.resolve(options.evidenceDir);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const launchPlan = readJson(path.resolve(options.launchPlan));
  const expected = readJson(path.join(fixtureRoot, "orchestration", "expected.json"));
  const parentId = protocol.orchestration.parent_id;
  const parentDir = path.join(evidenceDir, "runs", "orchestration", parentId);
  const reportPath = path.join(parentDir, "report.json");
  if (fs.existsSync(reportPath)) {
    process.stdout.write(fs.readFileSync(reportPath, "utf8"));
    return;
  }
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const records = [];
  const inputsByRunId = {};
  const outputsByRunId = {};
  const workerOutputs = {};
  for (const workerId of protocol.orchestration.workers) {
    const prompt = buildOrchestrationWorkerPrompt({
      fixtureRoot,
      protocol,
      workerId
    });
    const record = executeOrchestrationNode({
      protocol,
      launchPlan,
      runDir: path.join(parentDir, workerId),
      workspaceRoot,
      runId: workerId,
      parentId,
      condition: "fanout",
      prompt,
      outputSchemaPath: path.join(
        fixtureRoot,
        "orchestration",
        "worker-result.schema.json"
      )
    });
    records.push(record);
    inputsByRunId[workerId] = prompt;
    outputsByRunId[workerId] = record.result;
    workerOutputs[workerId] = record.result;
  }
  const synthId = protocol.orchestration.synthesizer;
  const synthPrompt = buildSynthesisPrompt({
    fixtureRoot,
    protocol,
    workerOutputs
  });
  const synthRecord = executeOrchestrationNode({
    protocol,
    launchPlan,
    runDir: path.join(parentDir, synthId),
    workspaceRoot,
    runId: synthId,
    parentId,
    condition: "synthesis",
    prompt: synthPrompt,
    outputSchemaPath: path.join(
      fixtureRoot,
      "orchestration",
      "synthesis-result.schema.json"
    )
  });
  records.push(synthRecord);
  inputsByRunId[synthId] = synthPrompt;
  outputsByRunId[synthId] = synthRecord.result;
  const receipts = records
    .map((record) => record.experiment_receipt)
    .filter(Boolean);
  const score = scoreOrchestration({
    expected,
    receipts,
    output: synthRecord.result,
    inputsByRunId,
    outputsByRunId
  });
  const report = {
    schema_version: 1,
    parent_id: parentId,
    expected_hash: canonicalHash(expected),
    worker_output_hashes: Object.fromEntries(
      protocol.orchestration.workers.map((workerId) => [
        workerId,
        canonicalHash(workerOutputs[workerId])
      ])
    ),
    synthesis_prompt_hash: canonicalHash(synthPrompt),
    synthesis_output: synthRecord.result,
    receipts,
    receipt_count: receipts.length,
    score,
    usage: Object.fromEntries(records.map((record) => [
      record.run_id,
      record.usage
    ]))
  };
  writeJson(reportPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function runPortability(options) {
  const protocol = loadProtocol(path.resolve(options.protocol));
  const fixtureRoot = path.resolve(options.fixtureRoot);
  const evidenceDir = path.resolve(options.evidenceDir);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const launchPlan = readJson(path.resolve(options.launchPlan));
  const expected = readJson(path.join(fixtureRoot, "portability", "expected.json"));
  const schemaPath = path.join(fixtureRoot, "portability", "result.schema.json");
  const schema = readJson(schemaPath);
  const built = buildPortabilityPrompt({ fixtureRoot, protocol });
  const root = path.join(evidenceDir, "runs", "portability");
  const reportPath = path.join(root, "report.json");
  if (fs.existsSync(reportPath)) {
    process.stdout.write(fs.readFileSync(reportPath, "utf8"));
    return;
  }
  fs.mkdirSync(workspaceRoot, { recursive: true });

  const codexRunDir = path.join(root, "codex");
  const codexRecordPath = path.join(codexRunDir, "run.json");
  let codexRecord;
  if (fs.existsSync(codexRecordPath)) {
    codexRecord = readJson(codexRecordPath);
  } else {
    const codexWorkspace = path.join(workspaceRoot, "current");
    prepareRunDirectory({ runDir: codexRunDir, workspace: codexWorkspace });
    fs.mkdirSync(codexWorkspace, { recursive: true });
    fs.writeFileSync(path.join(codexRunDir, "prompt.txt"), built.prompt);
    const codexResultPath = path.join(codexRunDir, "result.json");
    const codexEventsPath = path.join(codexRunDir, "events.jsonl");
    const codexReceiptPath = path.join(codexRunDir, "execution-receipt.json");
    const codexStartedAt = new Date();
    let codexExecution;
    let codexError = null;
    try {
      codexExecution = runCodexExecWorker({
        launchPlan,
        prompt: built.prompt,
        cwd: codexWorkspace,
        outputSchemaPath: schemaPath,
        resultPath: codexResultPath,
        eventsPath: codexEventsPath,
        receiptPath: codexReceiptPath,
        sandbox: "read-only",
        timeoutMs: protocol.runtime.timeout_ms,
        ignoreUserConfig: false,
        ignoreRules: true,
        isolateSkills: true
      });
    } catch (error) {
      codexError = error.message;
    }
    const codexCompletedAt = new Date();
    const codexReceipt = fs.existsSync(codexReceiptPath) ? readJson(codexReceiptPath) : null;
    const codexAttestation = codexReceipt
      ? verifyExecutionReceipt({ launchPlan, receipt: codexReceipt })
      : { verified: false, reasons: ["receipt_missing"] };
    const codexOutput = fs.existsSync(codexResultPath) ? readJson(codexResultPath) : {};
    const codexOracle = scorePortabilityOutput({
      expected,
      packetHash: built.packet_hash,
      output: codexOutput
    });
    const codexScore = codexAttestation.verified
      ? codexOracle
      : { outcome: "INVALID_RUNTIME", failures: codexAttestation.reasons };
    const codexArchive = archiveWorkspace({
      workspace: codexWorkspace,
      archiveRoot: path.join(workspaceRoot, "archive"),
      runId: "portability-codex"
    });
    codexRecord = {
      schema_version: 1,
      harness: "codex",
      packet_hash: built.packet_hash,
      prompt_hash: canonicalHash(built.prompt),
      started_at: codexStartedAt.toISOString(),
      completed_at: codexCompletedAt.toISOString(),
      duration_ms: codexCompletedAt.getTime() - codexStartedAt.getTime(),
      worker_error: codexError,
      receipt: codexReceipt,
      attestation: codexAttestation,
      usage: codexExecution?.usage ?? null,
      output: codexOutput,
      score: codexScore,
      workspace_archive: codexArchive
    };
    writeJson(codexRecordPath, codexRecord);
  }

  const claudeRunDir = path.join(root, "claude");
  const claudeWorkspace = path.join(workspaceRoot, "current");
  prepareRunDirectory({ runDir: claudeRunDir, workspace: claudeWorkspace });
  fs.mkdirSync(claudeWorkspace, { recursive: true });
  fs.writeFileSync(path.join(claudeRunDir, "prompt.txt"), built.prompt);
  const claudeStartedAt = new Date();
  let claudeExecution;
  let claudeError = null;
  try {
    claudeExecution = runClaudePrintWorker({
      prompt: built.prompt,
      cwd: claudeWorkspace,
      schema,
      model: protocol.portability.claude_model,
      effort: protocol.portability.claude_effort,
      resultPath: path.join(claudeRunDir, "result.json"),
      rawPath: path.join(claudeRunDir, "raw.json"),
      receiptPath: path.join(claudeRunDir, "execution-receipt.json"),
      timeoutMs: protocol.runtime.timeout_ms
    });
  } catch (error) {
    claudeError = error.message;
  }
  const claudeCompletedAt = new Date();
  const claudeReceiptPath = path.join(claudeRunDir, "execution-receipt.json");
  const claudeReceipt = fs.existsSync(claudeReceiptPath) ? readJson(claudeReceiptPath) : null;
  const claudeResultPath = path.join(claudeRunDir, "result.json");
  const claudeOutput = fs.existsSync(claudeResultPath) ? readJson(claudeResultPath) : {};
  const claudeRuntimeValid = Boolean(
    claudeReceipt?.runtime_version?.startsWith(protocol.portability.claude_version)
  );
  const claudeOracle = scorePortabilityOutput({
    expected,
    packetHash: built.packet_hash,
    output: claudeOutput
  });
  const claudeScore = claudeRuntimeValid
    ? claudeOracle
    : {
        outcome: "INVALID_RUNTIME",
        failures: [claudeReceipt ? "claude_version_mismatch" : "receipt_missing"]
      };
  const claudeArchive = archiveWorkspace({
    workspace: claudeWorkspace,
    archiveRoot: path.join(workspaceRoot, "archive"),
    runId: "portability-claude"
  });
  const claudeRecord = {
    schema_version: 1,
    harness: "claude",
    packet_hash: built.packet_hash,
    prompt_hash: canonicalHash(built.prompt),
    started_at: claudeStartedAt.toISOString(),
    completed_at: claudeCompletedAt.toISOString(),
    duration_ms: claudeCompletedAt.getTime() - claudeStartedAt.getTime(),
    worker_error: claudeError,
    receipt: claudeReceipt,
    runtime_valid: claudeRuntimeValid,
    usage: claudeExecution?.usage ?? null,
    output: claudeOutput,
    score: claudeScore,
    workspace_archive: claudeArchive
  };
  writeJson(path.join(claudeRunDir, "run.json"), claudeRecord);

  const report = {
    schema_version: 1,
    packet_hash: built.packet_hash,
    same_packet_hash: codexRecord.packet_hash === claudeRecord.packet_hash,
    same_prompt_hash: codexRecord.prompt_hash === claudeRecord.prompt_hash,
    codex: codexRecord.score.outcome,
    claude: claudeScore.outcome,
    codex_failures: codexRecord.score.failures,
    claude_failures: claudeScore.failures,
    codex_receipt: codexRecord.receipt,
    claude_receipt: claudeReceipt,
    claim_boundary: "contract transport only; no performance parity claim"
  };
  writeJson(reportPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "coding") runCoding(options);
  else if (options.command === "recovery") runRecovery(options);
  else if (options.command === "orchestration") runOrchestration(options);
  else runPortability(options);
}
