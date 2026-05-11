import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/\.git$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";
}

function repoNameFromIdentity(identity) {
  const normalized = String(identity)
    .replace(/\.git$/i, "")
    .replace(/[?#].*$/, "");
  const last = normalized.split(/[/:\\]/).filter(Boolean).at(-1);
  return slugify(last || "project");
}

function stableIdentity(identity) {
  const raw = String(identity);
  try {
    const url = new URL(raw);
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

function hashIdentity(identity) {
  return crypto.createHash("sha256").update(String(identity)).digest("hex").slice(0, 12);
}

export function resolveStateRoot({
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  if (env.OTH_SKILLS_STATE_DIR) {
    return path.resolve(env.OTH_SKILLS_STATE_DIR);
  }
  if (env.XDG_STATE_HOME) {
    return path.join(env.XDG_STATE_HOME, "0th-skills");
  }
  return path.join(homeDir, ".0th", "skills");
}

export function resolveProjectIdentity({
  cwd = process.cwd()
} = {}) {
  const repoRoot = runGit(cwd, ["rev-parse", "--show-toplevel"]) || path.resolve(cwd);
  const originUrl = runGit(repoRoot, ["remote", "get-url", "origin"]);
  const identity = originUrl ? stableIdentity(originUrl) : repoRoot;
  const slug = repoNameFromIdentity(identity);

  return {
    repo_root: repoRoot,
    identity,
    project_key: `${slug}-${hashIdentity(identity)}`
  };
}

export function resolveProjectStateDir({
  cwd = process.cwd(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const { project_key } = resolveProjectIdentity({ cwd });
  return path.join(resolveStateRoot({ env, homeDir }), "projects", project_key);
}

export function resolveMemoryPaths({
  cwd = process.cwd(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const projectDir = resolveProjectStateDir({ cwd, env, homeDir });
  return {
    memoryFile: path.join(projectDir, "memory", "claims.jsonl"),
    briefFile: path.join(projectDir, "memory", "brief.md")
  };
}

export function resolveEvidencePaths({
  cwd = process.cwd(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const projectDir = resolveProjectStateDir({ cwd, env, homeDir });
  return {
    evidenceFile: path.join(projectDir, "evidence", "events.jsonl")
  };
}

export function resolveRepoStatePaths({
  cwd = process.cwd(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const projectDir = resolveProjectStateDir({ cwd, env, homeDir });
  return {
    repoStateFile: path.join(projectDir, "repo", "state.json")
  };
}

export function resolveTaskPaths({
  cwd = process.cwd(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const projectDir = resolveProjectStateDir({ cwd, env, homeDir });
  return {
    taskFile: path.join(projectDir, "tasks", "open-loops.jsonl"),
    briefFile: path.join(projectDir, "tasks", "brief.md")
  };
}

export function resolveAllProjectStateDirs({
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const projectsRoot = path.join(resolveStateRoot({ env, homeDir }), "projects");
  const projectDirs = fs.existsSync(projectsRoot)
    ? fs.readdirSync(projectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(projectsRoot, entry.name))
      .sort()
    : [];
  return {
    projectsRoot,
    projectDirs
  };
}
