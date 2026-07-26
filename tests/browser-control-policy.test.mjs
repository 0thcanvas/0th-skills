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

test("portable browser policy treats configured identities as exact", () => {
  const policy = read("references/browser-control-policy.md");

  for (const fragment of [
    "exact application, profile, account, extension build, and session",
    "runtime profile",
    "not an equivalent session",
    "Never substitute another browser identity"
  ]) {
    assert.ok(policy.includes(fragment), `browser policy should include "${fragment}"`);
  }
  assert.doesNotMatch(policy, /Browser Kit|Google Chrome|Computer Use/);
});

test("browser policy separates hermetic automation from session-backed proof", () => {
  const policy = read("references/browser-control-policy.md");

  assert.match(policy, /Hermetic automation/);
  assert.match(policy, /Session-backed proof/);
  assert.match(policy, /test runtimes never silently satisfy.*real-user/is);
  assert.match(policy, /logged_in_browser/);
  assert.match(policy, /anti-bot/i);
});

test("browser recovery resolves separate provider capabilities before giving up", () => {
  const policy = read("references/browser-control-policy.md");

  assert.match(policy, /logged_in_browser/);
  assert.match(policy, /provider guide/);
  assert.match(policy, /browser_ui_fallback/);
  assert.match(policy, /confirmation boundary/i);
  assert.match(policy, /BLOCKED_REAL_ENV/);
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

  assert.match(read("references/stack-minimums.md"), /session-backed-browser/);
  assert.match(read("references/stack-minimums.md"), /logged_in_browser/);
});

test("personal profile owns the concrete local browser bindings", () => {
  const profile = read("adapters/templates/runtime-profiles/personal.json");
  const guide = read("adapters/providers/browser-kit.md");

  assert.match(profile, /"provider": "browser-kit"/);
  assert.match(profile, /"provider": "computer-use"/);
  assert.match(guide, /\/Applications\/Google Chrome\.app/);
  assert.match(guide, /browser-kit session open --provider chrome --profile agent/);
});
