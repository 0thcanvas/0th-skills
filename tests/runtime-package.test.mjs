import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  currentRuntimeLinkPath,
  packageRuntimePlugin,
  registerCurrentRuntime
} from "../scripts/package-runtime-plugin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("runtime package keeps executable plugin surfaces and omits repository-only files", () => {
  const outputRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "0th-runtime-package-")), "plugin");
  const result = packageRuntimePlugin({ sourceRoot: repoRoot, outputRoot });

  for (const relative of [
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    "CLAUDE.md",
    "codex-skills/build/SKILL.md",
    "skills/build/SKILL.md",
    "references/skills-kernel.md",
    "references/delegation.md",
    "scripts/memory.mjs",
    "scripts/memory-startup.mjs",
    "scripts/install-smoke-check.mjs",
    "protocol/schemas/task-spec.schema.json",
    "agents/verifier.md",
    ".codex/agents/0th-verifier.toml",
    "docs/decisions/2026-05-03-skill-incident-log.md"
  ]) {
    assert.equal(fs.existsSync(path.join(outputRoot, relative)), true, `${relative} should ship`);
  }

  for (const relative of [
    "tests",
    "verification-report",
    "docs/evals",
    "docs/plans",
    "README.md",
    "FEEDBACK.md",
    "FEEDBACK.example.md",
    ".git"
  ]) {
    assert.equal(fs.existsSync(path.join(outputRoot, relative)), false, `${relative} should be excluded`);
  }

  assert.ok(result.copied_file_count > 0);
  assert.ok(result.excluded_file_count > 0);
  assert.ok(result.runtime_estimated_tokens < result.source_estimated_tokens);

  const smoke = spawnSync(process.execPath, [
    path.join(outputRoot, "scripts", "install-smoke-check.mjs"),
    "--repo-root",
    outputRoot
  ], { encoding: "utf8" });
  assert.equal(smoke.status, 0, smoke.stderr || smoke.stdout);
});

test("runtime packager refuses to overwrite or recurse into the source", () => {
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), "0th-runtime-existing-"));
  assert.throws(() => packageRuntimePlugin({ sourceRoot: repoRoot, outputRoot: existing }), /already exists/i);
  assert.throws(
    () => packageRuntimePlugin({ sourceRoot: repoRoot, outputRoot: path.join(repoRoot, "runtime-dist") }),
    /outside the source root/i
  );
});

test("runtime packager registers a stable current link for shell consumers", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "0th-runtime-current-"));
  const outputRoot = path.join(temporaryRoot, "plugin");
  const homeDir = path.join(temporaryRoot, "home");

  const result = packageRuntimePlugin({
    sourceRoot: repoRoot,
    outputRoot,
    registerCurrent: true,
    env: {},
    homeDir
  });

  const runtimeLink = path.join(homeDir, ".0th", "skills", "runtime", "current");
  assert.equal(result.runtime_link, runtimeLink);
  assert.equal(fs.realpathSync(runtimeLink), fs.realpathSync(outputRoot));
  assert.equal(fs.existsSync(path.join(runtimeLink, "scripts", "0th.mjs")), true);
});

test("runtime packager refuses to overwrite the currently registered runtime", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "0th-runtime-live-"));
  const outputRoot = path.join(temporaryRoot, "plugin-v1");
  const homeDir = path.join(temporaryRoot, "home");
  const options = {
    sourceRoot: repoRoot,
    outputRoot,
    registerCurrent: true,
    env: {},
    homeDir
  };

  packageRuntimePlugin(options);
  assert.throws(
    () => packageRuntimePlugin({ ...options, force: true, registerCurrent: false }),
    /currently registered runtime/i
  );
  assert.equal(fs.existsSync(path.join(outputRoot, "scripts", "0th.mjs")), true);
});

test("runtime registration switches from a complete v1 package to a complete v2 package", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "0th-runtime-switch-"));
  const homeDir = path.join(temporaryRoot, "home");
  const sharedOptions = { sourceRoot: repoRoot, registerCurrent: true, env: {}, homeDir };
  const outputV1 = path.join(temporaryRoot, "plugin-v1");
  const outputV2 = path.join(temporaryRoot, "plugin-v2");

  packageRuntimePlugin({ ...sharedOptions, outputRoot: outputV1 });
  packageRuntimePlugin({ ...sharedOptions, outputRoot: outputV2 });

  const runtimeLink = currentRuntimeLinkPath({ env: {}, homeDir });
  assert.equal(fs.realpathSync(runtimeLink), fs.realpathSync(outputV2));
  assert.equal(fs.existsSync(path.join(runtimeLink, "scripts", "0th.mjs")), true);
  assert.equal(fs.existsSync(path.join(outputV1, "scripts", "0th.mjs")), true);
});

test("runtime registration refuses to replace a non-link user path", () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "0th-runtime-path-"));
  const homeDir = path.join(temporaryRoot, "home");
  const outputRoot = path.join(temporaryRoot, "plugin");
  packageRuntimePlugin({ sourceRoot: repoRoot, outputRoot });
  const runtimeLink = currentRuntimeLinkPath({ env: {}, homeDir });
  fs.mkdirSync(runtimeLink, { recursive: true });

  assert.throws(
    () => registerCurrentRuntime({ runtimeRoot: outputRoot, env: {}, homeDir }),
    /not a symlink/i
  );
});
