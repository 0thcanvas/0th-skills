import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const driverPath = path.resolve(__dirname, "..", "..", "scripts", "drivers", "grok.mjs");

async function loadDriver() {
  return (await import(driverPath)).default;
}

test("Grok driver exposes the counterpart contract", async () => {
  const driver = await loadDriver();
  assert.equal(driver.name, "grok");
  assert.equal(driver.bin, process.env.GROK_BIN || "grok");
  assert.deepEqual(driver.env, {});
  assert.equal(driver.supportsResume, true);
  assert.equal(driver.stateSuffix, ".grok.json");
});

test("Grok driver honors GROK_BIN before import", () => {
  const result = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    `import driver from ${JSON.stringify(driverPath)}; console.log(driver.bin);`
  ], {
    encoding: "utf8",
    env: { ...process.env, GROK_BIN: "/custom/bin/grok" }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "/custom/bin/grok");
});

test("Grok driver builds verified headless JSON and resume arguments", async () => {
  const driver = await loadDriver();
  assert.deepEqual(driver.buildArgs({ prompt: "review", cwd: "/work" }), [
    "-p", "review", "--output-format", "json", "--cwd", "/work"
  ]);

  const resumed = driver.buildArgs({
    prompt: "follow up",
    cwd: "/work",
    model: "grok-code-fast-1",
    priorSession: { session_id: "019f4a81-a9e5-7a82-ae1e-e96ab6e73c61" }
  });
  assert.deepEqual(resumed, [
    "-p", "follow up", "--output-format", "json", "--cwd", "/work",
    "--model", "grok-code-fast-1", "--resume", "019f4a81-a9e5-7a82-ae1e-e96ab6e73c61"
  ]);
});

test("Grok driver parses the live CLI JSON envelope", async () => {
  const driver = await loadDriver();
  const result = driver.extractResult(JSON.stringify({
    text: "BLOCKERS:\n- none",
    stopReason: "EndTurn",
    sessionId: "019f4a81-a9e5-7a82-ae1e-e96ab6e73c61",
    requestId: "req_1"
  }), "");
  assert.deepEqual(result, {
    sessionId: "019f4a81-a9e5-7a82-ae1e-e96ab6e73c61",
    text: "BLOCKERS:\n- none"
  });
});

test("Grok driver rejects malformed, error, and empty payloads", async () => {
  const driver = await loadDriver();
  assert.throws(() => driver.extractResult("not json", ""), /not valid JSON/);
  assert.throws(
    () => driver.extractResult(JSON.stringify({ type: "error", message: "auth failed" }), ""),
    /auth failed/
  );
  assert.throws(
    () => driver.extractResult(JSON.stringify({ text: "  ", sessionId: "session" }), ""),
    /did not include a result payload/
  );
});
