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
