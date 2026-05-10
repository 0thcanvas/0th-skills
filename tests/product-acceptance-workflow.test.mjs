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

test("build owns product acceptance and counterpart diff review before ship", () => {
  const source = read("skills/build/SKILL.md");

  assert.match(source, /Product Acceptance Loop/);
  assert.match(source, /verification-report\/product-acceptance\.json/);
  assert.match(source, /decision record, plan acceptance criteria, explicit user brief, then repo standards/);
  assert.match(source, /Max 3 product acceptance rounds/);
  assert.match(source, /0th_experience_reviewer/);
  assert.match(source, /ask-counterpart-review/);
  assert.match(source, /code\/diff counterpart review/);
});

test("ship stays a lightweight evidence checker instead of starting substantive review", () => {
  const source = read("skills/ship/SKILL.md");

  assert.match(source, /product acceptance report/);
  assert.match(source, /verification-report\/product-acceptance\.json/);
  assert.match(source, /does not re-judge product quality/);
  assert.doesNotMatch(source, /Send the branch diff to the counterpart reviewer/);
  assert.doesNotMatch(source, /If blockers exist: fix on the branch, push, re-run counterpart review/);
});

test("counterpart review helper documents build as the code and diff review owner", () => {
  const source = read("agents/ask-counterpart-review.md");

  assert.match(source, /Used by \/think \(decision records\), \/plan \(slice lists\), and \/build \(code\/diff review\)/);
  assert.doesNotMatch(source, /\/ship \(diffs\)/);
});
