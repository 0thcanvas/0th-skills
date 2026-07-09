import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CORE_SKILLS, MIGRATED_SKILLS } from "../scripts/skill-block-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const skillNames = [
  "build",
  "debug",
  "deep-research",
  "improve-architecture",
  "plan",
  "research",
  "retro",
  "ship",
  "think",
  "zoom-out"
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("all ten shared skills use the portable Skills Kernel", () => {
  assert.equal(fs.existsSync(path.join(repoRoot, "references", "skills-kernel.md")), true);
  assert.deepEqual(MIGRATED_SKILLS, skillNames);
  assert.deepEqual(CORE_SKILLS, []);

  for (const skillName of skillNames) {
    const source = read(`skills/${skillName}/SKILL.md`);
    assert.match(source, /\.\.\/\.\.\/references\/skills-kernel\.md/);
    assert.ok(source.trimEnd().split("\n").length < 180, `${skillName} should stay below 180 lines`);
  }
});

test("portable skill bodies contain no fixed host, model, effort, or role choreography", () => {
  const forbidden = [
    /Codex-hosted/i,
    /Claude-hosted/i,
    /spawn_agent/,
    /0th_(?:explorer|test_runner|reviewer|verifier|experience_reviewer|researcher|deep_researcher|synthesizer|experimenter)/,
    /gpt-\d/i,
    /reasoning_effort/
  ];

  for (const skillName of skillNames) {
    const source = read(`skills/${skillName}/SKILL.md`);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${skillName} should not contain ${pattern}`);
    }
  }
});

test("model-invoked descriptions state both what the skill does and when to use it", () => {
  for (const skillName of skillNames.filter((name) => name !== "zoom-out")) {
    const source = read(`skills/${skillName}/SKILL.md`);
    assert.match(source, /^description:\s*"(?!Use when ).+\. Use when .+"$/m);
  }

  const zoomOut = read("skills/zoom-out/SKILL.md");
  assert.match(zoomOut, /^disable-model-invocation:\s*true$/m);
  assert.match(zoomOut, /^description:\s*"Maps .+"$/m);
});

test("the shared kernel owns preflight, authority, delegation, secrets, and closeout", () => {
  const kernel = read("references/skills-kernel.md");

  for (const fragment of [
    "Root-task preflight",
    "once per root task",
    "TaskSpec",
    "capabilities",
    "Default: one root agent",
    "evidence advantage",
    "CONTRACT_INVALIDATED",
    "SCOPE_EXPANSION_REQUIRED",
    "External writes",
    "resolved secret values",
    "Memory Write Gate",
    "nothing durable",
    "retro_open_loop_closeout"
  ]) {
    assert.ok(kernel.includes(fragment), `kernel should include ${JSON.stringify(fragment)}`);
  }
});

test("each migrated skill retains its defining contract", () => {
  const expectations = {
    think: ["Do not implement", "docs/decisions/", "CONTEXT.md", "Durable: yes"],
    plan: ["vertical", "acceptance", "visual invariant", "docs/plans/"],
    build: ["proof_contract_required", "minimum_proof_tier", "failure-dossier-runner.mjs", "Product Acceptance Loop"],
    debug: ["feedback loop", "root cause", "failing regression test", "blocked_real_env"],
    research: ["source buckets", "primary sources", "session-backed read receipt", "context_handoff"],
    "deep-research": ["feasibility", "decision", "survey", "world model", "bounded summaries"],
    ship: ["ship-gate.mjs", "proof result tier", "PR-specific", "ready to merge"],
    retro: ["extract evidence", "redact", "classify", "aggregate", "candidate_new_category"],
    "improve-architecture": ["deepening", "Deletion test", "explicit user pick", "Do not refactor"],
    "zoom-out": ["read-only", "callers", "CONTEXT.md"]
  };

  for (const [skillName, fragments] of Object.entries(expectations)) {
    const source = read(`skills/${skillName}/SKILL.md`);
    for (const fragment of fragments) {
      assert.ok(source.includes(fragment), `${skillName} should preserve ${JSON.stringify(fragment)}`);
    }
  }
});

test("generated Codex wrappers stay thin and contain no permanent dispatch policy", () => {
  for (const skillName of skillNames) {
    const source = read(`codex-skills/${skillName}/SKILL.md`);
    assert.match(source, /Read the \[shared workflow\]/);
    assert.doesNotMatch(source, /dispatch note|spawn_agent|0th_/i);
    assert.ok(source.trimEnd().split("\n").length <= 9, `${skillName} wrapper should stay compact`);
  }
});
