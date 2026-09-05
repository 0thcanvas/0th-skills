#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { resolveStateRoot } from "./runtime-state.mjs";

const EXCLUDED_EXACT = new Set([
  ".git",
  ".gitignore",
  "README.md",
  "FEEDBACK.md",
  "FEEDBACK.example.md"
]);

const EXCLUDED_TREES = [
  "tests",
  "verification-report",
  "docs/decisions",
  "docs/evals",
  "docs/plans"
];

function normalizedRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function isExcluded(relativePath) {
  if (EXCLUDED_EXACT.has(relativePath)) return true;
  return EXCLUDED_TREES.some((tree) => relativePath === tree || relativePath.startsWith(`${tree}/`));
}

function inventory(root, { exclude = false } = {}) {
  let fileCount = 0;
  let characterCount = 0;
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = normalizedRelative(root, absolute);
      if (exclude && isExcluded(relative)) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        fileCount += 1;
        characterCount += fs.readFileSync(absolute, "utf8").length;
      }
    }
  }
  walk(root);
  return {
    file_count: fileCount,
    estimated_tokens: Math.ceil(characterCount / 4)
  };
}

export function currentRuntimeLinkPath({
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  return path.join(resolveStateRoot({ env, homeDir }), "runtime", "current");
}

function linkResolvesTo(linkPath, targetPath) {
  try {
    return fs.realpathSync(linkPath) === fs.realpathSync(targetPath);
  } catch {
    return false;
  }
}

// Authoring keeps host-specific entry points separate. Distributions expose one
// standard skills tree, preserving workflow-relative resources in place.
function normalizeSkillLayout(root) {
  const manifestPath = path.join(root, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.skills === "./codex-skills/") {
    const wrappers = path.join(root, "codex-skills");
    const names = (directory) => fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    if (JSON.stringify(names(wrappers)) !== JSON.stringify(names(path.join(root, "skills")))) {
      throw new Error("Cannot package divergent shared skills and entry points");
    }
    for (const entry of fs.readdirSync(wrappers, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, "skills", entry.name);
      const skill = path.join(directory, "SKILL.md");
      const workflow = path.join(directory, "WORKFLOW.md");
      const originalLink = `../../skills/${entry.name}/SKILL.md`;
      const wrapper = fs.readFileSync(path.join(wrappers, entry.name, "SKILL.md"), "utf8");
      if (!wrapper.includes(`](${originalLink})`) || fs.existsSync(workflow)) {
        throw new Error(`Cannot package shared workflow for ${entry.name}`);
      }
      fs.renameSync(skill, workflow);
      fs.writeFileSync(skill, wrapper.replace(`](${originalLink})`, "](./WORKFLOW.md)"));
    }
    fs.rmSync(wrappers, { recursive: true });
    manifest.skills = "./skills/";
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const cursorManifestPath = path.join(root, ".cursor-plugin", "plugin.json");
  if (!fs.existsSync(cursorManifestPath)) {
    const { name, version, description, author, homepage, repository, license, keywords } = manifest;
    fs.mkdirSync(path.dirname(cursorManifestPath), { recursive: true });
    fs.writeFileSync(cursorManifestPath, `${JSON.stringify({
      name, version, description, author, homepage, repository, license, keywords,
      skills: "./skills/",
      // Native agent tool bindings remain owned by their harness adapters.
      agents: [], commands: []
    }, null, 2)}\n`);
  }
}

export function packageRuntimePlugin({
  sourceRoot = process.cwd(),
  outputRoot,
  force = false,
  registerCurrent = false,
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const source = path.resolve(sourceRoot);
  if (!outputRoot) throw new Error("runtime package output is required");
  const output = path.resolve(outputRoot);
  if (output === source || output.startsWith(`${source}${path.sep}`)) {
    throw new Error("runtime package output must be outside the source root");
  }
  if (!fs.existsSync(path.join(source, ".codex-plugin", "plugin.json"))) {
    throw new Error(`source is not a Codex plugin root: ${source}`);
  }
  if (fs.existsSync(output)) {
    const runtimeLink = currentRuntimeLinkPath({ env, homeDir });
    if (linkResolvesTo(runtimeLink, output)) {
      throw new Error(
        `refusing to overwrite the currently registered runtime; choose a fresh output path: ${output}`
      );
    }
    if (!force) throw new Error(`runtime package output already exists: ${output}`);
    fs.rmSync(output, { recursive: true, force: true });
  }

  const sourceInventory = inventory(source);
  fs.cpSync(source, output, {
    recursive: true,
    preserveTimestamps: true,
    filter(candidate) {
      if (candidate === source) return true;
      return !isExcluded(normalizedRelative(source, candidate));
    }
  });
  normalizeSkillLayout(output);
  const runtimeInventory = inventory(output);
  const runtimeLink = registerCurrent
    ? registerCurrentRuntime({ runtimeRoot: output, env, homeDir })
    : null;

  return {
    source_root: source,
    output_root: output,
    copied_file_count: runtimeInventory.file_count,
    excluded_file_count: sourceInventory.file_count - runtimeInventory.file_count,
    source_estimated_tokens: sourceInventory.estimated_tokens,
    runtime_estimated_tokens: runtimeInventory.estimated_tokens,
    runtime_link: runtimeLink
  };
}

export function registerCurrentRuntime({
  runtimeRoot,
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const runtime = path.resolve(runtimeRoot);
  const dispatcher = path.join(runtime, "scripts", "0th.mjs");
  if (!fs.existsSync(dispatcher)) {
    throw new Error(`runtime dispatcher is missing: ${dispatcher}`);
  }

  const linkPath = currentRuntimeLinkPath({ env, homeDir });
  fs.mkdirSync(path.dirname(linkPath), { recursive: true, mode: 0o700 });
  if (fs.existsSync(linkPath) && !fs.lstatSync(linkPath).isSymbolicLink()) {
    throw new Error(`runtime link path exists and is not a symlink: ${linkPath}`);
  }

  const temporaryLink = `${linkPath}.tmp-${process.pid}`;
  fs.rmSync(temporaryLink, { force: true });
  fs.symlinkSync(runtime, temporaryLink, "dir");
  fs.renameSync(temporaryLink, linkPath);
  return linkPath;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source") options.sourceRoot = argv[++index];
    else if (token === "--output") options.outputRoot = argv[++index];
    else if (token === "--force") options.force = true;
    else if (token === "--register-current") options.registerCurrent = true;
    else throw new Error(`Unknown runtime package option: ${token}`);
  }
  return options;
}

function main() {
  const result = packageRuntimePlugin(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
