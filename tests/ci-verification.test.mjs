import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("fresh-checkout CI runs the full suite and plugin smoke check", () => {
  const workflowPath = path.join(repoRoot, ".github", "workflows", "verify.yml");
  assert.equal(fs.existsSync(workflowPath), true, "verification workflow should exist");
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:/);
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /node scripts\/install-smoke-check\.mjs --repo-root \./);
});
