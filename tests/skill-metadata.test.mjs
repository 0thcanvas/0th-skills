import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, "skills");
const codexSkillsRoot = path.join(repoRoot, "codex-skills");
const thinkTemplatePath = path.join(skillsRoot, "think", "templates", "decision-record.md");
const researchOutputTemplatePath = path.join(skillsRoot, "research", "templates", "output-shape.md");
const researchTemplatePath = path.join(skillsRoot, "research", "templates", "raw-findings-note.md");
const shipTemplatePath = path.join(skillsRoot, "ship", "templates", "pr-body.md");
const memoryContractPath = path.join(repoRoot, "references", "memory-contract.md");
const workingArtifactsContractPath = path.join(repoRoot, "references", "working-artifacts.md");

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

test("Codex skill entrypoints delegate to shared workflows without Claude-only frontmatter", () => {
  for (const skillName of [...skillNames, "zoom-out"]) {
    const codexSkillPath = path.join(codexSkillsRoot, skillName, "SKILL.md");
    const source = read(codexSkillPath);

    assert.match(
      source,
      /^description:\s*"Use when /m,
      `${skillName} Codex entrypoint should keep a compact trigger description`
    );
    assert.doesNotMatch(source, /^argument-hint:/m, `${skillName} Codex entrypoint should omit argument-hint`);
    assert.match(
      source,
      new RegExp(`\\(\\.\\.\\/\\.\\.\\/skills\\/${skillName}\\/SKILL\\.md\\)`),
      `${skillName} Codex entrypoint should link to the shared workflow`
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
  for (const skillName of ["think", "plan", "build"]) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /ask-counterpart-review/,
      `${skillName} should reference ask-counterpart-review`
    );
  }

  assert.doesNotMatch(
    read(path.join(skillsRoot, "ship", "SKILL.md")),
    /Send the branch diff to the counterpart reviewer/,
    "ship should not initiate first-time counterpart diff review"
  );
});

test("shared memory contract defines required types and lifecycle states", () => {
  const source = read(memoryContractPath);

  for (const fragment of [
    "decision",
    "observation",
    "root_cause",
    "vocabulary",
    "incident",
    "repo_state",
    "external_research",
    "active",
    "needs_review",
    "superseded",
    "archived",
    "ephemeral"
  ]) {
    assert.ok(source.includes(fragment), `memory contract should include "${fragment}"`);
  }
});

test("shared memory contract separates open loops from durable memory claims", () => {
  const source = read(memoryContractPath);

  assert.match(source, /Open Loops/);
  assert.match(source, /user\/runtime data|user-level/i);
  assert.match(source, /do not store TODOs as memory claims/i);
});

// `retro` is intentionally excluded from the artifact-producing wiring: it writes incident logs
// to `${KB_ROOT}/learning/skill-incidents/` (outside the repo doc tree), so the repo-doc lane of
// the working-artifacts contract does not apply.
// `zoom-out` is intentionally excluded: it is a read-only mapping skill that does not write
// artifacts, matching its existing exclusion from the broader `skillNames` list above.
const ARTIFACT_PRODUCING_SKILLS = [
  "build",
  "debug",
  "deep-research",
  "improve-architecture",
  "plan",
  "research",
  "ship",
  "think"
];

test("shared working-artifacts contract defines lanes and lifecycle choices", () => {
  assert.equal(
    fs.existsSync(workingArtifactsContractPath),
    true,
    "working artifacts contract should exist"
  );

  const source = read(workingArtifactsContractPath);

  // Structural anchors: the four sections must exist in document order.
  assert.match(
    source,
    /## Lanes[\s\S]+## Paths[\s\S]+## Lifecycle Choices[\s\S]+## Maintenance Reports/,
    "working artifacts contract should keep its four-section structure"
  );

  // Lane bullets: each lane must appear as a bold-headed bullet, not just in prose.
  for (const lane of ["Memory v2", "repo docs", "working artifacts"]) {
    const escaped = lane.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      source,
      new RegExp(`-\\s+\\*\\*${escaped}\\*\\*`),
      `working artifacts contract should list "${lane}" as a bullet item`
    );
  }

  // State-root resolution order and the verification-report exception are explicit.
  assert.match(source, /\$OTH_SKILLS_STATE_DIR/);
  assert.match(source, /\$XDG_STATE_HOME/);
  assert.match(source, /\$\{VERIFICATION_REPORT_DIR:-verification-report\}/);

  // Lifecycle choices must appear as bold-headed bullets — not just incidental prose matches.
  for (const choice of ["current", "compact", "supersede", "delete"]) {
    assert.match(
      source,
      new RegExp(`-\\s+\\*\\*${choice}\\*\\*:`),
      `working artifacts contract should list "${choice}" as a lifecycle choice bullet`
    );
  }

  // Draft lane and the aligned `/think` exception are explicit.
  assert.match(source, /not agent truth/);
  assert.match(source, /Aligned `\/think` decision records/);
});

