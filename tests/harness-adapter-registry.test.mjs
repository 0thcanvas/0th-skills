import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createHarnessAdapterRegistry,
  getHarnessAdapter,
  runHarnessDispatchCommand
} from "../scripts/harness-adapters.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("portable controllers depend on the harness registry rather than the Codex adapter", () => {
  for (const relativePath of ["scripts/host-capabilities.mjs", "scripts/0th.mjs"]) {
    const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.doesNotMatch(source, /from "\.\/codex-exec-adapter\.mjs"/);
    assert.match(source, /harness-adapters\.mjs/);
  }

  const codex = getHarnessAdapter("codex");
  assert.equal(codex.harness, "codex");
  assert.equal(typeof codex.probeRouting, "function");
  assert.equal(typeof codex.runDispatchCommand, "function");
  assert.equal(getHarnessAdapter("unknown"), null);
});

test("dispatch selects an adapter from the launch plan harness", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "0th-harness-dispatch-"));
  const launchPath = path.join(root, "launch.json");
  fs.writeFileSync(launchPath, JSON.stringify({ harness: "fixture" }));
  const registry = createHarnessAdapterRegistry({
    fixture: {
      harness: "fixture",
      runDispatchCommand(argv) {
        return { adapter: "fixture", argv };
      }
    }
  });

  const result = runHarnessDispatchCommand([
    "--launch-plan-json",
    launchPath,
    "--prompt-file",
    "prompt.md"
  ], {
    cwd: root,
    registry,
    validateLaunchPlan() {}
  });

  assert.equal(result.adapter, "fixture");
  assert.deepEqual(result.argv, [
    "--launch-plan-json",
    launchPath,
    "--prompt-file",
    "prompt.md"
  ]);
});

test("dispatch fails closed when a harness has no execution adapter", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "0th-harness-missing-"));
  const launchPath = path.join(root, "launch.json");
  fs.writeFileSync(launchPath, JSON.stringify({ harness: "missing" }));

  assert.throws(
    () => runHarnessDispatchCommand([
      "--launch-plan-json",
      launchPath
    ], {
      cwd: root,
      registry: createHarnessAdapterRegistry(),
      validateLaunchPlan() {}
    }),
    /no dispatch adapter is registered for harness missing/
  );
});
