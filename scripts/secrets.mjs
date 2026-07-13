#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { isInvokedAsCli } from "./lib/cli.mjs";

const DEFAULT_MANIFEST = ".0th-secrets.json";
const FORBIDDEN_WALLET_VARIABLE = /(?:^|_)(?:SEED|SEED_PHRASE|MNEMONIC|PRIVATE_KEY|RECOVERY_PHRASE)(?:_|$)/i;

function gitOutput(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function repositoryRoots(cwd) {
  const worktreeRoot = fs.realpathSync(gitOutput(cwd, ["rev-parse", "--show-toplevel"]));
  const commonDirectory = fs.realpathSync(
    gitOutput(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
  );
  if (path.basename(commonDirectory) !== ".git") {
    throw new Error(`expected Git common directory to end in .git: ${commonDirectory}`);
  }
  return { worktreeRoot, storageRoot: path.dirname(commonDirectory) };
}

function safeRelativePath(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty relative path`);
  if (path.isAbsolute(value)) throw new Error(`${label} must be relative to the project cache root`);
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${label} must not traverse outside the project cache root`);
  }
  return normalized;
}

function assertOwnerOnlyRegularFile(filePath, label) {
  let metadata;
  try {
    metadata = fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${label} is missing: ${filePath}`);
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error(`${label} must be a regular file, not a symlink or special file: ${filePath}`);
  }
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the current user: ${filePath}`);
  }
  if ((metadata.mode & 0o777) !== 0o600) {
    throw new Error(`${label} must have owner-only permissions (expected 600): ${filePath}`);
  }
}

function assertIgnored(filePath, storageRoot) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", filePath], {
      cwd: storageRoot,
      stdio: ["ignore", "ignore", "pipe"]
    });
  } catch {
    throw new Error(`secret environment path is not ignored by Git: ${filePath}`);
  }
}

export function validateReferenceTemplate(source) {
  const variables = [];
  for (const [index, rawLine] of String(source).split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{\{\s*(op:\/\/[^}]+?)\s*\}\}$/.exec(line);
    if (!match) throw new Error(`reference template line ${index + 1} must contain one op:// reference`);
    const variable = match[1];
    if (FORBIDDEN_WALLET_VARIABLE.test(variable)) {
      throw new Error(`wallet material or private key variable is forbidden in project environments: ${variable}`);
    }
    variables.push(variable);
  }
  if (!variables.length) throw new Error("reference template must declare at least one variable");
  if (new Set(variables).size !== variables.length) throw new Error("reference template contains duplicate variable names");
  return variables;
}

export function loadSecretsManifest({ cwd = process.cwd(), manifestPath = DEFAULT_MANIFEST } = {}) {
  const roots = repositoryRoots(cwd);
  const absoluteManifest = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(roots.worktreeRoot, safeRelativePath(manifestPath, "manifest path"));
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absoluteManifest, "utf8"));
  } catch (error) {
    throw new Error(`cannot load secrets manifest ${absoluteManifest}: ${error.message}`);
  }
  if (parsed?.schema_version !== 1 || !parsed.environments || typeof parsed.environments !== "object") {
    throw new Error("secrets manifest requires schema_version 1 and an environments object");
  }
  const environments = {};
  for (const [name, definition] of Object.entries(parsed.environments)) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`invalid environment name: ${name}`);
    const references = path.join(roots.storageRoot, safeRelativePath(definition?.references, `${name}.references`));
    const output = path.join(roots.storageRoot, safeRelativePath(definition?.output, `${name}.output`));
    if (references === output) throw new Error(`${name} references and output paths must differ`);
    environments[name] = { references, output };
  }
  if (!Object.keys(environments).length) throw new Error("secrets manifest must declare at least one environment");
  return { path: absoluteManifest, roots, environments };
}

function selectEnvironments(manifest, names) {
  const selected = !names?.length || names.includes("all") ? Object.keys(manifest.environments) : names;
  for (const name of selected) {
    if (!manifest.environments[name]) throw new Error(`unknown secret environment: ${name}`);
  }
  return selected;
}

