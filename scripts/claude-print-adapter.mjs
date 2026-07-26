import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const MAX_BUFFER = 10 * 1024 * 1024;

function sumModelUsage(modelUsage, field) {
  return Object.values(modelUsage ?? {}).reduce((total, entry) => {
    const value = Number(entry?.[field] ?? 0);
    return total + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function buildClaudePrintArgs({ model, effort, schema }) {
  return [
    "-p",
    "--output-format", "json",
    "--model", model,
    "--effort", effort,
    "--no-session-persistence",
    "--no-chrome",
    "--disable-slash-commands",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--mcp-config", "{\"mcpServers\":{}}",
    "--tools", "",
    "--system-prompt",
    "Follow only the user-supplied portable contract. Do not use tools or outside context.",
    "--json-schema", JSON.stringify(schema)
  ];
}

export function parseClaudePrintOutput(source) {
  let envelope;
  try {
    envelope = JSON.parse(source);
  } catch (error) {
    throw new Error(`Claude response was not valid JSON: ${error.message}`);
  }
  const init = Array.isArray(envelope)
    ? envelope.find((event) => event?.type === "system" && event?.subtype === "init")
    : null;
  const payload = Array.isArray(envelope)
    ? [...envelope].reverse().find((event) => event?.type === "result")
    : envelope;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Claude response must be one JSON result object");
  }
  if (payload.is_error === true || payload.subtype === "error") {
    throw new Error(`Claude reported an error result: ${payload.result ?? "unknown error"}`);
  }
  let output = payload.structured_output;
  if (!output && typeof payload.result === "string") {
    try {
      output = JSON.parse(payload.result);
    } catch {
      throw new Error("Claude result did not contain structured_output or JSON result text");
    }
  }
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    throw new Error("Claude response did not contain a structured output object");
  }
  const modelUsage = payload.modelUsage ?? payload.model_usage ?? {};
  const models = Object.keys(modelUsage).sort();
  if (models.length === 0 && typeof init?.model === "string" && init.model) {
    models.push(init.model);
  }
  const inputTokens = Number(payload.usage?.input_tokens)
    || sumModelUsage(modelUsage, "inputTokens");
  const outputTokens = Number(payload.usage?.output_tokens)
    || sumModelUsage(modelUsage, "outputTokens");
  return {
    output,
    session_id: payload.session_id ?? init?.session_id ?? null,
    models,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    },
    duration_ms: Number(payload.duration_ms) || null,
    total_cost_usd: Number(payload.total_cost_usd) || null,
    raw: envelope
  };
}

function claudeVersion({ claudeBin, env }) {
  const result = spawnSync(claudeBin, ["--version"], {
    encoding: "utf8",
    env,
    maxBuffer: MAX_BUFFER
  });
  if (result.error || result.status !== 0) {
    throw new Error(`failed to read Claude version: ${result.error?.message ?? result.stderr}`);
  }
  return result.stdout.trim();
}

export function runClaudePrintWorker({
  prompt,
  cwd,
  schema,
  model,
  effort,
  resultPath,
  rawPath,
  receiptPath,
  timeoutMs,
  claudeBin = "claude",
  env = process.env
}) {
  const runtimeVersion = claudeVersion({ claudeBin, env });
  const args = buildClaudePrintArgs({ model, effort, schema });
  const result = spawnSync(claudeBin, args, {
    cwd,
    input: prompt,
    encoding: "utf8",
    env,
    timeout: timeoutMs,
    maxBuffer: MAX_BUFFER
  });
  fs.mkdirSync(path.dirname(rawPath), { recursive: true });
  fs.writeFileSync(rawPath, result.stdout || "", "utf8");
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`Claude worker timed out after ${timeoutMs}ms`);
  }
  if (result.error) throw new Error(`failed to start Claude worker: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `Claude worker exited with status ${result.status}: ${(result.stderr || "").trim().slice(0, 500)}`
    );
  }
  const parsed = parseClaudePrintOutput(result.stdout || "");
  fs.writeFileSync(resultPath, `${JSON.stringify(parsed.output, null, 2)}\n`);
  const receipt = {
    schema_version: 1,
    harness: "claude",
    requested_model: model,
    requested_effort: effort,
    actual_models: parsed.models,
    adapter: "claude-print",
    runtime_version: runtimeVersion,
    session_id: parsed.session_id,
    usage: parsed.usage,
    duration_ms: parsed.duration_ms,
    total_cost_usd: parsed.total_cost_usd
  };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return {
    output: parsed.output,
    receipt,
    usage: parsed.usage
  };
}
