import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runSkillPortabilitySmoke } from "../scripts/skill-portability-smoke.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function fakePi({ commands }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fake-pi-"));
  const script = path.join(root, "fake-pi.mjs");
  fs.writeFileSync(script, `
if (process.argv.includes("--version")) {
  process.stdout.write("pi-test 1.0.0\\n");
  process.exit(0);
}
process.stdin.resume();
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({
    id: "commands",
    type: "response",
    command: "get_commands",
    success: true,
    data: { commands: ${JSON.stringify(commands)} }
  }) + "\\n");
});
`);
  return {
    command: process.execPath,
    prefixArgs: [script]
  };
}

test("Pi portability smoke proves exact requested skills were discovered without a model call", () => {
  const fake = fakePi({
    commands: [
      {
        name: "skill:build",
        source: "skill",
        location: "path",
        path: path.join(repoRoot, "skills/build/SKILL.md")
      },
      {
        name: "skill:think",
        source: "skill",
        location: "path",
        path: path.join(repoRoot, "skills/think/SKILL.md")
      }
    ]
  });
  const result = runSkillPortabilitySmoke({
    harness: "pi",
    command: fake.command,
    prefixArgs: fake.prefixArgs,
    skillPaths: [
      path.join(repoRoot, "skills/build/SKILL.md"),
      path.join(repoRoot, "skills/think/SKILL.md")
    ],
    cwd: repoRoot
  });

  assert.equal(result.outcome, "PASS");
  assert.equal(result.harness, "pi");
  assert.equal(result.model_invoked, false);
  assert.deepEqual(result.skills.map((skill) => skill.name), ["build", "think"]);
  assert.ok(result.skills.every((skill) => skill.loaded));
});

test("Pi portability smoke fails closed when a requested skill is not discovered", () => {
  const fake = fakePi({ commands: [] });
  const result = runSkillPortabilitySmoke({
    harness: "pi",
    command: fake.command,
    prefixArgs: fake.prefixArgs,
    skillPaths: [path.join(repoRoot, "skills/build/SKILL.md")],
    cwd: repoRoot
  });

  assert.equal(result.outcome, "FAIL");
  assert.deepEqual(result.failures, ["skill_not_loaded:build"]);
});

test("Pi portability smoke resolves relative skills from the requested working directory", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-portability-cwd-"));
  const skillRoot = path.join(projectRoot, "skills", "portable-cwd");
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "SKILL.md"), [
    "---",
    "name: portable-cwd",
    "description: Test cwd-relative skill resolution.",
    "---",
    "",
    "# Portable cwd"
  ].join("\n"));
  const fake = fakePi({
    commands: [
      {
        name: "skill:portable-cwd",
        source: "skill",
        location: "path",
        path: path.join(skillRoot, "SKILL.md")
      }
    ]
  });
  const result = runSkillPortabilitySmoke({
    harness: "pi",
    command: fake.command,
    prefixArgs: fake.prefixArgs,
    skillPaths: ["skills/portable-cwd/SKILL.md"],
    cwd: projectRoot
  });

  assert.equal(result.outcome, "PASS");
  assert.equal(result.skills[0].path, path.join(skillRoot, "SKILL.md"));
});
