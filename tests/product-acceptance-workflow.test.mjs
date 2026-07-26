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

test("build owns evidence-triggered product acceptance and review before ship", () => {
  const source = read("skills/build/SKILL.md");
  const acceptance = read("skills/build/references/product-acceptance.md");

  assert.match(source, /Product Acceptance Loop/);
  assert.match(source, /references\/product-acceptance\.md/);
  assert.match(acceptance, /verification-report\/product-acceptance\.json/);
  assert.match(source, /verification-report\/proof-contract\.json/);
  assert.match(source, /proof-result\.json/);
  assert.match(acceptance, /decision record, plan acceptance criteria, explicit user brief, then repo standards/);
  assert.match(acceptance, /evidence advantage/);
  assert.match(acceptance, /ask-counterpart-review/);
  assert.doesNotMatch(acceptance, /0th_experience_reviewer/);
  assert.doesNotMatch(source, /counterpart review is mandatory/i);
});

test("ship stays a lightweight evidence checker instead of starting substantive review", () => {
  const source = read("skills/ship/SKILL.md");

  assert.match(source, /product acceptance report/);
  assert.match(source, /verification-report\/product-acceptance\.json/);
  assert.match(source, /proof-result\.json/);
  assert.match(source, /does not re-judge product quality/);
  assert.doesNotMatch(source, /Send the branch diff to the counterpart reviewer/);
  assert.doesNotMatch(source, /If blockers exist: fix on the branch, push, re-run counterpart review/);
});

test("counterpart review helper documents build as the code and diff review owner", () => {
  const source = read("agents/ask-counterpart-review.md");

  assert.match(source, /Used by \/think \(decision records\), \/plan \(slice lists\), and \/build \(code\/diff review\)/);
  assert.doesNotMatch(source, /\/ship \(diffs\)/);
});

test("review is optional advice rather than a ship gate or reviewer authority", () => {
  const build = read("skills/build/SKILL.md");
  const acceptance = read("skills/build/references/product-acceptance.md");
  const helper = read("agents/ask-counterpart-review.md");
  const reviewer = read("agents/reviewer.md");
  const shipGate = read("scripts/ship-gate.mjs");
  const originalDecision = read("docs/decisions/2026-05-10-product-acceptance-loop.md");
  const originalPlan = read("docs/plans/2026-05-10-product-acceptance-loop.md");

  assert.match(build, /Review is optional/);
  assert.match(helper, /findings are hypotheses, not commands/i);
  assert.match(helper, /internal plans and diffs are valid review artifacts/i);
  assert.match(reviewer, /optional reviewer/i);
  assert.match(reviewer, /accept or reject each finding/i);
  assert.match(originalDecision, /partially superseded/i);
  assert.match(originalPlan, /historical plan; review mechanics partially superseded/i);
  assert.doesNotMatch(acceptance, /counterpart-review\.skipped/);
  assert.doesNotMatch(acceptance, /Max 3 product acceptance rounds/);
  assert.doesNotMatch(shipGate, /counterpart-review\.(?:md|skipped)/);
  assert.doesNotMatch(shipGate, /counterpart review evidence gate/i);
});

test("visual work names invariants before verification evidence is accepted", () => {
  const plan = read("skills/plan/SKILL.md");
  const build = read("skills/build/SKILL.md");
  const debug = read("skills/debug/SKILL.md");
  const checklist = read("skills/build/references/verification-checklist.md");

  assert.match(plan, /visual invariant/);
  assert.match(plan, /UI, canvas, SVG, animation, overlay, responsive layout/);
  assert.match(plan, /screenshot evidence/);

  assert.match(build, /If the claim is visual, the evidence must be visual/);
  assert.match(build, /Name the visual invariant/);
  assert.match(build, /DOM\/e2e test/);
  assert.match(build, /screenshot inspection/);
  assert.match(build, /pixel assertion/);

  assert.match(debug, /Visual bugs need a visual feedback loop/);
  assert.match(debug, /DOM test is not enough/);
  assert.match(debug, /alignment, overlap, clipping, animation, canvas\/SVG coordinates, or layout fit/);

  assert.match(checklist, /Visual invariant/);
  assert.match(checklist, /screenshot inspection/);
  assert.match(checklist, /pixel assertion/);
  assert.match(checklist, /separate verified by tests from visually inspected/);
});

test("build product acceptance template shows required reports need evidence paths", () => {
  const source = read("skills/build/references/product-acceptance.md");

  assert.doesNotMatch(source, /"evidence_paths": \[\]/);
  assert.match(source, /"evidence_paths": \[\s*"verification-report\/<evidence-path>"\s*\]/);
});
