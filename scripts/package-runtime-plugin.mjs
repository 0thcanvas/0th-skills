#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { isInvokedAsCli } from "./lib/cli.mjs";

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

export function packageRuntimePlugin({
  sourceRoot = process.cwd(),
  outputRoot,
  force = false
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
  const runtimeInventory = inventory(output);

  return {
    source_root: source,
    output_root: output,
    copied_file_count: runtimeInventory.file_count,
    excluded_file_count: sourceInventory.file_count - runtimeInventory.file_count,
    source_estimated_tokens: sourceInventory.estimated_tokens,
    runtime_estimated_tokens: runtimeInventory.estimated_tokens
  };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source") options.sourceRoot = argv[++index];
    else if (token === "--output") options.outputRoot = argv[++index];
    else if (token === "--force") options.force = true;
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
