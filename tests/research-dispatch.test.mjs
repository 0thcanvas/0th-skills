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

function assertReferencesProfile(label, source) {
  assert.match(
    source,
    /codex-dispatch-profiles\.md/,
    `${label} should point to the shared Codex dispatch profiles reference`
  );
  assert.match(source, /spawn_agent/, `${label} should name the Codex dispatch tool`);
  assert.match(
    source,
    /instead of continuing\s+in the main thread|instead of doing that phase in\s+the\s+orchestrator/,
    `${label} should keep profile work out of the main thread`
  );
  assert.doesNotMatch(
    source,
    /prompt and pinned model settings|Always set `model: gpt-5\.4`|Use `agent_type: default`/,
    `${label} should not duplicate the detailed profile mapping or present profiles as unavailable agents`
  );
}

test("Codex-dispatched skills use generic subagent dispatch profiles", () => {
  const profileReference = read("references/codex-dispatch-profiles.md");
  const debug = read("skills/debug/SKILL.md");
  const think = read("skills/think/SKILL.md");
  const plan = read("skills/plan/SKILL.md");
  const research = read("skills/research/SKILL.md");
  const deepResearch = read("skills/deep-research/SKILL.md");
  const phaseGuide = read("skills/deep-research/references/phase-guide.md");
  const codexResearch = read("codex-skills/research/SKILL.md");
  const codexDeepResearch = read("codex-skills/deep-research/SKILL.md");

  for (const [label, source] of [
    ["debug", debug],
    ["think", think],
    ["plan", plan],
    ["research", research],
    ["deep-research", deepResearch],
    ["deep-research phase guide", phaseGuide],
    ["Codex research wrapper", codexResearch],
    ["Codex deep-research wrapper", codexDeepResearch],
  ]) {
    assertReferencesProfile(label, source);
  }

  assert.match(
    profileReference,
    /agent_type/,
    "reference should specify generic Codex agent_type profiles"
  );
  assert.match(
    profileReference,
    /`model` \| `reasoning_effort`/,
    "reference should centralize model and reasoning pins"
  );
  assert.match(profileReference, /workflow task profiles, not/);
  assert.match(profileReference, /gpt-5\.4-mini/);
  assert.match(profileReference, /gpt-5\.4/);
  assert.match(profileReference, /medium/);
  assert.match(profileReference, /high/);
  assert.match(profileReference, /Do not continue in the main thread for work that a Codex profile can handle/);
  assert.match(profileReference, /shrink the prompt\s+to the required profile inputs and retry/);
  assert.doesNotMatch(
    profileReference,
    /subagent call\s+fails/,
    "profile reference should not treat ordinary spawn_agent failures as permission for main-thread execution"
  );
  assert.doesNotMatch(
    profileReference,
    /gpt-5\.5|xhigh|extra high/i,
    "profile reference should not use the latest expensive default"
  );

  assert.match(debug, /0th_explorer/);
  assert.match(debug, /0th_test_runner/);
  assert.match(think, /0th_explorer/);
  assert.match(plan, /0th_explorer/);
  assert.match(research, /0th_researcher/);
  assert.match(deepResearch, /0th_synthesizer/);
  assert.match(phaseGuide, /0th_experimenter/);

  for (const profile of [
    "0th_explorer profile",
    "0th_test_runner profile",
    "0th_reviewer profile",
    "0th_verifier profile",
    "0th_experience_reviewer profile",
    "0th_researcher profile",
    "0th_deep_researcher profile",
    "0th_synthesizer profile",
    "0th_experimenter profile",
  ]) {
    assert.match(profileReference, new RegExp(profile));
  }
});