export function secretPaths({ cwd = process.cwd(), manifestPath, names } = {}) {
  const manifest = loadSecretsManifest({ cwd, manifestPath });
  return selectEnvironments(manifest, names).map(name => ({ name, ...manifest.environments[name] }));
}

export function checkSecrets({ cwd = process.cwd(), manifestPath, names } = {}) {
  const manifest = loadSecretsManifest({ cwd, manifestPath });
  for (const name of selectEnvironments(manifest, names)) {
    const environment = manifest.environments[name];
    assertOwnerOnlyRegularFile(environment.output, `${name} generated environment`);
    assertIgnored(environment.output, manifest.roots.storageRoot);
  }
  return true;
}

export function syncSecrets({
  cwd = process.cwd(),
  manifestPath,
  names,
  inject = execFileSync
} = {}) {
  const manifest = loadSecretsManifest({ cwd, manifestPath });
  for (const name of selectEnvironments(manifest, names)) {
    const environment = manifest.environments[name];
    assertOwnerOnlyRegularFile(environment.references, `${name} reference template`);
    assertIgnored(environment.references, manifest.roots.storageRoot);
    assertIgnored(environment.output, manifest.roots.storageRoot);
    validateReferenceTemplate(fs.readFileSync(environment.references, "utf8"));
    const temporaryDirectory = fs.mkdtempSync(
      path.join(path.dirname(environment.output), `${path.basename(environment.output)}.tmp-`)
    );
    const temporaryOutput = path.join(temporaryDirectory, "environment");
    assertIgnored(temporaryOutput, manifest.roots.storageRoot);
    try {
      inject("op", [
        "inject",
        "--in-file", environment.references,
        "--out-file", temporaryOutput,
        "--file-mode", "0600"
      ], { cwd: manifest.roots.worktreeRoot, stdio: "inherit" });
      fs.chmodSync(temporaryOutput, 0o600);
      assertOwnerOnlyRegularFile(temporaryOutput, `${name} generated environment`);
      fs.renameSync(temporaryOutput, environment.output);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }
  return true;
}

export function cleanSecrets({ cwd = process.cwd(), manifestPath, names } = {}) {
  const manifest = loadSecretsManifest({ cwd, manifestPath });
  for (const name of selectEnvironments(manifest, names)) {
    fs.rmSync(manifest.environments[name].output, { force: true });
  }
  return true;
}

function parseCommandArgs(args) {
  const options = { names: [] };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--manifest") options.manifestPath = args[++index];
    else if (token.startsWith("-")) throw new Error(`unknown secrets option: ${token}`);
    else options.names.push(token);
  }
  return options;
}

export function runSecretsCommand(argv, {
  cwd = process.cwd(),
  write = line => process.stdout.write(`${line}\n`),
  inject
} = {}) {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    write("Usage: 0th secrets <paths|output|check|sync|clean> [environment|all] [--manifest path]");
    return 0;
  }
  const options = { cwd, ...parseCommandArgs(args) };
  if (command === "paths") {
    for (const item of secretPaths(options)) write(`${item.name}: references ${item.references}; output ${item.output}`);
  } else if (command === "output") {
    const items = secretPaths(options);
    if (items.length !== 1) throw new Error("output requires exactly one environment name");
    write(items[0].output);
  } else if (command === "check") {
    checkSecrets(options);
    for (const item of secretPaths(options)) write(`${item.name}: generated environment is present, ignored, and owner-only`);
  } else if (command === "sync") {
    syncSecrets({ ...options, inject });
    for (const item of secretPaths(options)) write(`${item.name}: synchronized local development environment`);
  } else if (command === "clean") {
    cleanSecrets(options);
    for (const item of secretPaths(options)) write(`${item.name}: removed generated local environment`);
  } else {
    throw new Error(`unknown secrets command: ${command}`);
  }
  return 0;
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    process.exitCode = runSecretsCommand(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`0th secrets: ${error.message}\n`);
    process.exitCode = 1;
  }
}
