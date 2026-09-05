import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("think records only durable decisions that are not already owned by a current contract", () => {
  const think = read("skills/think/SKILL.md");

  assert.match(think, /smallest durable record/i);
  assert.match(think, /hard to reverse/i);
  assert.match(think, /surprising without context/i);
  assert.match(think, /current contract/i);
  assert.doesNotMatch(think, /Once aligned, write `docs\/decisions/);
});

test("internal plans are temporary and committed plans require lasting shared value", () => {
  const plan = read("skills/plan/SKILL.md");
  const lifecycle = read("references/working-artifacts.md");

  assert.match(plan, /working-artifacts\.md/i);
  assert.match(plan, /committed plan/i);
  assert.match(plan, /lasting shared value/i);
  assert.doesNotMatch(plan, /Save the checklist to `docs\/plans/);
  assert.match(lifecycle, /Git history.*historical record/is);
  assert.match(lifecycle, /merge.*abandon.*delete/is);
});

test("historical workflow documents do not remain in the current source tree", () => {
  for (const directory of ["docs/decisions", "docs/plans", "docs/evals"]) {
    const absolute = path.join(repoRoot, directory);
    const files = fs.existsSync(absolute)
      ? fs.readdirSync(absolute).filter((entry) => !entry.startsWith("."))
      : [];
    assert.deepEqual(files, [], `${directory} should not contain historical artifacts`);
  }

  const readme = read("README.md");
  assert.doesNotMatch(readme, /^### 0\.[123]\./m);
});

test("retro reads a current incident contract instead of a dated decision", () => {
  const retro = read("skills/retro/SKILL.md");
  const incidentContract = "skills/retro/references/incident-contract.md";

  assert.match(retro, /references\/incident-contract\.md/);
  assert.equal(fs.existsSync(path.join(repoRoot, incidentContract)), true);
  assert.doesNotMatch(retro, /docs\/decisions/);
});

test("machine continuity points to canonical evidence instead of duplicating it", () => {
  const memory = read("references/memory-contract.md");
  const artifacts = read("references/working-artifacts.md");

  assert.match(memory, /continuity index/i);
  assert.match(memory, /do not duplicate/i);
  assert.match(memory, /active claims and open or blocked loops/i);
  assert.match(artifacts, /one canonical owner/i);
});

test("the markdown KB is optional and retrieved only when a task points to it", () => {
  const protocol = read("PROTOCOL.md");
  const research = read("skills/research/SKILL.md");

  assert.match(protocol, /optional evidence provider/i);
  assert.match(protocol, /do not read the KB at every session start/i);
  assert.doesNotMatch(protocol, /At the start of a session:/);
  assert.doesNotMatch(research, /For durable findings, write the appropriate KB `raw\/` note/);
});
