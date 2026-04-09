import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.join(__dirname, "fixtures", "skill-routing.fixture.json");
const expectedSkills = ["build", "debug", "deep-research", "plan", "research", "ship", "think"];

function readFixture() {
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

test("skill routing fixture covers every core skill with unique prompts", () => {
  const fixture = readFixture();
  const seenPrompts = new Set();
  const coveredSkills = new Set();

  assert.ok(fixture.length >= expectedSkills.length, "routing fixture should not be trivial");

  for (const entry of fixture) {
    assert.equal(typeof entry.prompt, "string");
    assert.notEqual(entry.prompt.trim(), "");
    assert.equal(typeof entry.expected_skill, "string");
    assert.equal(typeof entry.why, "string");
    assert.notEqual(entry.why.trim(), "");
    assert.ok(expectedSkills.includes(entry.expected_skill), `${entry.expected_skill} should be valid`);
    assert.equal(seenPrompts.has(entry.prompt), false, `duplicate prompt: ${entry.prompt}`);

    seenPrompts.add(entry.prompt);
    coveredSkills.add(entry.expected_skill);
  }

  assert.deepEqual([...coveredSkills].sort(), [...expectedSkills].sort());
});
