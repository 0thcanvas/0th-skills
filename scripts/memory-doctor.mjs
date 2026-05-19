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

function exists(filePath) {
  return fs.existsSync(filePath);
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
  const readiness = {
    project_state_dir_exists: exists(resolveProjectStateDir({ cwd, env, homeDir })),
    project_memory_file_exists: exists(projectMemory.memoryFile),
    project_brief_file_exists: exists(projectMemory.briefFile),
    project_evidence_file_exists: exists(projectEvidence.evidenceFile),
    project_task_file_exists: exists(projectTasks.taskFile),
    project_repo_state_file_exists: exists(projectRepo.repoStateFile),
    global_state_dir_exists: exists(resolveGlobalStateDir({ env, homeDir })),
    global_memory_file_exists: exists(globalMemory.memoryFile),
    global_brief_file_exists: exists(globalMemory.briefFile),
    global_evidence_file_exists: exists(globalEvidence.evidenceFile),
    global_source_index_file_exists: exists(globalSources.sourceIndexFile)
  };
  readiness.subsystems = {
    project_claims_ready: readiness.project_memory_file_exists,
    project_tasks_ready: readiness.project_task_file_exists,
    project_evidence_ready: readiness.project_evidence_file_exists,
    project_repo_state_ready: readiness.project_repo_state_file_exists,
    global_claims_ready: readiness.global_memory_file_exists,
    global_evidence_ready: readiness.global_evidence_file_exists,
    source_packs_ready: readiness.global_source_index_file_exists
  };
  readiness.claim_recall_ready = Boolean(
    readiness.project_memory_file_exists &&
    readiness.global_memory_file_exists
  );
  readiness.recall_ready = Boolean(
    readiness.project_memory_file_exists &&
    readiness.project_task_file_exists &&
    readiness.global_memory_file_exists
  );

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
    },
    readiness
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
