import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(repoRoot, relative), "utf8");
const policy = read("references/secret-control-policy.md");

test("portable secret policy resolves a configured provider", () => {
  assert.match(policy, /secret_runtime/);
  assert.match(policy, /runtime profile or\s+project instructions select/is);
  assert.match(policy, /guidance returned by `secret_runtime`/i);
  assert.match(policy, /portable\s+workflow does not invent provider commands/is);
  assert.doesNotMatch(policy, /1Password|op inject|op:\/\//);
});

test("the local fallback is constrained to project development configuration", () => {
  assert.match(policy, /plaintext development fallback/i);
  assert.match(policy, /regular, owner-only, mode `600`, and gitignored/is);
  assert.match(policy, /Production reconstructs configuration/is);
  assert.match(policy, /production secrets,\s+personal credentials,\s+seed phrases,\s+derived private keys/is);
});

test("credential blockers require the project loader and one intentional sync", () => {
  assert.match(policy, /missing variable in the current process is not proof/i);
  assert.match(policy, /before\s+(?:returning|reporting) `BLOCKED` or `BLOCKED_REAL_ENV`/i);
  assert.match(policy, /attempt one provider sync or refresh/i);
  assert.match(policy, /blocked receipt names each attempted safe runner/i);

  const workflow = read("references/workflow-verification.md");
  assert.match(workflow, /generated gitignored owner-only env file/i);
  assert.match(workflow, /missing variables in the current process alone/i);
  assert.match(workflow, /attempted safe runner/i);
});

test("shared workflow and build skill route to the canonical secret policy", () => {
  assert.match(read("references/skills-kernel.md"), /secret-control-policy\.md/);
  assert.match(read("skills/build/SKILL.md"), /secret-control-policy\.md/);
});

test("provider guide owns the personal secret-manager commands", () => {
  const profile = read("adapters/templates/runtime-profiles/personal.json");
  const guide = read("adapters/providers/onepassword.md");

  assert.match(profile, /"provider": "onepassword"/);
  assert.match(profile, /adapters\/providers\/onepassword\.md/);
  assert.match(guide, /1Password/);
  assert.match(guide, /`0th secrets sync`/);
  assert.match(guide, /op:\/\/vault\/item\/field/);
});

test("shared verifier surfaces use the portable steady state", () => {
  for (const file of [
    "agents/verifier.md",
    ".codex/agents/0th-verifier.toml",
    "references/workflow-verification.md",
  ]) {
    const source = read(file);
    assert.match(source, /configured|gitignored/i, file);
    assert.match(source, /sync/i, file);
    assert.match(source, /normal commands|recurring/i, file);
    assert.match(source, /secret provider|secret_runtime|configured provider/i, file);
    assert.doesNotMatch(source, /1Password|op read|op inject/, file);
  }
});
