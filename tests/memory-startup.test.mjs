import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildStartupPacket } from "../scripts/memory-startup.mjs";
import { runMemoryCommand } from "../scripts/memory.mjs";
import { appendMemoryClaim } from "../scripts/memory-write.mjs";
import { addOpenLoop } from "../scripts/open-loop.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "memory-startup-"));
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function withTempState(callback) {
  const previous = process.env.OTH_SKILLS_STATE_DIR;
  const stateRoot = path.join(tempDir(), "state");
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  try {
    return callback(stateRoot);
  } finally {
    if (previous === undefined) delete process.env.OTH_SKILLS_STATE_DIR;
    else process.env.OTH_SKILLS_STATE_DIR = previous;
  }
}

function initRepo() {
  const repo = tempDir();
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(repo, "README.md"), "test\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-m", "initial"]);
  return repo;
}

test("startup returns only task-relevant claims and open loops", () => withTempState(() => {
  const repo = initRepo();
  for (const claim of [
    "Memory startup should retrieve token optimization decisions.",
    "Token optimization keeps the skills kernel compact.",
    "Memory startup query results stay bounded.",
    "Restaurant delivery research tracks route pricing."
  ]) {
    appendMemoryClaim({
      cwd: repo,
      updateBrief: false,
      input: {
        type: "decision",
        claim,
        scope: "repo",
        evidence_path: "docs/decision.md",
        confidence: "high"
      }
    });
  }
  addOpenLoop({
    cwd: repo,
    updateBrief: false,
    input: {
      title: "Measure memory startup token savings",
      next_action: "Run the plugin evaluator after compacting startup.",
      priority: "P1",
      scope: "repo",
      evidence_path: "docs/eval.md"
    }
  });
  addOpenLoop({
    cwd: repo,
    updateBrief: false,
    input: {
      title: "Review restaurant delivery pricing",
      next_action: "Check delivery routes.",
      priority: "P2",
      scope: "repo",
      evidence_path: "docs/delivery.md"
    }
  });

  const packet = buildStartupPacket({
    cwd: repo,
    query: "memory startup token optimization",
    allowPull: false
  });

  assert.equal(packet.schema_version, 1);
  assert.equal(packet.repo.branch, "main");
  assert.equal(packet.repo.after_head.length, 40);
  assert.ok(packet.relevant_claims.length <= 3);
  assert.ok(packet.relevant_claims.every((entry) => !entry.snippet.includes("Restaurant")));
  assert.equal(packet.relevant_open_loops.length, 1);
  assert.match(packet.relevant_open_loops[0].snippet, /startup token/i);
  assert.equal(packet.paths.project_memory.endsWith("claims.jsonl"), true);
  assert.equal(packet.paths.open_loops.endsWith("open-loops.jsonl"), true);
  assert.match(packet.expand_hint, /memory\.mjs.*expand/);
}));

test("startup requires meaningful task keywords instead of broad empty recall", () => {
  assert.throws(() => buildStartupPacket({ cwd: tempDir(), query: "" }), /query is required/i);
});

test("startup packet remains compact and excludes generated brief contents", () => withTempState(() => {
  const repo = initRepo();
  const packet = buildStartupPacket({ cwd: repo, query: "token startup", allowPull: false });
  const serialized = JSON.stringify(packet);

  assert.ok(serialized.length < 6000, `startup packet should stay compact, got ${serialized.length} chars`);
  assert.equal(serialized.includes("changed_sources"), false);
  assert.equal(serialized.includes("previous_repo_state"), false);
  assert.equal(serialized.includes("Global Memory Brief"), false);
  assert.equal(serialized.includes("Project Memory Brief"), false);
}));

test("unified memory entrypoint exposes the startup packet", () => withTempState(() => {
  const repo = initRepo();
  assert.match(runMemoryCommand(["--help"], { cwd: repo }), /startup/);
  const packet = JSON.parse(runMemoryCommand([
    "startup",
    "--query",
    "memory startup",
    "--no-pull"
  ], { cwd: repo }));
  assert.equal(packet.schema_version, 1);
  assert.equal(packet.query, "memory startup");
}));

for (const [entrypoint, prefix, packetRepo] of [
  ["memory.mjs", ["startup", "--query", "startup authority"], (packet) => packet.repo],
  ["memory-startup.mjs", ["--query", "startup authority"], (packet) => packet.repo],
  ["session-preflight.mjs", [], (packet) => packet]
]) {
  test(`${entrypoint} CLI preserves a clean behind revision until --pull is explicit`, () => withTempState(() => {
    const repo = initRepo();
    const root = tempDir();
    const remote = path.join(root, "remote.git");
    const writer = path.join(root, "writer");
    const script = fileURLToPath(new URL(`../scripts/${entrypoint}`, import.meta.url));
    const before = git(repo, ["rev-parse", "HEAD"]);
    git(root, ["init", "--bare", "--initial-branch", "main", remote]);
    git(repo, ["remote", "add", "origin", remote]);
    git(repo, ["push", "-u", "origin", "main"]);
    git(root, ["clone", remote, writer]);
    git(writer, ["config", "user.email", "test@example.com"]);
    git(writer, ["config", "user.name", "Test User"]);
    fs.writeFileSync(path.join(writer, "README.md"), "remote update\n");
    git(writer, ["add", "README.md"]);
    git(writer, ["commit", "-m", "remote update"]);
    git(writer, ["push", "origin", "main"]);
    const after = git(writer, ["rev-parse", "HEAD"]);
    const invoke = (flags = []) => spawnSync(process.execPath, [script, ...prefix, ...flags], {
      cwd: repo, encoding: "utf8"
    });

    for (const flags of [[], ["--no-pull"]]) {
      const result = invoke(flags);
      assert.equal(result.status, 0, result.stderr);
      const preflight = packetRepo(JSON.parse(result.stdout));
      assert.equal(preflight.action, "fast_forward_available");
      assert.equal(preflight.behind, 1);
      assert.equal(git(repo, ["rev-parse", "HEAD"]), before);
      assert.equal(fs.readFileSync(path.join(repo, "README.md"), "utf8"), "test\n");
    }
    for (const flags of [["--pull", "--no-pull"], ["--no-pull", "--pull"]]) {
      const result = invoke(flags);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /--pull.*--no-pull.*conflict/i);
      assert.equal(git(repo, ["rev-parse", "HEAD"]), before);
    }
    const result = invoke(["--pull"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(packetRepo(JSON.parse(result.stdout)).action, "fast_forward_pulled");
    assert.equal(git(repo, ["rev-parse", "HEAD"]), after);
    assert.equal(fs.readFileSync(path.join(repo, "README.md"), "utf8"), "remote update\n");
  }));
}
