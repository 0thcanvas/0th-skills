import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "install-smoke-check.mjs");
const codexManifestPath = path.join(repoRoot, ".codex-plugin", "plugin.json");

test("install smoke-check validates the repo packaging", () => {
  const result = spawnSync("node", [scriptPath, "--repo-root", repoRoot], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Smoke check passed for version \d+\.\d+\.\d+/);
});

test("Codex manifest includes trust links and compact default prompts", () => {
  const manifest = JSON.parse(fs.readFileSync(codexManifestPath, "utf8"));

  assert.match(manifest.interface.privacyPolicyURL, /^https:\/\//);
  assert.match(manifest.interface.termsOfServiceURL, /^https:\/\//);
  assert.equal(manifest.interface.defaultPrompt.length, 3);

  for (const prompt of manifest.interface.defaultPrompt) {
    assert.ok(prompt.length <= 128, `default prompt exceeds UI budget: ${prompt}`);
  }
});
