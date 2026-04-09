import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, "skills");
const thinkTemplatePath = path.join(skillsRoot, "think", "templates", "decision-record.md");
const researchOutputTemplatePath = path.join(skillsRoot, "research", "templates", "output-shape.md");
const researchTemplatePath = path.join(skillsRoot, "research", "templates", "raw-findings-note.md");
const shipTemplatePath = path.join(skillsRoot, "ship", "templates", "pr-body.md");

const skillNames = ["build", "debug", "deep-research", "plan", "research", "ship", "think"];

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

test("skill reference links resolve to real files", () => {
  const linkPattern = /(references|templates)\/([A-Za-z0-9._/-]+\.md)/g;

  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    for (const match of source.matchAll(linkPattern)) {
      const targetPath = path.join(skillsRoot, skillName, match[1], match[2]);
      assert.equal(
        fs.existsSync(targetPath),
        true,
        `${skillName} should resolve ${match[0]} to a real file`
      );
    }
  }
});

test("workflow templates exist for think, research, and ship", () => {
  assert.equal(fs.existsSync(thinkTemplatePath), true, "think decision template should exist");
  assert.equal(
    fs.existsSync(researchOutputTemplatePath),
    true,
    "research output template should exist"
  );
  assert.equal(fs.existsSync(researchTemplatePath), true, "research KB template should exist");
  assert.equal(fs.existsSync(shipTemplatePath), true, "ship PR template should exist");
});

test("counterpart-review skills use the generic ask-counterpart-review agent", () => {
  for (const skillName of ["think", "plan", "ship"]) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /ask-counterpart-review/,
      `${skillName} should reference ask-counterpart-review`
    );
  }
});
