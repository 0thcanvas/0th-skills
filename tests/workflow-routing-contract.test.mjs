import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("production deployment is a separate operational phase from ship", () => {
  const ship = read("skills/ship/SKILL.md");

  assert.match(ship, /production-only deployment.*project deployment runbook/is);
  assert.match(ship, /combined ship-and-deploy request.*separate phases/is);
  assert.match(ship, /ship authority.*does not carry into deployment/is);
});

test("ship removes its dedicated worktree after a terminal PR state", () => {
  const ship = read("skills/ship/SKILL.md");

  assert.match(ship, /agent-created.*dedicated worktree/is);
  assert.match(ship, /merged, closed, or abandoned/is);
  assert.match(ship, /clean.*unpushed/is);
  assert.match(ship, /git worktree remove/is);
  assert.match(ship, /git worktree prune/is);
  assert.match(ship, /git worktree list.*path.*(?:absent|gone)/is);
  assert.match(ship, /dirty.*ownership.*preserve.*report/is);
});

test("durable note requests route to Memory or the project KB without fabricating an incident", () => {
  const retro = read("skills/retro/SKILL.md");

  assert.match(retro, /take a note.*remember this/is);
  assert.match(retro, /without a concrete incident.*Memory.*project KB/is);
  assert.match(retro, /do not enter `\/retro`/i);
});

test("build defines a no-code operational lane for an existing revision", () => {
  const build = read("skills/build/SKILL.md");

  assert.match(build, /## No-code Operational Lane/);
  assert.match(build, /build, sign, install, launch, restart, or verify an\s+existing revision/is);
  assert.match(build, /do not create a feature branch, TDD test, PR, or `verification-report`/is);
  assert.match(build, /source or configuration edit.*normal\s+`\/build` or `\/debug`/is);
  assert.match(build, /build, signing, install, launch, and health evidence/is);
});

test("external acquisition requires an approved cost and authorization plan", () => {
  const plan = read("skills/plan/SKILL.md");
  const build = read("skills/build/SKILL.md");

  assert.match(plan, /external API.*paid data.*webhook/is);
  assert.match(plan, /## Acquisition Contract/);
  assert.match(plan, /push, stream, polling, or snapshot semantics/is);
  assert.match(plan, /OAuth\/consent/is);
  assert.match(plan, /billing unit.*worst-case cost/is);
  assert.match(plan, /maximum live-probe budget.*stop condition/is);
  assert.match(plan, /Unknown pricing, authorization, or event semantics.*BLOCKED_BY_SPEC/is);
  assert.match(build, /External\/live work requires an approved `\/plan`/);
  assert.match(build, /CONTRACT_INVALIDATED/);
});
