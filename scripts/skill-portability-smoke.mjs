#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { isInvokedAsCli } from "./lib/cli.mjs";

function skillName(skillPath) {
  const source = fs.readFileSync(skillPath, "utf8");
  const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  const nameLine = frontmatter
    ?.split(/\r?\n/)
    .find((line) => /^name\s*:/.test(line));
  const name = nameLine
    ?.replace(/^name\s*:\s*/, "")
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();
  if (!name) throw new Error(`skill frontmatter name not found: ${skillPath}`);
  return name;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 30000,
    maxBuffer: 10 * 1024 * 1024
  });
}

function parseJsonLines(source) {
  return String(source ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function runSkillPortabilitySmoke({
  harness,
  command = "pi",
  prefixArgs = [],
  skillPaths,
  cwd = process.cwd(),
  configDir = null,
  timeoutMs = 30000
}) {
  if (harness !== "pi") throw new Error(`unsupported portability harness: ${harness}`);
  if (!Array.isArray(skillPaths) || skillPaths.length === 0) {
    throw new Error("at least one skill path is required");
  }
  const skills = skillPaths.map((skillPath) => {
    const resolvedPath = path.resolve(cwd, skillPath);
    if (!fs.existsSync(resolvedPath)) throw new Error(`skill does not exist: ${resolvedPath}`);
    return {
      name: skillName(resolvedPath),
      path: resolvedPath
    };
  });
  const isolatedConfigDir = configDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "0th-pi-smoke-"));
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: isolatedConfigDir,
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
    PI_OFFLINE: "1"
  };
  const versionResult = run(command, [...prefixArgs, "--version"], {
    cwd,
    env,
    timeoutMs
  });
  const args = [
    ...prefixArgs,
    "--mode",
    "rpc",
    "--no-session",
    "--no-context-files",
    "--no-extensions",
    "--no-skills",
    ...skills.flatMap((skill) => ["--skill", skill.path]),
    "--no-prompt-templates",
    "--no-tools"
  ];
  const rpcResult = run(command, args, {
    cwd,
    env,
    input: `${JSON.stringify({ id: "commands", type: "get_commands" })}\n`,
    timeoutMs
  });
  const records = parseJsonLines(rpcResult.stdout);
  const response = records.find(
    (record) => record.type === "response"
      && record.command === "get_commands"
      && record.success === true
  );
  const discovered = new Set(
    (response?.data?.commands ?? [])
      .filter((entry) => entry.source === "skill")
      .map((entry) => entry.name)
  );
  const failures = [];
  if ((versionResult.status ?? 1) !== 0) failures.push("runtime_version_unavailable");
  if ((rpcResult.status ?? 1) !== 0) failures.push("rpc_discovery_failed");
  if (!response) failures.push("get_commands_response_missing");
  const skillResults = skills.map((skill) => ({
    ...skill,
    loaded: discovered.has(`skill:${skill.name}`)
  }));
  for (const skill of skillResults) {
    if (!skill.loaded) failures.push(`skill_not_loaded:${skill.name}`);
  }
  return {
    schema_version: 1,
    harness,
    adapter: "pi-rpc-get-commands",
    runtime_version: String(versionResult.stdout ?? "").trim() || null,
    model_invoked: false,
    config_dir: isolatedConfigDir,
    skills: skillResults,
    outcome: failures.length === 0 ? "PASS" : "FAIL",
    failures: [...new Set(failures)]
  };
}

function parseArgs(argv) {
  const options = { prefixArgs: [], skillPaths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--harness") options.harness = argv[++index];
    else if (token === "--command") options.command = argv[++index];
    else if (token === "--prefix-arg") options.prefixArgs.push(argv[++index]);
    else if (token === "--skill") options.skillPaths.push(argv[++index]);
    else if (token === "--cwd") options.cwd = argv[++index];
    else if (token === "--config-dir") options.configDir = argv[++index];
    else if (token === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else throw new Error(`unknown portability option: ${token}`);
  }
  return options;
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    const result = runSkillPortabilitySmoke(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.outcome !== "PASS") process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
