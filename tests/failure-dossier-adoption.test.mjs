import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const adoptionFiles = [
  "skills/build/SKILL.md",
  "skills/debug/SKILL.md",
  "agents/test-runner.md",
  "agents/verifier.md",
  ".codex/agents/0th-test-runner.toml",
  ".codex/agents/0th-verifier.toml"
];

test("managed verification prompts adopt the failure dossier runner", () => {
  for (const file of adoptionFiles) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    assert.match(source, /failure-dossier-runner\.mjs/, `${file} should name the dossier runner`);
    assert.match(source, /--run-id/, `${file} should require an explicit run id`);
  }
});

test("shipped prompts do not tell agents to parse tool_response for Bash failures", () => {
  for (const file of adoptionFiles) {
    const source = readFileSync(path.join(repoRoot, file), "utf8");
    assert.doesNotMatch(
      source,
      /parse[s]? [`'"]?tool_response[`'"]?/i,
      `${file} should not revive the rejected Codex tool_response parsing design`
    );
  }
});
