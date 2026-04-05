#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRepoRoot = path.resolve(__dirname, "..");

const expectedSkills = ["build", "debug", "plan", "research", "ship", "think"];
const expectedCodexAgents = [
  "0th-explorer.toml",
  "0th-implementer.toml",
  "0th-researcher.toml",
  "0th-reviewer.toml",
  "0th-test-runner.toml"
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    repoRoot: defaultRepoRoot,
    cacheRoot: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--repo-root") {
      options.repoRoot = path.resolve(argv[++index]);
      continue;
    }
    if (token === "--cache-root") {
      options.cacheRoot = path.resolve(argv[++index]);
      continue;
    }
    fail(`Unknown argument: ${token}`);
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing ${label}: ${filePath}`);
  }
}

function verifyPluginRoot(rootPath) {
  const codexManifestPath = path.join(rootPath, ".codex-plugin", "plugin.json");
  const claudeManifestPath = path.join(rootPath, ".claude-plugin", "plugin.json");

  assertFile(codexManifestPath, "Codex plugin manifest");
  assertFile(claudeManifestPath, "Claude plugin manifest");

  const codexManifest = readJson(codexManifestPath);
  const claudeManifest = readJson(claudeManifestPath);

  if (codexManifest.version !== claudeManifest.version) {
    fail(
      `Plugin manifest versions differ: Codex=${codexManifest.version}, Claude=${claudeManifest.version}`
    );
  }

  for (const skillName of expectedSkills) {
    assertFile(path.join(rootPath, "skills", skillName, "SKILL.md"), `${skillName} SKILL.md`);
    assertFile(
      path.join(rootPath, "skills", skillName, "agents", "openai.yaml"),
      `${skillName} openai.yaml`
    );
  }

  assertFile(path.join(rootPath, ".codex", "config.toml"), ".codex/config.toml");
  for (const fileName of expectedCodexAgents) {
    assertFile(path.join(rootPath, ".codex", "agents", fileName), `.codex/agents/${fileName}`);
  }

  return codexManifest.version;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoVersion = verifyPluginRoot(options.repoRoot);

  if (options.cacheRoot) {
    const cacheVersion = verifyPluginRoot(options.cacheRoot);
    if (cacheVersion !== repoVersion) {
      fail(`Installed cache version ${cacheVersion} does not match repo version ${repoVersion}.`);
    }
  }

  process.stdout.write(
    `Smoke check passed for version ${repoVersion}${options.cacheRoot ? " (repo + installed cache)" : " (repo)"}.\n`
  );
}

main();
