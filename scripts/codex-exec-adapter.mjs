import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SANDBOXES = new Set(["read-only", "workspace-write"]);

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required`);
  return value;
}

function codexVersion({ codexBin = "codex", env = process.env } = {}) {
  const result = spawnSync(codexBin, ["--version"], {
    encoding: "utf8",
    env,
    maxBuffer: DEFAULT_MAX_BUFFER
  });
  if (result.error) throw new Error(`failed to run ${codexBin} --version: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`failed to read Codex version (exit ${result.status})`);
  return requireString(result.stdout.trim(), "Codex version");
}

function parseJsonl(source) {
  const events = [];
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Codex JSONL line ${index + 1} is invalid: ${error.message}`);
    }
  }
  return events;
}

function eventError(events) {
  const event = events.find((candidate) => candidate?.type === "error");
  if (!event) return null;
  if (typeof event.message === "string" && event.message.trim()) return event.message.trim();
  if (typeof event.error === "string" && event.error.trim()) return event.error.trim();
  return "Codex reported an error event";
}

export function buildCodexExecArgs({
  launchPlan,
  cwd,
  outputSchemaPath,
  resultPath,
  sandbox = "read-only"
} = {}) {
  requireString(launchPlan?.model, "launchPlan.model");
  requireString(launchPlan?.reasoning_effort, "launchPlan.reasoning_effort");
  requireString(cwd, "cwd");
  requireString(outputSchemaPath, "outputSchemaPath");
  requireString(resultPath, "resultPath");
  if (!SANDBOXES.has(sandbox)) throw new Error(`unsupported Codex worker sandbox: ${sandbox}`);
  if (launchPlan.selection_mode === "inherit") {
    throw new Error("inherit launch plans must use the native spawn path");
  }
  return [
    "exec",
    "--model", launchPlan.model,
    "-c", `model_reasoning_effort=${JSON.stringify(launchPlan.reasoning_effort)}`,
    "--json",
    "--ephemeral",
    "--sandbox", sandbox,
    "--cd", path.resolve(cwd),
    "--output-schema", path.resolve(outputSchemaPath),
    "--output-last-message", path.resolve(resultPath),
    "-"
  ];
}

function executeCodexRequest({
  launchPlan,
  prompt,
  cwd,
  outputSchemaPath,
  resultPath,
  eventsPath,
  sandbox,
  codexBin,
  env
}) {
  const args = buildCodexExecArgs({ launchPlan, cwd, outputSchemaPath, resultPath, sandbox });
  const result = spawnSync(codexBin, args, {
    input: prompt,
    encoding: "utf8",
    env,
    maxBuffer: DEFAULT_MAX_BUFFER
  });
  if (result.error) throw new Error(`failed to start Codex worker: ${result.error.message}`);
  fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
  fs.writeFileSync(eventsPath, result.stdout || "", "utf8");
  const events = parseJsonl(result.stdout || "");
  const reportedError = eventError(events);
  if (result.status !== 0 || reportedError) {
    throw new Error(reportedError || `Codex worker exited with status ${result.status}`);
  }
  const thread = events.find((event) => event?.type === "thread.started");
  const completed = events.find((event) => event?.type === "turn.completed");
  if (!thread?.thread_id) throw new Error("Codex worker did not emit thread.started with thread_id");
  if (!completed) throw new Error("Codex worker did not emit turn.completed");
  if (!fs.existsSync(resultPath)) throw new Error("Codex worker did not write the requested result file");
  return { events, threadId: thread.thread_id, usage: completed.usage ?? null };
}

export function runCodexExecWorker({
  launchPlan,
  prompt,
  cwd,
  outputSchemaPath,
  resultPath,
  eventsPath,
  receiptPath,
  sandbox = "read-only",
  codexBin = "codex",
  env = process.env,
  now = new Date()
} = {}) {
  if (launchPlan?.harness !== "codex") {
    throw new Error("Codex exec adapter requires a codex launch plan");
  }
  requireString(prompt, "prompt");
  requireString(eventsPath, "eventsPath");
  requireString(receiptPath, "receiptPath");
  const runtimeVersion = codexVersion({ codexBin, env });
  const execution = executeCodexRequest({
    launchPlan,
    prompt,
    cwd,
    outputSchemaPath,
    resultPath,
    eventsPath,
    sandbox,
    codexBin,
    env
  });
  const observedAt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(observedAt.getTime())) throw new Error("now must be a valid date");
  const receipt = {
    schema_version: 1,
    launch_id: launchPlan.launch_id,
    harness: "codex",
    actual_model: launchPlan.model,
    actual_reasoning_effort: launchPlan.reasoning_effort,
    source: "runtime-probe",
    observed_at: observedAt.toISOString(),
    adapter: "codex-exec",
    runtime_version: runtimeVersion,
    thread_id: execution.threadId,
    attestation_basis: "explicit-launch-completed"
  };
  writeJsonAtomic(receiptPath, receipt);
  return {
    status: "completed",
    receipt,
    result_path: path.resolve(resultPath),
    events_path: path.resolve(eventsPath),
    receipt_path: path.resolve(receiptPath),
    usage: execution.usage
  };
}

export function routingFingerprint(routing) {
  return crypto.createHash("sha256").update(JSON.stringify(routing)).digest("hex");
}

export function defaultCodexProbeCachePath({ homeDir = os.homedir() } = {}) {
  return path.join(homeDir, ".0th", "skills", "cache", "model-routing", "codex.json");
}

export function probeCodexRouting({
  routing,
  cwd,
  outputSchemaPath,
  cachePath = defaultCodexProbeCachePath(),
  codexBin = "codex",
  env = process.env,
  now = new Date()
} = {}) {
  const runtimeVersion = codexVersion({ codexBin, env });
  const observedAt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(observedAt.getTime())) throw new Error("now must be a valid date");
  const profiles = {};
  for (const [computeClass, profile] of Object.entries(routing.profiles)) {
    if (profile.selection_mode === "disabled" || profile.selection_mode === "inherit") {
      profiles[computeClass] = {
        model: profile.model,
        reasoning_effort: profile.reasoning_effort,
        status: "skipped",
        reason: `${profile.selection_mode} profile does not need a Codex exec probe`
      };
      continue;
    }
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `0th-codex-probe-${computeClass}-`));
    const launchPlan = {
      model: profile.model,
      reasoning_effort: profile.reasoning_effort,
      selection_mode: profile.selection_mode
    };
    try {
      executeCodexRequest({
        launchPlan,
        prompt: 'Return {"status":"ready"} only.',
        cwd,
        outputSchemaPath,
        resultPath: path.join(tempDir, "result.json"),
        eventsPath: path.join(tempDir, "events.jsonl"),
        sandbox: "read-only",
        codexBin,
        env
      });
      profiles[computeClass] = {
        model: profile.model,
        reasoning_effort: profile.reasoning_effort,
        status: "ready",
        reason: null
      };
    } catch (error) {
      profiles[computeClass] = {
        model: profile.model,
        reasoning_effort: profile.reasoning_effort,
        status: "blocked",
        reason: error.message
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
  const cache = {
    schema_version: 1,
    harness: "codex",
    codex_version: runtimeVersion,
    routing_fingerprint: routingFingerprint(routing),
    observed_at: observedAt.toISOString(),
    profiles
  };
  writeJsonAtomic(cachePath, cache);
  return cache;
}

export function loadCodexProbeCapabilities({
  cachePath = defaultCodexProbeCachePath(),
  routing,
  codexBin = "codex",
  env = process.env,
  now = new Date(),
  maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS
} = {}) {
  const cache = readJson(cachePath, "failed to read Codex probe cache");
  if (cache.schema_version !== 1 || cache.harness !== "codex") {
    throw new Error("Codex probe cache has an unsupported schema or harness");
  }
  if (cache.routing_fingerprint !== routingFingerprint(routing)) {
    throw new Error("Codex probe cache routing fingerprint does not match local configuration");
  }
  const currentVersion = codexVersion({ codexBin, env });
  if (cache.codex_version !== currentVersion) {
    throw new Error("Codex probe cache Codex version does not match the installed CLI");
  }
  const observedAt = Date.parse(cache.observed_at);
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(observedAt) || !Number.isFinite(currentTime)) throw new Error("invalid probe cache timestamp");
  if (currentTime - observedAt > maxAgeMs) throw new Error("Codex probe cache is stale");
  const ready = Object.values(cache.profiles).filter((profile) => profile.status === "ready");
  return {
    schema_version: 1,
    harness: "codex",
    source: "runtime-probe",
    observed_at: cache.observed_at,
    model: null,
    reasoning_effort: null,
    available_models: [...new Set(ready.map((profile) => profile.model))],
    available_reasoning_efforts: [...new Set(ready.map((profile) => profile.reasoning_effort))],
    available_model_effort_pairs: ready.map((profile) => ({
      model: profile.model,
      reasoning_effort: profile.reasoning_effort
    })),
    model_override: ready.length > 0,
    effort_override: ready.length > 0,
    max_parallelism: 1,
    max_depth: 0,
    workspace_isolation: false,
    resume: false,
    hooks: [],
    external_write_controls: []
  };
}

export function runCodexDispatchCommand(argv, {
  cwd = process.cwd(),
  env = process.env,
  validateLaunchPlan
} = {}) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--launch-plan-json") options.launchPlanJson = argv[++index];
    else if (token === "--prompt-file") options.promptFile = argv[++index];
    else if (token === "--output-schema") options.outputSchema = argv[++index];
    else if (token === "--result-out") options.resultOut = argv[++index];
    else if (token === "--events-out") options.eventsOut = argv[++index];
    else if (token === "--receipt-out") options.receiptOut = argv[++index];
    else if (token === "--sandbox") options.sandbox = argv[++index];
    else if (token === "--worker-cwd") options.workerCwd = argv[++index];
    else if (token === "--codex-bin") options.codexBin = argv[++index];
    else throw new Error(`unknown dispatch option: ${token}`);
  }
  for (const key of ["launchPlanJson", "promptFile", "outputSchema", "resultOut", "eventsOut", "receiptOut"]) {
    if (!options[key]) throw new Error(`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} is required`);
  }
  const launchPlan = readJson(path.resolve(cwd, options.launchPlanJson), "failed to read launch plan");
  if (validateLaunchPlan) validateLaunchPlan(launchPlan);
  const prompt = fs.readFileSync(path.resolve(cwd, options.promptFile), "utf8");
  return runCodexExecWorker({
    launchPlan,
    prompt,
    cwd: path.resolve(cwd, options.workerCwd || "."),
    outputSchemaPath: path.resolve(cwd, options.outputSchema),
    resultPath: path.resolve(cwd, options.resultOut),
    eventsPath: path.resolve(cwd, options.eventsOut),
    receiptPath: path.resolve(cwd, options.receiptOut),
    sandbox: options.sandbox || "read-only",
    codexBin: options.codexBin || "codex",
    env
  });
}
