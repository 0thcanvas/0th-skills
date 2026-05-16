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

function assertCodexFallback(label, source) {
  assert.match(source, /spawn_agent/, `${label} should name the Codex dispatch tool`);
  assert.match(source, /agent_type/, `${label} should specify generic Codex agent_type fallback`);
  assert.match(source, /model:\s*`?gpt-5\.4(?:-mini)?`?/, `${label} should pin fallback model`);
  assert.match(source, /reasoning_effort/, `${label} should pin fallback reasoning effort`);
  assert.doesNotMatch(
    source,
    /gpt-5\.5|xhigh|extra high/i,
    `${label} should not use the latest expensive default`
  );
  assert.match(
    source,
    /Do not continue in the main thread solely because/,
    `${label} should forbid main-thread fallback when only named agents are unavailable`
  );
}

test("Codex-dispatched skills require generic subagent fallback dispatch", () => {
  const build = read("skills/build/SKILL.md");
  const debug = read("skills/debug/SKILL.md");
  const think = read("skills/think/SKILL.md");
  const plan = read("skills/plan/SKILL.md");
  const research = read("skills/research/SKILL.md");
  const deepResearch = read("skills/deep-research/SKILL.md");
  const phaseGuide = read("skills/deep-research/references/phase-guide.md");
  const codexResearch = read("codex-skills/research/SKILL.md");
  const codexDeepResearch = read("codex-skills/deep-research/SKILL.md");

  for (const [label, source] of [
    ["build", build],
    ["debug", debug],
    ["think", think],
    ["plan", plan],
    ["research", research],
    ["deep-research", deepResearch],
    ["deep-research phase guide", phaseGuide],
  ]) {
    assertCodexFallback(label, source);
  }

  assert.match(build, /0th_explorer fallback/);
  assert.match(build, /0th_test_runner fallback/);
  assert.match(build, /0th_reviewer fallback/);
  assert.match(build, /0th_verifier fallback/);
  assert.match(build, /0th_experience_reviewer fallback/);
  assert.match(debug, /0th_explorer fallback/);
  assert.match(debug, /0th_test_runner fallback/);
  assert.match(think, /0th_explorer fallback/);
  assert.match(plan, /0th_explorer fallback/);
  assert.match(research, /0th_researcher fallback/);
  assert.match(deepResearch, /0th_synthesizer fallback/);
  assert.match(phaseGuide, /0th_experimenter fallback/);

  for (const [label, source] of [
    ["Codex research wrapper", codexResearch],
    ["Codex deep-research wrapper", codexDeepResearch],
  ]) {
    assertCodexFallback(label, source);
  }
});
