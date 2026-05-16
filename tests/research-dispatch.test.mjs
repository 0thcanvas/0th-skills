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

function assertReferencesFallback(label, source) {
  assert.match(
    source,
    /codex-dispatch-fallback\.md/,
    `${label} should point to the shared Codex fallback reference`
  );
  assert.match(source, /spawn_agent/, `${label} should name the Codex dispatch tool`);
  assert.match(
    source,
    /instead of continuing\s+in the main thread|instead of doing that phase in the orchestrator/,
    `${label} should forbid main-thread fallback when only named agents are unavailable`
  );
  assert.doesNotMatch(
    source,
    /fallback prompt and pinned model settings|Always set `model: gpt-5\.4`|Use `agent_type: default`/,
    `${label} should not duplicate the detailed fallback mapping`
  );
}

test("Codex-dispatched skills require generic subagent fallback dispatch", () => {
  const fallbackReference = read("references/codex-dispatch-fallback.md");
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
    ["Codex research wrapper", codexResearch],
    ["Codex deep-research wrapper", codexDeepResearch],
  ]) {
    assertReferencesFallback(label, source);
  }

  assert.match(
    fallbackReference,
    /agent_type/,
    "reference should specify generic Codex agent_type fallback"
  );
  assert.match(
    fallbackReference,
    /`model` \| `reasoning_effort`/,
    "reference should centralize model and reasoning pins"
  );
  assert.match(fallbackReference, /gpt-5\.4-mini/);
  assert.match(fallbackReference, /gpt-5\.4/);
  assert.match(fallbackReference, /medium/);
  assert.match(fallbackReference, /high/);
  assert.match(fallbackReference, /Do not continue in the main thread solely because/);
  assert.doesNotMatch(
    fallbackReference,
    /gpt-5\.5|xhigh|extra high/i,
    "fallback reference should not use the latest expensive default"
  );

  assert.match(build, /0th_explorer/);
  assert.match(build, /0th_test_runner/);
  assert.match(build, /0th_reviewer/);
  assert.match(build, /0th_verifier/);
  assert.match(build, /0th_experience_reviewer/);
  assert.match(debug, /0th_explorer/);
  assert.match(debug, /0th_test_runner/);
  assert.match(think, /0th_explorer/);
  assert.match(plan, /0th_explorer/);
  assert.match(research, /0th_researcher/);
  assert.match(deepResearch, /0th_synthesizer/);
  assert.match(phaseGuide, /0th_experimenter/);

  for (const fallback of [
    "0th_explorer fallback",
    "0th_test_runner fallback",
    "0th_reviewer fallback",
    "0th_verifier fallback",
    "0th_experience_reviewer fallback",
    "0th_researcher fallback",
    "0th_deep_researcher fallback",
    "0th_synthesizer fallback",
    "0th_experimenter fallback",
  ]) {
    assert.match(fallbackReference, new RegExp(fallback));
  }
});
