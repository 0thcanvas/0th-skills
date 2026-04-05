import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, "skills");

const skillNames = ["build", "debug", "plan", "research", "ship", "think"];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("each skill declares Claude direct-invocation metadata", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /argument-hint:\s*"\[[^"]+\]"/,
      `${skillName} should declare an argument-hint`
    );
    assert.match(
      source,
      /\$ARGUMENTS/,
      `${skillName} should explain how direct invocation arguments are used`
    );
  }
});

test("each skill has Codex openai.yaml metadata with explicit UI copy", () => {
  for (const skillName of skillNames) {
    const metadataPath = path.join(skillsRoot, skillName, "agents", "openai.yaml");
    const source = read(metadataPath);

    assert.match(source, /interface:/, `${skillName} should define interface metadata`);
    assert.match(source, /display_name:/, `${skillName} should define a display name`);
    assert.match(source, /short_description:/, `${skillName} should define a short description`);
    assert.match(source, /default_prompt:/, `${skillName} should define a default prompt`);
    assert.match(
      source,
      /allow_implicit_invocation:\s*true/,
      `${skillName} should remain implicitly invocable`
    );
  }
});
