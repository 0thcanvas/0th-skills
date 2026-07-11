import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => fs.readFileSync(path.join(repoRoot, relative), "utf8");
const policy = read("references/secret-control-policy.md");

test("recurring development uses an explicit persistent local cache", () => {
  assert.match(policy, /1Password.*centralized source of truth/i);
  assert.match(policy, /explicit project sync command.*only normal operation.*contacts 1Password/is);
  assert.match(policy, /git check-ignore/);
  assert.match(policy, /op inject --in-file.*--out-file.*--file-mode 0600/is);
  assert.match(policy, /atomically replace/i);
  assert.match(policy, /do not contact 1Password.*continue to work when.*locked/is);
});

test("the cache is constrained to project development configuration", () => {
  assert.match(policy, /plaintext local development cache/i);
  assert.match(policy, /regular file owned.*mode `600`.*gitignored/is);
  assert.match(policy, /deployment.*never uploads.*generated local file/is);
  assert.match(policy, /seed phrases, derived wallet private keys/i);
  assert.match(policy, /wallet material is user data,\s*not project configuration/i);
});

test("credential blockers require the project loader and one intentional sync", () => {
  assert.match(policy, /missing variable in the current process is not proof/i);
  assert.match(policy, /run the documented project\s*sync once/i);
  assert.match(policy, /before\s+(?:returning|reporting) `BLOCKED` or `BLOCKED_REAL_ENV`/i);
  assert.match(policy, /attempted safe runner/i);

  const workflow = read("references/workflow-verification.md");
  assert.match(workflow, /generated local env file/i);
  assert.match(workflow, /missing variables in the current process alone/i);
  assert.match(workflow, /attempted safe runner/i);
});

test("shared workflow and build skill route to the canonical secret policy", () => {
  assert.match(read("references/skills-kernel.md"), /secret-control-policy\.md/);
  assert.match(read("skills/build/SKILL.md"), /secret-control-policy\.md/);
});

test("workspace and verifier instructions use the same steady state", () => {
  for (const file of [
    "CLAUDE.md",
    "agents/verifier.md",
    ".codex/agents/0th-verifier.toml",
    "references/workflow-verification.md",
  ]) {
    const source = read(file);
    assert.match(source, /generated|gitignored/i, file);
    assert.match(source, /sync/i, file);
    assert.match(source, /normal commands|recurring/i, file);
    assert.match(source, /contact.*1Password|1Password.*contact/i, file);
  }
});
