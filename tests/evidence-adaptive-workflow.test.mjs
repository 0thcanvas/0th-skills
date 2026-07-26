import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (filePath) => fs.readFileSync(filePath, "utf8");

test("execution policy chooses the least coordination artifact supported by task evidence", () => {
  const policy = read("references/execution-policy.md");

  assert.match(policy, /Direct.*one bounded execution loop/is);
  assert.match(policy, /Adaptive checkpoint.*ordered investigation.*debugging/is);
  assert.match(policy, /Formal plan.*multi-session.*irreversible/is);
  assert.match(policy, /file count.*not.*formal plan/is);
  assert.match(policy, /multiple implementation paths.*not.*ambiguity/is);
});

test("intent clarification is outcome-level and result packets preserve audit state", () => {
  const kernel = read("references/skills-kernel.md");
  const policy = read("references/execution-policy.md");
  const delegation = read("references/delegation.md");

  assert.match(kernel, /multiple plausible outcome-level intentions/is);
  assert.match(kernel, /acceptance, authority, or irreversible effects/is);
  for (const field of [
    "claim",
    "source",
    "caveat",
    "contradiction",
    "unresolved gap",
    "next read"
  ]) {
    assert.match(policy, new RegExp(field, "i"));
  }
  assert.match(delegation, /ResultPacket/);
  assert.match(delegation, /unresolved contradictions/);
  assert.match(delegation, /receipt/i);
});

test("plan is reserved for coordination need rather than ordered files alone", () => {
  const plan = read("skills/plan/SKILL.md");
  const codexPlan = read("codex-skills/plan/SKILL.md");
  const build = read("skills/build/SKILL.md");

  assert.match(plan, /ordered multi-file or debugging work alone is not a plan trigger/i);
  assert.match(build, /execution-policy\.md/);
  assert.match(build, /least coordination artifact/i);
  assert.match(codexPlan, /multi-session or high-risk coordination/i);
  assert.doesNotMatch(codexPlan, /work needs ordering/i);
  assert.match(
    read("docs/decisions/2026-07-16-plan-review-build-gate.md"),
    /superseded.*2026-07-26/is
  );
});
