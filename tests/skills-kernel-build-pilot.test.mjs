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
  assert.ok(lineCount < 120, `build pilot should stay below 120 lines, got ${lineCount}`);
  assert.ok(wordCount < 700, `build pilot should stay below 700 words, got ${wordCount}`);
});

test("build uses the kernel default and defers delegation mechanics", () => {
  const source = read("skills/build/SKILL.md");

  for (const fragment of [
    "Default: one root agent",
    "references/delegation.md",
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
    "Do not continue in the main thread",
    "node scripts/0th.mjs capabilities",
    "--runtime-json",
    "--packet-json",
    "scripts/0th.mjs dispatch",
    "scripts/0th.mjs attest"
  ]) {
    assert.equal(source.includes(forbidden), false, `build pilot should not include ${forbidden}`);
  }
});

test("build pilot preserves executable proof, authority, and closeout contracts", () => {
  const source = read("skills/build/SKILL.md");

  for (const fragment of [
    "proof_contract_required",
    "ship-bound implementation work requires",
    "docs-only or",
    "metadata-only changes still use a `T0` contract when ship-bound",
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

test("canonical memory-block audit is empty after the complete migration", () => {
  assert.equal(MIGRATED_SKILLS.length, 9);
  assert.deepEqual(CORE_SKILLS, []);
  const audit = auditSkills({ root: repoRoot, canonical: loadCanonicalBlock(repoRoot) });
  assert.deepEqual(audit, []);
});
