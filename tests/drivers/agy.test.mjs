import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadDriver() {
  const driverPath = path.resolve(__dirname, "..", "..", "scripts", "drivers", "agy.mjs");
  const { default: driver } = await import(driverPath);
  return driver;
}

test("driver has the correct name", async () => {
  const driver = await loadDriver();
  assert.equal(driver.name, "agy");
});

test("driver bin is configured", async () => {
  const driver = await loadDriver();
  assert.equal(typeof driver.bin, "string");
  assert.ok(driver.bin.length > 0);
});

test("driver bin defaults to 'agy' when AGY_BIN is not set before import", () => {
  const driverPath = path.resolve(__dirname, "..", "..", "scripts", "drivers", "agy.mjs");
  const env = { ...process.env };
  delete env.AGY_BIN;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import driver from ${JSON.stringify(driverPath)}; console.log(driver.bin);`
    ],
    { encoding: "utf8", env }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "agy");
});

test("driver bin honors AGY_BIN when set before import", () => {
  const driverPath = path.resolve(__dirname, "..", "..", "scripts", "drivers", "agy.mjs");
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import driver from ${JSON.stringify(driverPath)}; console.log(driver.bin);`
    ],
    {
      encoding: "utf8",
      env: { ...process.env, AGY_BIN: "/custom/bin/agy" }
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "/custom/bin/agy");
});

test("driver env is an empty object", async () => {
  const driver = await loadDriver();
  assert.deepEqual(driver.env, {});
});

test("supportsResume is false because agy print mode emits prior transcript text on resume", async () => {
  const driver = await loadDriver();
  assert.equal(driver.supportsResume, false);
});

test("stateSuffix is '.agy.json'", async () => {
  const driver = await loadDriver();
  assert.equal(driver.stateSuffix, ".agy.json");
});

test("buildArgs uses agy print mode with the workspace added as context", async () => {
  const driver = await loadDriver();
  const args = driver.buildArgs({ prompt: "review this", cwd: "/some/dir" });
  assert.deepEqual(args, ["-p", "review this", "--add-dir", "/some/dir"]);
});

test("buildArgs does not attempt conversation resume", async () => {
  const driver = await loadDriver();
  const args = driver.buildArgs({
    prompt: "follow up",
    cwd: "/work",
    priorSession: { session_id: "conversation-id" }
  });
  assert.deepEqual(args, ["-p", "follow up", "--add-dir", "/work"]);
});

test("extractResult returns trimmed stdout text with no session id", async () => {
  const driver = await loadDriver();
  const result = driver.extractResult("\nBLOCKERS:\n- none\n\n", "");
  assert.deepEqual(result, {
    sessionId: null,
    text: "BLOCKERS:\n- none"
  });
});

test("extractResult throws when stdout is empty", async () => {
  const driver = await loadDriver();
  assert.throws(
    () => driver.extractResult(" \n", ""),
    /Agy response did not include a result payload/
  );
});
