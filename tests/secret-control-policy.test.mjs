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

test("credential blockers require the complete safe-runner preflight", () => {
  assert.match(policy, /missing variable in the current process is not proof/i);
  assert.match(policy, /op run --env-file/);
  assert.match(policy, /before\s+(?:returning|reporting) `BLOCKED` or `BLOCKED_REAL_ENV`/i);
  assert.match(policy, /attempted safe runner/i);

  const workflow = read("references/workflow-verification.md");
  assert.match(workflow, /credential-dependent proof/i);
  assert.match(workflow, /missing variables in the current process alone/i);
  assert.match(workflow, /attempted safe runner/i);
});

test("recurring secret workflows reuse one mounted Environment instead of repeated op run", () => {
  assert.match(policy, /recurring.*steady state.*mounted 1Password Environment/is);
  assert.match(policy, /FIFO|UNIX.*named pipe/i);
  assert.match(policy, /directly through.*loader.*without wrapping.*`op run`/is);
  assert.match(policy, /`op run --env-file`.*one-off.*bootstrap.*fallback/is);
  assert.match(policy, /terminal-session.*authorization.*repeated prompts/is);

  for (const file of [
    "CLAUDE.md",
    "agents/verifier.md",
    ".codex/agents/0th-verifier.toml",
    "references/workflow-verification.md",
  ]) {
    const source = read(file);
    assert.match(source, /recurring/i, file);
    assert.match(source, /mounted 1Password Environment/i, file);
    assert.match(source, /one-off|bootstrap/i, file);
    assert.match(source, /repeated.*`op run`|`op run`.*repeated/is, file);
  }
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
    assert.match(source, /missing variable in the current process is not proof/i, file);
    assert.match(source, /op run --env-file/i, file);
    assert.match(source, /attempted safe runner/i, file);
  }
});

test("workspace prompt rejects process-env-only blockers and kernel routes to policy", () => {
  const workspace = read("CLAUDE.md");
  assert.match(workspace, /missing variable in the current process is not proof/i);
  assert.match(workspace, /BLOCKED/i);

  const kernel = read("references/skills-kernel.md");
  assert.match(kernel, /Apply `secret-control-policy\.md`/);
  assert.match(kernel, /BLOCKED_REAL_ENV/);
});
