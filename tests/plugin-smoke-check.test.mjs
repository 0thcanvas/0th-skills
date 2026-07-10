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
const codexSkillsRoot = path.join(repoRoot, "codex-skills");
const claudeMarketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
const readmePath = path.join(repoRoot, "README.md");
const licensePath = path.join(repoRoot, "LICENSE");

function estimateTokenCount(text) {
  return text ? Math.ceil(text.length / 4) : 0;
}

function readCodexSkillDescription(skillName) {
  const source = fs.readFileSync(path.join(codexSkillsRoot, skillName, "SKILL.md"), "utf8");
  const match = source.match(/^description:\s*"([^"]+)"/m);
  assert.ok(match, `${skillName} should declare a Codex description`);
  return match[1];
}

function readCodexSkillSource(skillName) {
  return fs.readFileSync(path.join(codexSkillsRoot, skillName, "SKILL.md"), "utf8");
}

test("install smoke-check validates the repo packaging", () => {
  const result = spawnSync("node", [scriptPath, "--repo-root", repoRoot], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Smoke check passed for version \d+\.\d+\.\d+/);
});

test("Codex manifest includes trust links and compact default prompts", () => {
  const manifest = JSON.parse(fs.readFileSync(codexManifestPath, "utf8"));

  assert.equal(manifest.license, "MIT");
  assert.match(fs.readFileSync(licensePath, "utf8"), /MIT License/);
  assert.match(manifest.interface.privacyPolicyURL, /^https:\/\//);
  assert.match(manifest.interface.termsOfServiceURL, /^https:\/\//);
  assert.equal(manifest.interface.defaultPrompt.length, 3);

  for (const prompt of manifest.interface.defaultPrompt) {
    assert.ok(prompt.length <= 128, `default prompt exceeds UI budget: ${prompt}`);
  }
});

test("Codex trigger metadata stays within the plugin-eval moderate budget", () => {
  const manifest = JSON.parse(fs.readFileSync(codexManifestPath, "utf8"));
  const skillNames = fs.readdirSync(codexSkillsRoot)
    .filter((entry) => fs.statSync(path.join(codexSkillsRoot, entry)).isDirectory())
    .sort();
  const triggerTexts = [
    manifest.description,
    manifest.interface.defaultPrompt.join("\n"),
    ...skillNames.map(readCodexSkillDescription),
  ];
  const triggerBudget = triggerTexts.reduce((total, text) => total + estimateTokenCount(text), 0);

  assert.ok(
    triggerBudget <= 170,
    `Codex trigger metadata should stay compact enough for plugin-eval: ${triggerBudget} tokens`
  );
});

test("Codex invocation metadata stays compact", () => {
  const manifestSource = fs.readFileSync(codexManifestPath, "utf8");
  const skillNames = fs.readdirSync(codexSkillsRoot)
    .filter((entry) => fs.statSync(path.join(codexSkillsRoot, entry)).isDirectory())
    .sort();
  const invokeBudget = [
    manifestSource,
    ...skillNames.map(readCodexSkillSource),
  ].reduce((total, text) => total + estimateTokenCount(text), 0);

  assert.ok(
    invokeBudget <= 1200,
    `Codex invocation metadata should stay compact enough for plugin-eval: ${invokeBudget} tokens`
  );
});

test("published docs describe the current nine-skill surface", () => {
  const readme = fs.readFileSync(readmePath, "utf8");
  const marketplace = JSON.parse(fs.readFileSync(claudeMarketplacePath, "utf8"));
  const marketplaceDescription = marketplace.plugins[0].description;

  assert.match(readme, /nine skills under `codex-skills\/`/);
  assert.doesNotMatch(readme, /\bten skills under `codex-skills\/`/i);
  assert.match(marketplaceDescription, /\b9 workflow skills\b/);
  assert.doesNotMatch(marketplaceDescription, /\b5 core workflow skills\b/i);
});
