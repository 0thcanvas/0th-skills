import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");

function markdownFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return markdownFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
  });
}

test("portable workflow surfaces use capabilities instead of personal provider names", () => {
  const portableFiles = [
    path.join(repoRoot, "CLAUDE.md"),
    ...markdownFiles(path.join(repoRoot, "skills")),
    ...[
      "references/browser-control-policy.md",
      "references/delegation.md",
      "references/execution-policy.md",
      "references/model-routing.md",
      "references/secret-control-policy.md",
      "references/skills-kernel.md",
      "references/specialist-routing.md",
      "references/stack-minimums.md",
      "references/workflow-verification.md",
      "agents/implementer.md",
      "agents/reviewer.md",
      "agents/test-runner.md",
      "agents/verifier.md",
      "agents/web-researcher.md"
    ].map((relativePath) => path.join(repoRoot, relativePath))
  ];
  const personalProvider = /\b(?:1Password|Browser Kit|browser-kit|bb-browser|OpenCLI|Computer Use|Google Chrome)\b/i;
  const harnessName = /\b(?:Codex|Claude|Grok|Antigravity|Pi)\b/i;

  for (const file of portableFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      personalProvider,
      `${path.relative(repoRoot, file)} should route a portable capability instead of naming a personal provider`
    );
    assert.doesNotMatch(
      source,
      harnessName,
      `${path.relative(repoRoot, file)} should use the harness adapter boundary instead of naming a harness`
    );
  }
});

test("provider-specific operating details live under adapter guides", () => {
  for (const relativePath of [
    "adapters/providers/computer-use.md",
    "adapters/providers/opencli.md",
    "adapters/providers/onepassword.md",
    "adapters/providers/browser-kit.md",
    "adapters/harnesses/codex.md",
    "references/project-registry.md"
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, relativePath)), true, `${relativePath} should exist`);
  }

  const profile = JSON.parse(fs.readFileSync(
    path.join(repoRoot, "adapters/templates/runtime-profiles/personal.json"),
    "utf8"
  ));
  assert.deepEqual(
    profile.capabilities.secret_runtime.guidance,
    ["adapters/providers/onepassword.md"]
  );
  assert.deepEqual(
    profile.capabilities.logged_in_browser.guidance,
    ["adapters/providers/browser-kit.md"]
  );
});
