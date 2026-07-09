import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("skills-kernel baseline records the pre-migration behavior and runtime boundary", () => {
  const source = read("docs/evals/2026-07-09-skills-kernel-baseline.md");
  for (const fragment of [
    "368 passed, 0 failed",
    "415 lines, 3,210 words",
    "gpt-5.6-sol",
    "Root reasoning effort: `xhigh`",
    "Child model override exposed by the current delegation interface: no",
    "Child effort override exposed by the current delegation interface: no",
    "the correct default is one root agent"
  ]) {
    assert.ok(source.includes(fragment), `baseline should include ${JSON.stringify(fragment)}`);
  }
});

test("skills-kernel corpus contains eight uniquely tagged task shapes", () => {
  const tasks = JSON.parse(read("tests/fixtures/skills-kernel/tasks.json"));
  assert.equal(tasks.length, 8);
  assert.equal(new Set(tasks.map((task) => task.id)).size, 8);
  for (const task of tasks) {
    for (const key of ["size", "dependency_depth", "decomposability", "shared_state", "proof_tier", "risk"]) {
      assert.ok(task.tags[key], `${task.id} should tag ${key}`);
    }
  }
});
