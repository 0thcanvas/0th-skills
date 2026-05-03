import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const examplePath = path.join(repoRoot, "FEEDBACK.example.md");
const livePath = path.join(repoRoot, "FEEDBACK.md");

test("FEEDBACK.example.md exists at the repo root as the seed template", () => {
  assert.ok(
    fs.existsSync(examplePath),
    "FEEDBACK.example.md should ship at the skills repo root so users have a template to copy locally"
  );
});

test("FEEDBACK.example.md contains the four canonical anchors users expect", () => {
  const source = fs.readFileSync(examplePath, "utf8");

  assert.match(source, /^# Skill Feedback\b/m, "should declare the canonical title `# Skill Feedback`");
  assert.match(
    source,
    /drop a one-liner here/i,
    "should keep the 'drop a one-liner here' process line so the migration comparator's template detection works"
  );
  assert.match(
    source,
    /^Format: `- \/skill: what felt wrong \(YYYY-MM-DD\)`$/m,
    "should keep the canonical Format: line verbatim"
  );
  assert.match(source, /^---\s*$/m, "should keep the `---` separator that divides template prose from user entries");
});

test("committed FEEDBACK.md is preserved in this release for the migration overlap", () => {
  // Decision: skills/FEEDBACK.md is kept for one release alongside FEEDBACK.example.md
  // so the migration check has something to find. It is removed in v0.2.4.
  assert.ok(
    fs.existsSync(livePath),
    "skills/FEEDBACK.md should still ship in v0.2.3 — removal is the v0.2.4 follow-up"
  );
});
