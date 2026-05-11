import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  resolveGlobalEvidencePaths,
  resolveGlobalLinkPaths,
  resolveGlobalMemoryPaths,
  resolveGlobalSourcePaths,
  resolveGlobalStateDir,
  resolveMemoryPaths,
  resolveProjectStateDir,
  resolveTaskPaths
} from "../scripts/runtime-state.mjs";

function tempDir(prefix = "0th-runtime-state-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function git(repo, args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function initRepoWithRemote(remoteUrl) {
  const repo = tempDir();
  git(repo, ["init", "-q"]);
  git(repo, ["remote", "add", "origin", remoteUrl]);
  return repo;
}

test("Memory v2 default paths live in user state, not the target repo checkout", () => {
  const repo = tempDir();
  const stateRoot = path.join(tempDir(), "state");
  const env = { OTH_SKILLS_STATE_DIR: stateRoot };

  const memory = resolveMemoryPaths({ cwd: repo, env });
  const tasks = resolveTaskPaths({ cwd: repo, env });

  assert.ok(memory.memoryFile.startsWith(stateRoot));
  assert.ok(memory.briefFile.startsWith(stateRoot));
  assert.ok(tasks.taskFile.startsWith(stateRoot));
  assert.ok(tasks.briefFile.startsWith(stateRoot));
  assert.equal(memory.memoryFile.startsWith(path.join(repo, ".0th")), false);
  assert.equal(tasks.taskFile.startsWith(path.join(repo, ".0th")), false);
});

test("project state directory is stable across checkouts with the same origin remote", () => {
  const stateRoot = path.join(tempDir(), "state");
  const env = { OTH_SKILLS_STATE_DIR: stateRoot };
  const remote = "git@github.com:0thcanvas/example-product.git";
  const first = initRepoWithRemote(remote);
  const second = initRepoWithRemote(remote);

  const firstDir = resolveProjectStateDir({ cwd: first, env });
  const secondDir = resolveProjectStateDir({ cwd: second, env });

  assert.equal(firstDir, secondDir);
  assert.match(path.basename(firstDir), /^example-product-[a-f0-9]{12}$/);
});

test("different remotes get distinct project state directories", () => {
  const stateRoot = path.join(tempDir(), "state");
  const env = { OTH_SKILLS_STATE_DIR: stateRoot };
  const first = initRepoWithRemote("git@github.com:0thcanvas/one.git");
  const second = initRepoWithRemote("git@github.com:0thcanvas/two.git");

  assert.notEqual(
    resolveProjectStateDir({ cwd: first, env }),
    resolveProjectStateDir({ cwd: second, env })
  );
});

test("credentialed HTTPS remotes resolve to the same project state as clean HTTPS remotes", () => {
  const stateRoot = path.join(tempDir(), "state");
  const env = { OTH_SKILLS_STATE_DIR: stateRoot };
  const clean = initRepoWithRemote("https://github.com/0thcanvas/example-product.git");
  const credentialed = initRepoWithRemote("https://user:token@github.com/0thcanvas/example-product.git");

  assert.equal(
    resolveProjectStateDir({ cwd: clean, env }),
    resolveProjectStateDir({ cwd: credentialed, env })
  );
});

test("global Memory v2 paths live under the shared global brain", () => {
  const stateRoot = path.join(tempDir(), "state");
  const env = { OTH_SKILLS_STATE_DIR: stateRoot };

  const globalDir = resolveGlobalStateDir({ env });
  const memory = resolveGlobalMemoryPaths({ env });
  const evidence = resolveGlobalEvidencePaths({ env });
  const sources = resolveGlobalSourcePaths({ env });
  const links = resolveGlobalLinkPaths({ env });

  assert.equal(globalDir, path.join(stateRoot, "global"));
  assert.deepEqual(memory, {
    memoryFile: path.join(stateRoot, "global", "memory", "claims.jsonl"),
    briefFile: path.join(stateRoot, "global", "memory", "brief.md")
  });
  assert.deepEqual(evidence, {
    evidenceFile: path.join(stateRoot, "global", "evidence", "events.jsonl")
  });
  assert.deepEqual(sources, {
    sourceRoot: path.join(stateRoot, "global", "sources"),
    sourceIndexFile: path.join(stateRoot, "global", "sources", "index.jsonl")
  });
  assert.deepEqual(links, {
    linkFile: path.join(stateRoot, "global", "links", "links.jsonl")
  });
});

test("scope global routes memory paths to the global brain instead of the current project", () => {
  const repo = initRepoWithRemote("git@github.com:0thcanvas/example-product.git");
  const stateRoot = path.join(tempDir(), "state");
  const env = { OTH_SKILLS_STATE_DIR: stateRoot };

  const projectMemory = resolveMemoryPaths({ cwd: repo, env });
  const globalMemory = resolveMemoryPaths({ cwd: repo, env, scope: "global" });

  assert.ok(projectMemory.memoryFile.includes(`${path.sep}projects${path.sep}`));
  assert.equal(globalMemory.memoryFile, path.join(stateRoot, "global", "memory", "claims.jsonl"));
  assert.equal(globalMemory.briefFile, path.join(stateRoot, "global", "memory", "brief.md"));
});
