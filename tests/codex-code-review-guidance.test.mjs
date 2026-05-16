import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const agentsPath = path.join(repoRoot, "AGENTS.md");
const claudePath = path.join(repoRoot, "CLAUDE.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("AGENTS.md exposes the canonical shared instructions for Codex review", () => {
  assert.equal(
    fs.lstatSync(agentsPath).isSymbolicLink(),
    true,
    "AGENTS.md should remain a symlink so Codex and Claude read the same guidance"
  );
  assert.equal(fs.readlinkSync(agentsPath), "CLAUDE.md");
});

test("canonical instructions include Codex GitHub review guidance", () => {
  const source = read(claudePath);

  assert.match(source, /^## Review guidelines$/m);
  assert.match(source, /P0\/P1 issues/);
  assert.match(source, /resolved secret values/);
  assert.match(source, /behavior changes without matching verification evidence/);
  assert.match(source, /mirrored Claude and Codex surfaces/);
  assert.match(source, /Codex-facing skill changes/);
  assert.match(source, /subagent dispatch, recursion, sandboxing, or model policy changes/);
});
