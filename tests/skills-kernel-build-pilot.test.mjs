import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CORE_SKILLS, MIGRATED_SKILLS, auditSkills, loadCanonicalBlock } from "../scripts/skill-block-sync.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("build pilot is a thin what-and-when portable skill", () => {
  const source = read("skills/build/SKILL.md");
  const lineCount = source.trimEnd().split("\n").length;
  const wordCount = source.trim().split(/\s+/).length;

  assert.match(source, /^description: "Implements .* Use when /m);
  assert.ok(lineCount < 220, `build pilot should stay below 220 lines, got ${lineCount}`);
  assert.ok(wordCount < 1200, `build pilot should stay below 1,200 words, got ${wordCount}`);
});

test("build pilot defaults to one root agent and fails closed through observed capabilities", () => {
  const source = read("skills/build/SKILL.md");

  for (const fragment of [
    "Default: one root agent",
    "node scripts/0th.mjs capabilities",
    "live capability record",
    "bounded capability packet",
    "disproportionate",
    "CONTRACT_INVALIDATED",
    "SCOPE_EXPANSION_REQUIRED"
  ]) {
    assert.ok(source.includes(fragment), `build pilot should include ${JSON.stringify(fragment)}`);
  }

  for (const forbidden of [
    "0th_test_runner",
    "0th_reviewer",
    "0th_verifier",
    "0th_experience_reviewer",
    "explicitly dispatch",
    "Do not continue in the main thread"
  ]) {
    assert.equal(source.includes(forbidden), false, `build pilot should not include ${forbidden}`);
  }
});

test("build pilot preserves executable proof, authority, and closeout contracts", () => {
  const source = read("skills/build/SKILL.md");

  for (const fragment of [
    "proof_contract_required",
    "ship-bound implementation work requires",
    "docs-only or metadata-only changes still use a `T0` contract",
    "minimum_proof_tier",
    "minimum_tier_satisfied",
    "failure-dossier-runner.mjs",
    "--run-id",
    "If the claim is visual, the evidence must be visual",
    "specialist handoff envelope",
    "specialist return receipt",
    "does not satisfy proof by itself",
    "retro_open_loop_closeout",
    "skipped verification"
  ]) {
    assert.ok(source.includes(fragment), `build pilot should preserve ${JSON.stringify(fragment)}`);
  }
});

test("canonical memory-block audit excludes only the migrated build pilot", () => {
  assert.deepEqual(MIGRATED_SKILLS, ["build"]);
  assert.equal(CORE_SKILLS.includes("build"), false);
  const audit = auditSkills({ root: repoRoot, canonical: loadCanonicalBlock(repoRoot) });
  assert.equal(audit.length, CORE_SKILLS.length);
  assert.equal(audit.every((entry) => entry.status === "ok"), true);
});
