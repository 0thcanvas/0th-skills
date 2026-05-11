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
import { auditSkills, loadCanonicalBlock, CORE_SKILLS } from "../scripts/skill-block-sync.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

test("every core SKILL.md contains the canonical memory block byte-for-byte", () => {
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
  assert.equal(audit.length, CORE_SKILLS.length, "audit covers every core skill");
});

test("canonical block names every required section heading", () => {
  // Defensive: if someone removes a section from the reference file, every
  // SKILL.md will silently match a degraded canonical. Keep an independent
  // check that the canonical itself names all five sections.
  const canonical = loadCanonicalBlock(repoRoot);
  for (const heading of [
    "## Repo Preflight",
    "## Memory Brief",
    "## Open Loop Brief",
    "## Memory Integration",
    "## Open Loop Integration"
  ]) {
    assert.match(canonical, new RegExp(`^${heading}$`, "m"), `canonical missing: ${heading}`);
  }
});
