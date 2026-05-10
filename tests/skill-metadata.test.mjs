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

// `zoom-out` is intentionally excluded: its `disable-model-invocation: true` (and
// matching `allow_implicit_invocation: false` in agents/openai.yaml) is a deliberate
// design — it's a user-triggered micro-skill — and conflicts with the
// `allow_implicit_invocation: true` invariant this test enforces for core skills.
const skillNames = ["build", "debug", "deep-research", "improve-architecture", "plan", "research", "retro", "ship", "think"];

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

test("skill descriptions advertise trigger conditions up front", () => {
  for (const skillName of [...skillNames, "zoom-out"]) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /^description:\s*"Use when /m,
      `${skillName} should start its description with a clear Use when trigger`
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
  // Skill-local refs:      `references/X.md` or `templates/X.md`
  // Workspace-shared refs: `../../references/X.md` (resolved from skills/<name>/SKILL.md → repoRoot)
  const linkPattern = /(\.\.\/\.\.\/)?(references|templates)\/([A-Za-z0-9._/-]+\.md)/g;

  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    for (const match of source.matchAll(linkPattern)) {
      const isWorkspaceShared = !!match[1];
      const targetPath = isWorkspaceShared
        ? path.join(repoRoot, match[2], match[3])
        : path.join(skillsRoot, skillName, match[2], match[3]);
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

test("verification-report/ is gitignored so verifier artifacts don't leak into PRs", () => {
  // The verifier writes ${VERIFICATION_REPORT_DIR:-verification-report}/report.json per
  // the self-testing-loop architecture (docs/decisions/2026-05-03-…). The default path
  // must be gitignored so the artifact doesn't pollute every PR diff.
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const source = read(gitignorePath);
  assert.match(
    source,
    /^verification-report\/?$/m,
    ".gitignore should ignore the default verification-report/ path"
  );
});

test("shipped prompt commands resolve repo scripts through relative or env roots", () => {
  const scannedExtensions = new Set([".md", ".toml", ".yaml", ".yml"]);
  const ignoredDirs = new Set([".git", "verification-report"]);
  const offenders = [];

  function walk(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (ignoredDirs.has(entry.name)) continue;
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (!scannedExtensions.has(path.extname(entry.name))) continue;
      const source = read(entryPath);
      for (const [index, line] of source.split("\n").entries()) {
        if (!/\bnode\b/.test(line) || !line.includes("/scripts/")) continue;
        const usesRelativeScript = /\bnode\s+scripts\/[A-Za-z0-9._/-]+\.mjs\b/.test(line);
        const usesEnvRoot = line.includes("${")
          && /\}\/scripts\/[A-Za-z0-9._/-]+\.mjs/.test(line);
        if (!usesRelativeScript && !usesEnvRoot) {
          offenders.push(`${path.relative(repoRoot, entryPath)}:${index + 1}`);
        }
      }
    }
  }

  walk(repoRoot);
  assert.deepEqual(offenders, []);
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
