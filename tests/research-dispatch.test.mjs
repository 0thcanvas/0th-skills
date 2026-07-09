import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("portable workflows use capability-gated packets instead of permanent dispatch roles", () => {
  const kernel = read("references/skills-kernel.md");
  const phaseGuide = read("skills/deep-research/references/phase-guide.md");
  const sharedSkills = ["debug", "think", "plan", "research", "deep-research"]
    .map((name) => read(`skills/${name}/SKILL.md`));
  const wrappers = ["research", "deep-research"]
    .map((name) => read(`codex-skills/${name}/SKILL.md`));

  assert.match(kernel, /Default: one root agent/);
  assert.match(kernel, /capability packet/);
  assert.match(kernel, /live, fresh capability record/);
  assert.match(kernel, /evidence advantage/);
  assert.match(kernel, /disproportionate inherited effort/);

  for (const source of sharedSkills) {
    assert.match(source, /\.\.\/\.\.\/references\/skills-kernel\.md/);
    assert.doesNotMatch(source, /Codex-hosted|Claude-hosted|spawn_agent|0th_(?:explorer|test_runner|researcher|deep_researcher|synthesizer|experimenter)/);
  }

  for (const packet of ["Search", "Deep extraction", "Synthesis", "Experiment"]) {
    assert.match(phaseGuide, new RegExp(`\\| ${packet} \\|`));
  }
  assert.match(phaseGuide, /Packet names describe work, not permanent roles/);
  assert.match(phaseGuide, /missing or stale runtime capabilities keep the work in the root/);

  for (const wrapper of wrappers) {
    assert.match(wrapper, /shared workflow/);
    assert.doesNotMatch(wrapper, /dispatch note|spawn_agent|0th_/i);
  }
});
