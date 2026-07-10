import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(repoRoot, "CLAUDE.md"), "utf8");

test("CLAUDE.md does not duplicate repo process or skill documentation", () => {
  assert.doesNotMatch(source, /^## Skills$/m);
  assert.doesNotMatch(source, /^## Skill Routing$/m);
  assert.doesNotMatch(source, /^## Operating Contract$/m);
  assert.doesNotMatch(source, /^## Repository$/m);
  assert.doesNotMatch(source, /counterpart|cross-model review/i);
  assert.doesNotMatch(source, /feature branch|land through a PR|AGENTS\.md|installed cache/i);
  assert.doesNotMatch(source, /Skill behavior and routing live/i);
  assert.doesNotMatch(source, /references\/(skills-kernel|specialist-routing|workflow-verification|memory-contract)\.md/);
});

test("CLAUDE.md contains only the exceptional browser and safety boundaries", () => {
  assert.deepEqual(
    [...source.matchAll(/^## (.+)$/gm)].map(match => match[1]),
    ["Browser", "Safety"]
  );
  assert.match(source, /references\/browser-control-policy\.md/);
  assert.match(source, /resolved secret values/i);
  assert.match(source, /op run --env-file/);
});

test("CLAUDE.md remains a small repository instruction file", () => {
  const lines = source.trimEnd().split("\n").length;
  const words = source.trim().split(/\s+/).length;

  assert.ok(lines <= 18, `CLAUDE.md should be at most 18 lines, got ${lines}`);
  assert.ok(words <= 160, `CLAUDE.md should be at most 160 words, got ${words}`);
});
