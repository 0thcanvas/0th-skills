import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readme = readFileSync(path.join(__dirname, "..", "README.md"), "utf8");

test("README documents user-scope failure dossier hook installation for both hosts", () => {
  assert.match(readme, /Failure dossier hooks/);
  assert.match(readme, /scripts\/failure-dossier-runner\.mjs/);
  assert.match(readme, /scripts\/codex-failure-hook\.mjs/);
  assert.match(readme, /scripts\/claude-failure-hook\.mjs/);
  assert.match(readme, /user-scope/);
  assert.match(readme, /does not auto-install/i);
});
