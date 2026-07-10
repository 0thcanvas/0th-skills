import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("bounded non-ship T0 and T1 work uses the lightweight build lane", () => {
  const build = read("skills/build/SKILL.md");

  assert.match(build, /lightweight build lane/i);
  assert.match(build, /bounded.*non-ship.*T0.*T1/i);
  assert.match(build, /focused tests.*relevant.*suite/i);
  assert.match(build, /do not create.*verification-report/i);
  assert.match(build, /repository.*branch.*commit.*policy/i);
});

test("deep research is an explicit budgeted escalation", () => {
  const deepResearch = read("skills/deep-research/SKILL.md");

  assert.match(deepResearch, /expensive escalation/i);
  assert.match(deepResearch, /ordinary.*research.*default/i);
  assert.match(deepResearch, /source passes/i);
  assert.match(deepResearch, /worker.*budget/i);
  assert.match(deepResearch, /iteration.*budget/i);
  assert.match(deepResearch, /stop.*decision.*supported/i);
});

test("remaining workflow boundaries preserve cheap no-op behavior", () => {
  const plan = read("skills/plan/SKILL.md");
  const debug = read("skills/debug/SKILL.md");
  const ship = read("skills/ship/SKILL.md");
  const architecture = read("skills/improve-architecture/SKILL.md");

  assert.match(plan, /Skip to `\/build` when one bounded implementation loop is sufficient/);
  assert.match(debug, /diagnosis request authorizes investigation and reporting, not a code change/);
  assert.match(ship, /does not authorize merge/);
  assert.match(architecture, /Do not refactor/);
});

test("zoom-out is removed from the installed skill surface", () => {
  assert.equal(fs.existsSync("skills/zoom-out"), false);
  assert.equal(fs.existsSync("codex-skills/zoom-out"), false);
  assert.doesNotMatch(read("CLAUDE.md"), /\/zoom-out/);
  assert.doesNotMatch(read("scripts/build-codex-wrappers.mjs"), /"zoom-out"/);
});
