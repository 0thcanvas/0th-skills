import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { packageRuntimePlugin } from "../scripts/package-runtime-plugin.mjs";

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
