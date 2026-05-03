import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const skillPath = path.join(repoRoot, "skills", "retro", "SKILL.md");
const codexMetaPath = path.join(repoRoot, "skills", "retro", "agents", "openai.yaml");
const claudeMdPath = path.join(repoRoot, "CLAUDE.md");
const readmePath = path.join(repoRoot, "README.md");
const smokeCheckPath = path.join(repoRoot, "scripts", "install-smoke-check.mjs");
const decisionRelPath = "docs/decisions/2026-05-03-skill-incident-log.md";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("/retro skill ships at skills/retro/SKILL.md with frontmatter metadata", () => {
  const source = read(skillPath);

  assert.match(source, /^name:\s*retro/m, "frontmatter should declare name: retro");
  assert.match(source, /^description:/m, "frontmatter should declare a description");
  assert.match(source, /argument-hint:\s*"\[[^"]+\]"/, "should declare an argument-hint");
  assert.match(source, /\$ARGUMENTS/, "should explain how direct invocation arguments are used");
});

test("/retro skill prompt enforces the four staged steps in exact order", () => {
  const source = read(skillPath);

  assert.match(
    source,
    /MUST.*extract\s+evidence.*redact.*classify.*aggregate/is,
    "prompt MUST name the four staged steps in order: extract evidence → redact → classify → aggregate"
  );
});

test("/retro skill prompt links to the decision record so future readers can find it", () => {
  const source = read(skillPath);
  assert.ok(
    source.includes(decisionRelPath),
    `prompt should reference the decision record path ${decisionRelPath}`
  );
});

test("/retro decision record exists at the linked path so the SKILL.md reference resolves", () => {
  const decisionAbsPath = path.join(repoRoot, decisionRelPath);
  assert.equal(
    fs.existsSync(decisionAbsPath),
    true,
    `decision record should exist at ${decisionRelPath} (referenced by skills/retro/SKILL.md)`
  );
});

test("/retro skill prompt names every required schema heading", () => {
  const source = read(skillPath);
  for (const heading of [
    "What user wanted",
    "What agent did",
    "Correction evidence",
    "Root cause",
    "Proposed action",
  ]) {
    assert.ok(
      source.includes(heading),
      `prompt should reference the required heading "${heading}"`
    );
  }
});

test("/retro skill prompt enforces the unknown classification discipline", () => {
  const source = read(skillPath);
  assert.match(source, /candidate_new_category/, "prompt should mention candidate_new_category");
  assert.match(source, /insufficient_evidence/, "prompt should mention insufficient_evidence");
});

test("/retro skill prompt names KB_ROOT path resolution and slug collision rule", () => {
  const source = read(skillPath);
  assert.match(source, /\$\{?KB_ROOT\}?/, "prompt should reference ${KB_ROOT}");
  assert.match(
    source,
    /skill-incidents/,
    "prompt should reference the skill-incidents directory"
  );
  assert.match(
    source,
    /-2|-3|append.*-N|-\d/i,
    "prompt should describe slug collision handling (append -2, -3, etc.)"
  );
});

test("/retro skill prompt names the redaction rule for correction evidence", () => {
  const source = read(skillPath);
  assert.match(
    source,
    /redact|redaction/i,
    "prompt should reference the redaction rule"
  );
  assert.match(
    source,
    /op:\/\/|JWT|secret|token|PII/i,
    "prompt should give concrete redaction examples (op://, JWT, secret, token, PII)"
  );
});

test("/retro skill has a Codex openai.yaml metadata file with explicit UI copy", () => {
  const source = read(codexMetaPath);
  assert.match(source, /interface:/, "should define interface metadata");
  assert.match(source, /display_name:/, "should define a display name");
  assert.match(source, /short_description:/, "should define a short description");
});

test("CLAUDE.md skill table and routing rules include /retro", () => {
  const source = read(claudeMdPath);
  assert.ok(
    /\|\s*`?\/retro`?\s*\|/.test(source) || /\| `\/retro`/.test(source),
    "CLAUDE.md skill table should list /retro"
  );
  assert.match(
    source,
    /\/retro/,
    "CLAUDE.md should reference /retro in skill routing"
  );
});

test("README skill list includes /retro", () => {
  const source = read(readmePath);
  assert.match(source, /\/retro\b/, "README should list the /retro skill");
});

test("install-smoke-check expectedSkills includes retro", () => {
  const source = read(smokeCheckPath);
  assert.match(
    source,
    /expectedSkills\s*=\s*\[[^\]]*"retro"[^\]]*\]/s,
    "install-smoke-check.mjs expectedSkills should include \"retro\""
  );
});
