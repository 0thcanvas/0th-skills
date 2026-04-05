import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "install-smoke-check.mjs");

test("install smoke-check validates the repo packaging", () => {
  const result = spawnSync("node", [scriptPath, "--repo-root", repoRoot], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Smoke check passed for version \d+\.\d+\.\d+/);
});
