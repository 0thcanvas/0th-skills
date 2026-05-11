#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isInvokedAsCli } from "./lib/cli.mjs";
import {
  resolveEvidencePaths,
  resolveGlobalEvidencePaths,
  resolveGlobalLinkPaths,
  resolveGlobalMemoryPaths,
  resolveGlobalSourcePaths,
  resolveGlobalStateDir,
  resolveMemoryPaths,
  resolveProjectIdentity,
  resolveProjectStateDir,
  resolveRepoStatePaths,
  resolveStateRoot,
  resolveTaskPaths
} from "./runtime-state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readJsonMaybe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function repoVersion(root = repoRoot) {
  const manifest = readJsonMaybe(path.join(root, ".codex-plugin", "plugin.json"));
  return manifest?.version ?? null;
}

function cacheVersions({
  homeDir = os.homedir()
} = {}) {
  const cacheRoot = path.join(homeDir, ".codex", "plugins", "cache", "mini-local", "0th-skills");
  if (!fs.existsSync(cacheRoot)) return [];
  return fs.readdirSync(cacheRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const cachePath = path.join(cacheRoot, entry.name);
      const manifest = readJsonMaybe(path.join(cachePath, ".codex-plugin", "plugin.json"));
      return {
        version: manifest?.version ?? entry.name,
        path: cachePath
      };
    })
    .sort((left, right) => left.version.localeCompare(right.version));
}

export function runMemoryDoctor({
  cwd = process.cwd(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const projectIdentity = resolveProjectIdentity({ cwd });
  const projectMemory = resolveMemoryPaths({ cwd, env, homeDir });
  const projectEvidence = resolveEvidencePaths({ cwd, env, homeDir });
  const projectTasks = resolveTaskPaths({ cwd, env, homeDir });
  const projectRepo = resolveRepoStatePaths({ cwd, env, homeDir });
  const globalMemory = resolveGlobalMemoryPaths({ env, homeDir });
  const globalEvidence = resolveGlobalEvidencePaths({ env, homeDir });
  const globalSources = resolveGlobalSourcePaths({ env, homeDir });
  const globalLinks = resolveGlobalLinkPaths({ env, homeDir });

  return {
    state_root: resolveStateRoot({ env, homeDir }),
    project: {
      repo_root: projectIdentity.repo_root,
      identity: projectIdentity.identity,
      project_key: projectIdentity.project_key,
      state_dir: resolveProjectStateDir({ cwd, env, homeDir }),
      memory_file: projectMemory.memoryFile,
      brief_file: projectMemory.briefFile,
      evidence_file: projectEvidence.evidenceFile,
      task_file: projectTasks.taskFile,
      task_brief_file: projectTasks.briefFile,
      repo_state_file: projectRepo.repoStateFile
    },
    global: {
      state_dir: resolveGlobalStateDir({ env, homeDir }),
      memory_file: globalMemory.memoryFile,
      brief_file: globalMemory.briefFile,
      evidence_file: globalEvidence.evidenceFile,
      source_root: globalSources.sourceRoot,
      source_index_file: globalSources.sourceIndexFile,
      link_file: globalLinks.linkFile
    },
    routing: {
      default_claim_scope: "repo",
      global_scope_claims: "global",
      global_scope_evidence: "global",
      explicit_path_overrides: true
    },
    plugin: {
      repo_version: repoVersion(),
      codex_cache_versions: cacheVersions({ homeDir })
    }
  };
}

function main() {
  process.stdout.write(`${JSON.stringify(runMemoryDoctor(), null, 2)}\n`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