test("artifact-producing skills reference the working-artifacts contract", () => {
  for (const skillName of ARTIFACT_PRODUCING_SKILLS) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /\.\.\/\.\.\/references\/working-artifacts\.md/,
      `${skillName} should link to the shared working-artifacts contract`
    );
  }
});

test("working-artifacts contract requires report-first stale doc cleanup", () => {
  const source = read(workingArtifactsContractPath);

  // The maintenance directive must require the four-class classification, not just name it.
  assert.match(
    source,
    /classify each candidate as current, compact, supersede, or delete/,
    "maintenance directive should require the four-class classification"
  );

  assert.match(
    source,
    /stale repo-doc candidates/,
    "maintenance directive should call out stale repo-doc candidates"
  );

  // Report-first rule is imperative, not optional.
  assert.match(
    source,
    /Always report before destructive cleanup/,
    "maintenance directive should be imperative about report-first"
  );

  assert.match(
    source,
    /deleted or revamped features/,
    "maintenance directive should cover deleted/revamped feature docs"
  );

  // Tombstone-style evidence is required before removing cited docs.
  assert.match(
    source,
    /tombstone,\s+evidence record,\s+source pack,\s+or\s+replacement source pointer/,
    "maintenance directive should require tombstone-style evidence"
  );
});

test("core skills require the shared memory write gate", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /\.\.\/\.\.\/references\/memory-contract\.md/,
      `${skillName} should link to the shared memory contract`
    );
    assert.match(
      source,
      /Memory Write Gate/,
      `${skillName} should require the Memory Write Gate`
    );
    assert.match(
      source,
      /nothing durable/,
      `${skillName} should include an explicit nothing durable outcome`
    );
    assert.match(
      source,
      /memory\.mjs" remember|memory remember/,
      `${skillName} should require the unified memory writer for durable claims`
    );
    assert.match(
      source,
      /do not hand-edit runtime `claims\.jsonl`/,
      `${skillName} should forbid manual claim-file edits`
    );
  }
});

test("core skills read open-loop briefs after memory briefs", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /memory\.mjs" task-brief|memory task-brief/,
      `${skillName} should name the open-loop brief command`
    );
    assert.match(
      source,
      /output_file/,
      `${skillName} should read the generated open-loop brief path from command JSON`
    );
    assert.match(
      source,
      /after the memory brief/i,
      `${skillName} should order open-loop recall after memory recall`
    );
  }
});

test("core skills update open loops for unfinished work", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /memory\.mjs" open-loop|memory open-loop/,
      `${skillName} should name the open-loop command`
    );
    assert.match(
      source,
      /do not store TODOs as memory claims/i,
      `${skillName} should keep unfinished actions out of memory claims`
    );
  }
});

test("core skills require conservative repo preflight", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /memory\.mjs" preflight|memory preflight/,
      `${skillName} should name the shared memory preflight command`
    );
    assert.match(
      source,
      /fast-forward/,
      `${skillName} should name the safe fast-forward behavior`
    );
    assert.match(
      source,
      /dirty.*divergent|divergent.*dirty/s,
      `${skillName} should warn on dirty and divergent states`
    );
  }
});

test("core memory commands require configured skill root without local checkout fallbacks", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /\$\{OTH_SKILLS_ROOT:\?Set OTH_SKILLS_ROOT to the 0th-skills directory\}/,
      `${skillName} should require OTH_SKILLS_ROOT for shared scripts`
    );
    assert.doesNotMatch(
      source,
      /\$HOME\/0thcanvas|\/Users\/mini\/0thcanvas/,
      `${skillName} should not assume a local 0thcanvas checkout path`
    );
  }
});

test("core skills read the generated memory brief first when present", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /memory\.mjs" brief|memory brief/,
      `${skillName} should name the shared memory brief command`
    );
    assert.match(
      source,
      /output_file/,
      `${skillName} should read the generated memory brief path from command JSON`
    );
    assert.match(
      source,
      /before browsing indexes/i,
      `${skillName} should prefer the brief before manual index browsing`
    );
  }
});

test("core skills read global memory before project memory and degrade visibly", () => {
  for (const skillName of skillNames) {
    const skillPath = path.join(skillsRoot, skillName, "SKILL.md");
    const source = read(skillPath);

    assert.match(
      source,
      /brief" --scope global|brief --scope global/,
      `${skillName} should generate the global memory brief first`
    );
    assert.match(
      source,
      /global brief[\s\S]*warn[\s\S]*continue/i,
      `${skillName} should warn and continue when global memory is missing or corrupt`
    );
    assert.match(
      source,
      /canonical agent recall path/i,
      `${skillName} should name Memory v2 runtime as canonical recall`
    );
    assert.match(
      source,
      /legacy KB|Obsidian|markdown/i,
      `${skillName} should mention legacy markdown KB fallback/import-export handling`
    );
    assert.match(
      source,
      /source packs[\s\S]*on demand/i,
      `${skillName} should keep large source packs out of startup context`
    );
  }
});
