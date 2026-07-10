import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(repoRoot, relative), "utf8");
const estimatedTokens = text => Math.ceil(text.length / 4);

test("always-read kernel keeps optional delegation mechanics deferred", () => {
  const kernel = read("references/skills-kernel.md");
  const delegation = read("references/delegation.md");

  assert.ok(estimatedTokens(kernel) <= 1150, `kernel budget exceeded: ${estimatedTokens(kernel)} tokens`);
  assert.match(kernel, /references\/delegation\.md/);
  assert.ok(estimatedTokens(delegation) >= 500, "delegation details should remain preserved out of line");
});

test("build plus kernel stays below the active instruction budget", () => {
  const kernelTokens = estimatedTokens(read("references/skills-kernel.md"));
  const buildTokens = estimatedTokens(read("skills/build/SKILL.md"));

  assert.ok(buildTokens <= 1350, `build budget exceeded: ${buildTokens} tokens`);
  assert.ok(kernelTokens + buildTokens <= 2450, `active build instructions exceed budget: ${kernelTokens + buildTokens} tokens`);
});

test("shared references are an on-demand index, not an eager read set", () => {
  const kernel = read("references/skills-kernel.md");
  const build = read("skills/build/SKILL.md");

  assert.match(kernel, /Shared references.*index.*not.*startup reading list/is);
  assert.match(kernel, /load.*only when.*triggering condition applies/i);
  assert.match(build, /lightweight build lane.*do not load.*stack-minimums\.md/is);
  assert.match(build, /full-lane work.*read.*stack-minimums\.md/is);
});

test("memory closeout uses the executable gate before the full contract", () => {
  const kernel = read("references/skills-kernel.md");
  const build = read("skills/build/SKILL.md");

  assert.match(kernel, /memory\.mjs" write-gate/);
  assert.match(kernel, /read `memory-contract\.md` only\s+when/i);
  assert.doesNotMatch(build, /Run the Memory Write Gate from\s+`\.\.\/\.\.\/references\/memory-contract\.md`/);
});
