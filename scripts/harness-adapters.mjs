import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  defaultCodexProbeCachePath,
  loadCodexProbeCapabilities,
  probeCodexRouting,
  runCodexDispatchCommand
} from "./codex-exec-adapter.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CODEX_ADAPTER = Object.freeze({
  harness: "codex",
  probeOutputSchemaPath: path.join(
    PLUGIN_ROOT,
    "protocol",
    "schemas",
    "codex-probe-output.schema.json"
  ),
  defaultProbeCachePath: defaultCodexProbeCachePath,
  probeRouting(options = {}) {
    const { runtimeBin, ...rest } = options;
    return probeCodexRouting({
      ...rest,
      codexBin: runtimeBin ?? "codex"
    });
  },
  loadProbeCapabilities(options = {}) {
    const { runtimeBin, ...rest } = options;
    return loadCodexProbeCapabilities({
      ...rest,
      codexBin: runtimeBin ?? "codex"
    });
  },
  runDispatchCommand: runCodexDispatchCommand
});

const BUILTIN_ADAPTERS = Object.freeze({
  codex: CODEX_ADAPTER
});

export function createHarnessAdapterRegistry(overrides = {}) {
  return new Map(Object.entries({
    ...BUILTIN_ADAPTERS,
    ...overrides
  }));
}

export function getHarnessAdapter(harness, {
  registry = createHarnessAdapterRegistry()
} = {}) {
  if (typeof harness !== "string" || harness.trim() === "") {
    throw new Error("harness is required");
  }
  return registry.get(harness) ?? null;
}

function launchPlanPath(argv, cwd) {
  const index = argv.indexOf("--launch-plan-json");
  if (index === -1 || !argv[index + 1]) throw new Error("--launch-plan-json is required");
  return path.resolve(cwd, argv[index + 1]);
}

export function runHarnessDispatchCommand(argv, {
  cwd = process.cwd(),
  registry = createHarnessAdapterRegistry(),
  validateLaunchPlan
} = {}) {
  const planPath = launchPlanPath(argv, cwd);
  let launchPlan;
  try {
    launchPlan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  } catch (error) {
    throw new Error(`failed to read launch plan ${planPath}: ${error.message}`);
  }
  if (typeof validateLaunchPlan === "function") validateLaunchPlan(launchPlan);
  const adapter = getHarnessAdapter(launchPlan.harness, { registry });
  if (!adapter?.runDispatchCommand) {
    throw new Error(`no dispatch adapter is registered for harness ${launchPlan.harness}`);
  }
  return adapter.runDispatchCommand(argv, { validateLaunchPlan });
}
