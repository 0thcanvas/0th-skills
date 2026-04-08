import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "..", "scripts", "counterpart-companion.mjs");

function run(args, env = {}) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    cwd: __dirname,
    env: { ...process.env, ...env },
    timeout: 10000,
  });
}

test("exits 127 when binary not found", () => {
  const result = run(
    ["task", "--driver", "claude", "hello"],
    { CLAUDE_BIN: "/nonexistent/binary/that/does/not/exist" }
  );
  assert.equal(result.status, 127);
  assert.ok(result.stderr.includes("not found"), `stderr should mention 'not found', got: ${result.stderr}`);
  assert.equal(result.stdout, "");
});

test("exits with non-zero on subprocess failure", () => {
  const result = run(
    ["task", "--driver", "codex", "hello"],
    { CODEX_BIN: "false" }
  );
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
});

test("rejects unknown driver name", () => {
  const result = run(["task", "--driver", "notreal", "hello"]);
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("Unknown driver"), `stderr should mention 'Unknown driver', got: ${result.stderr}`);
  assert.equal(result.stdout, "");
});

test("stdout is always empty on failure", () => {
  const result = run(
    ["task", "--driver", "codex", "hello"],
    { CODEX_BIN: "/no/such/binary" }
  );
  assert.equal(result.stdout, "", "stdout must be empty on failure");
  assert.notEqual(result.status, 0);
});
