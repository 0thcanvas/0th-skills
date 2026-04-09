import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const claudeAgentsDir = path.join(repoRoot, "agents");
const codexAgentsDir = path.join(repoRoot, ".codex", "agents");
const readmePath = path.join(repoRoot, "README.md");

const expectedMirrors = {
  implementer: {
    codexFile: "0th-implementer.toml",
    claudeFile: "implementer.md",
    requiredFragments: [
      "Run tests after every change",
      "NEEDS_CONTEXT",
      "STATUS: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED"
    ]
  },
  reviewer: {
    codexFile: "0th-reviewer.toml",
    claudeFile: "reviewer.md",
    requiredFragments: [
      "VERDICT: APPROVE | CONCERNS | REJECT",
      "Scope: CONTAINED | CREEP",
      "beyond the slice scope"
    ]
  },
  "test-runner": {
    codexFile: "0th-test-runner.toml",
    claudeFile: "test-runner.md",
    requiredFragments: [
      "PASS: X files, Y tests. 0 failures.",
      "FAIL: X of Y tests failed.",
      "Never return raw test output"
    ]
  },
  verifier: {
    codexFile: "0th-verifier.toml",
    claudeFile: "verifier.md",
    requiredFragments: [
      "Outcome: PASS | FAIL_UNRESOLVED | BLOCKED | FAIL_FLAKY",
      "Classify failure type",
      "Max 3 verification rounds"
    ]
  }
};

const expectedClaudeOnly = ["ask-counterpart-review", "ask-claude-review", "ask-codex-review", "web-researcher"];
const expectedCodexOnly = ["explorer", "researcher"];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error("Missing frontmatter");
  }

  const fields = {};
  for (const line of match[1].split("\n")) {
    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2];
    }
  }
  return fields;
}

function parseTomlScalarMap(toml) {
  const fields = {};
  for (const line of toml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (match) {
      const rawValue = match[2].trim();

      if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        fields[match[1]] = rawValue.slice(1, -1);
        continue;
      }

      if (rawValue === "true" || rawValue === "false") {
        fields[match[1]] = rawValue === "true";
        continue;
      }

      if (/^-?\d+$/.test(rawValue)) {
        fields[match[1]] = Number(rawValue);
        continue;
      }

      fields[match[1]] = rawValue;
    }
  }
  return fields;
}

test("codex config pins conservative subagent orchestration defaults", () => {
  const config = read(path.join(repoRoot, ".codex", "config.toml"));

  assert.match(config, /\[agents\]/);
  assert.match(config, /max_threads = 4/);
  assert.match(config, /max_depth = 1/);
});

test("mirrored Claude agents have Codex counterparts with explicit runtime settings", () => {
  for (const [agentName, config] of Object.entries(expectedMirrors)) {
    const claudePath = path.join(claudeAgentsDir, config.claudeFile);
    const codexPath = path.join(codexAgentsDir, config.codexFile);
    const claudeSource = read(claudePath);
    const codexSource = read(codexPath);

    const claudeMeta = parseFrontmatter(claudeSource);
    const codexMeta = parseTomlScalarMap(codexSource);

    assert.ok(claudeMeta.name, `${agentName} Claude manifest should declare a name`);
    assert.ok(codexMeta.name, `${agentName} Codex manifest should declare a name`);
    assert.ok(codexMeta.model, `${agentName} Codex manifest should pin a model`);
    assert.ok(
      codexMeta.model_reasoning_effort,
      `${agentName} Codex manifest should pin reasoning effort`
    );
    assert.ok(codexMeta.sandbox_mode, `${agentName} Codex manifest should pin sandbox mode`);

    for (const fragment of config.requiredFragments) {
      assert.ok(
        claudeSource.includes(fragment),
        `${agentName} Claude manifest should contain "${fragment}"`
      );
      assert.ok(
        codexSource.includes(fragment),
        `${agentName} Codex manifest should contain "${fragment}"`
      );
    }
  }
});

test("README documents the deliberate asymmetry between mirrored and Claude-only agents", () => {
  const readme = read(readmePath);

  for (const agentName of Object.keys(expectedMirrors)) {
    assert.ok(readme.includes(agentName), `README should mention mirrored agent ${agentName}`);
  }

  for (const agentName of expectedClaudeOnly) {
    assert.ok(readme.includes(agentName), `README should mention Claude-only agent ${agentName}`);
  }

  for (const agentName of expectedCodexOnly) {
    assert.ok(readme.includes(agentName), `README should mention Codex-only agent ${agentName}`);
  }

  assert.ok(
    readme.includes("host-native parity, not identical files"),
    "README should explain the parity philosophy"
  );
});
