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

test("browser policy treats browser names as exact app identities", () => {
  const policy = read("references/browser-control-policy.md");

  for (const fragment of [
    "/Applications/Google Chrome.app",
    "/Applications/Brave Browser.app",
    "explicitly requests Brave",
    "--provider chrome --profile agent",
    "never silently substitute"
  ]) {
    assert.ok(policy.includes(fragment), `browser policy should include "${fragment}"`);
  }
});

test("browser policy separates hermetic automation from real-environment proof", () => {
  const policy = read("references/browser-control-policy.md");

  assert.match(policy, /Hermetic automation/);
  assert.match(policy, /Real-environment proof/);
  assert.match(policy, /Chrome for Testing.*must not satisfy.*real-environment proof/is);
  assert.match(policy, /anti-bot/i);
});

test("real Chrome extension recovery reaches Computer Use before giving up", () => {
  const policy = read("references/browser-control-policy.md");

  assert.match(policy, /Computer Use/);
  assert.match(policy, /Google Chrome/);
  assert.match(policy, /chrome:\/\/extensions/);
  assert.match(policy, /Load unpacked/);
  assert.match(policy, /confirmation/i);
  assert.match(policy, /exact blocker/i);
});

test("build, debug, and verifier surfaces route through the browser policy", () => {
  for (const relativePath of [
    "CLAUDE.md",
    "skills/debug/SKILL.md",
    "skills/build/references/verification-checklist.md",
    "references/stack-minimums.md",
    "agents/verifier.md",
    ".codex/agents/0th-verifier.toml"
  ]) {
    assert.match(
      read(relativePath),
      /browser-control-policy\.md/,
      `${relativePath} should route through the shared browser policy`
    );
  }

  assert.doesNotMatch(read("references/stack-minimums.md"), /Chrome-for-Testing by default/);
  assert.match(read("references/stack-minimums.md"), /--provider chrome --profile agent/);
});
