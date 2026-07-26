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
