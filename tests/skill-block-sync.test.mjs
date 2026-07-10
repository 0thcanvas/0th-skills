// Drift detector for the canonical skill memory block (PR #19 review C8).
//
// Before this test existed, the five-section preamble ("Repo Preflight",
// "Memory Brief", "Open Loop Brief", "Memory Integration", "Open Loop
// Integration") was hand-copied into nine SKILL.md files with no test
// enforcing identity. tests/skill-metadata.test.mjs covers PRESENCE of
// fragments via regex but does not catch DIVERGENCE; an edit to one file
// could silently leave the others contradicting it.
//
// This test runs the audit half of scripts/skill-block-sync.mjs on every
// invocation. To intentionally change the block, edit references/
// skill-memory-block.md and run `node scripts/skill-block-sync.mjs --write`
// — the script propagates the change into every SKILL.md and the test
// goes back to green.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSkills, loadCanonicalBlock, CORE_SKILLS, MIGRATED_SKILLS } from "../scripts/skill-block-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

test("all shared skills have migrated away from the duplicated legacy memory block", () => {
  const canonical = loadCanonicalBlock(repoRoot);
  const audit = auditSkills({ root: repoRoot, canonical });
  const failures = audit.filter((entry) => entry.status !== "ok");

  if (failures.length > 0) {
    const lines = failures.map(
      (entry) => `  - ${entry.skill}/SKILL.md: ${entry.status} (${entry.actualBytes}/${entry.canonicalBytes} bytes)`
    );
    assert.fail(
      [
        "skill memory block drift detected:",
        ...lines,
        "Run `node scripts/skill-block-sync.mjs --write` to restore canonical block from references/skill-memory-block.md."
      ].join("\n")
    );
  }
  assert.equal(audit.length, 0, "no migrated skill should remain in the legacy audit");
  assert.deepEqual(CORE_SKILLS, []);
  assert.deepEqual(MIGRATED_SKILLS, [
    "build",
    "debug",
    "deep-research",
    "improve-architecture",
    "plan",
    "research",
    "retro",
    "ship",
    "think"
  ]);
});

test("legacy block points migrated workflows to compact startup", () => {
  const canonical = loadCanonicalBlock(repoRoot);
  assert.match(canonical, /^## Legacy startup replacement$/m);
  assert.match(canonical, /memory\.mjs" startup --query/);
  assert.match(canonical, /do not read full generated briefs by default/i);
});
