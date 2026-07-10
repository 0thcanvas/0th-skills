import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(repoRoot, relative), "utf8");
const policy = read("references/secret-control-policy.md");

test("secret policy prefers a mounted 1Password Environment without repeated prompts", () => {
  assert.match(policy, /1Password.*source of truth/i);
  assert.match(policy, /mounted.*\.env/i);
  assert.match(policy, /named pipe/i);
  assert.match(policy, /until 1Password locks/i);
  assert.match(policy, /do not.*contact 1Password.*each command/i);
});

test("secret policy permits a narrow plaintext development fallback", () => {
  assert.match(policy, /fallback/i);
  assert.match(policy, /project-scoped development secrets/i);
  assert.match(policy, /git check-ignore/);
  assert.match(policy, /chmod 600/);
  assert.match(policy, /production|personal credentials/i);
});

test("secret policy keeps resolved values outside agent-visible output", () => {
  assert.match(policy, /run the consuming application/i);
  assert.match(policy, /do not `cat`, `head`, `grep`/i);
  assert.match(policy, /prompts, chat, argv, logs, screenshots/i);
  assert.match(policy, /missing, stale, or explicitly being rotated/i);
});

test("shared workflow and build skill route to the canonical secret policy", () => {
  assert.match(read("references/skills-kernel.md"), /secret-control-policy\.md/);
  assert.match(read("skills/build/SKILL.md"), /secret-control-policy\.md/);
});

test("Claude and Codex verifiers share the local environment precedence", () => {
  for (const file of ["agents/verifier.md", ".codex/agents/0th-verifier.toml"]) {
    const source = read(file);
    assert.match(source, /mounted 1Password Environment/i, file);
    assert.match(source, /ignored.*\.env/i, file);
    assert.match(source, /missing, stale, or explicitly being rotated/i, file);
  }
});
