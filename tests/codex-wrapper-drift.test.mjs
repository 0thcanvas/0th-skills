import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const generatorPath = path.join(repoRoot, "scripts", "build-codex-wrappers.mjs");

test("Codex wrappers match the compact generated form", () => {
  const result = spawnSync("node", [generatorPath, "--check"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Codex wrappers are in sync \(\d+ skills\)\./);
});
