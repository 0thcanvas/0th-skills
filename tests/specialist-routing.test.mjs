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

test("specialist routing contract keeps 0th as the workflow orchestrator", () => {
  const source = read("references/specialist-routing.md");

  assert.match(source, /0th remains the workflow orchestrator/);
  assert.match(source, /route at the capability\/workflow boundary/);
  assert.match(source, /do not micromanage a plugin's internal skill sequence/);
  assert.match(source, /handoff envelope/);
  assert.match(source, /return receipt/);
  assert.match(source, /Routing is a subroutine, not a transfer of workflow ownership/);
  assert.match(source, /no-silent-downgrade/i);
});

test("specialist routing contract defines adapter states and fallback behavior", () => {
  const source = read("references/specialist-routing.md");

  for (const fragment of [
    "adapter_available",
    "adapter_unavailable",
    "adapter_ran_evidence_incomplete",
    "adapter_satisfied_contract",
    "native 0th fallback",
    "BLOCKED_REAL_ENV"
  ]) {
    assert.ok(source.includes(fragment), `routing contract should include "${fragment}"`);
  }
});

test("core workflow skills route specialists through the shared contract", () => {
  for (const skillName of ["think", "plan", "build", "ship"]) {
    const source = read(`skills/${skillName}/SKILL.md`);

    assert.match(
      source,
      /\.\.\/\.\.\/references\/specialist-routing\.md/,
      `${skillName} should link to the specialist routing contract`
    );
  }
});

test("specialist routing is guarded by build and ship gates", () => {
  const build = read("skills/build/SKILL.md");
  const ship = read("skills/ship/SKILL.md");

  assert.match(build, /specialist handoff envelope/);
  assert.match(build, /specialist return receipt/);
  assert.match(build, /re-run the proof and product acceptance gates/);
  assert.match(build, /does not satisfy proof by itself/);

  assert.match(ship, /specialist return receipts/);
  assert.match(ship, /proof contract depends on specialist evidence/);
  assert.match(ship, /adapter_unavailable/);
});
