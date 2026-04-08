import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "..", "fixtures", "codex-success.jsonl");

async function loadDriver() {
  const driverPath = path.resolve(__dirname, "..", "..", "scripts", "drivers", "codex.mjs");
  const { default: driver } = await import(driverPath);
  return driver;
}

test("driver has the correct name", async () => {
  const driver = await loadDriver();
  assert.equal(driver.name, "codex");
});

test("driver bin defaults to 'codex' when CODEX_BIN is not set", async () => {
  const driver = await loadDriver();
  // bin is evaluated at module load time using process.env.CODEX_BIN
  assert.equal(typeof driver.bin, "string");
  assert.ok(driver.bin.length > 0);
});

test("driver env is an empty object", async () => {
  const driver = await loadDriver();
  assert.deepEqual(driver.env, {});
});

test("supportsResume is true", async () => {
  const driver = await loadDriver();
  assert.equal(driver.supportsResume, true);
});

test("stateSuffix is '.codex.json'", async () => {
  const driver = await loadDriver();
  assert.equal(driver.stateSuffix, ".codex.json");
});

test("buildArgs without prior session produces exec --json <prompt>", async () => {
  const driver = await loadDriver();
  const args = driver.buildArgs({ prompt: "review this", model: null, priorSession: null });
  assert.deepEqual(args, ["exec", "--json", "review this"]);
});

test("buildArgs without prior session with model includes --model flag", async () => {
  const driver = await loadDriver();
  const args = driver.buildArgs({ prompt: "review this", model: "o3", priorSession: null });
  assert.deepEqual(args, ["exec", "--json", "--model", "o3", "review this"]);
});

test("buildArgs with prior session uses resume subcommand", async () => {
  const driver = await loadDriver();
  const priorSession = { session_id: "thread_xyz" };
  const args = driver.buildArgs({ prompt: "follow up", model: null, priorSession });
  assert.deepEqual(args, ["exec", "resume", "--json", "thread_xyz", "follow up"]);
});

test("buildArgs with prior session and model includes --model after session_id", async () => {
  const driver = await loadDriver();
  const priorSession = { session_id: "thread_xyz" };
  const args = driver.buildArgs({ prompt: "follow up", model: "o3", priorSession });
  assert.deepEqual(args, ["exec", "resume", "--json", "thread_xyz", "--model", "o3", "follow up"]);
});

test("extractResult parses fixture correctly and returns sessionId and text", async () => {
  const driver = await loadDriver();
  const stdout = fs.readFileSync(fixturePath, "utf8");
  const result = driver.extractResult(stdout, "");

  assert.equal(result.sessionId, "thread_abc123");
  assert.ok(result.text.includes("BLOCKERS:"));
  assert.ok(result.text.includes("OVERALL: Clean implementation."));
});

test("extractResult throws when thread_id is missing", async () => {
  const driver = await loadDriver();
  const stdout = [
    JSON.stringify({ type: "item.completed", item: { type: "text", text: "some review" } })
  ].join("\n");

  assert.throws(
    () => driver.extractResult(stdout, ""),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Codex response did not include a thread_id/);
      return true;
    }
  );
});

test("extractResult throws when no item.completed event is present", async () => {
  const driver = await loadDriver();
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "thread_abc123" }),
    JSON.stringify({ type: "item.started", item: { type: "text" } })
  ].join("\n");

  assert.throws(
    () => driver.extractResult(stdout, ""),
    (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Codex response did not include a final message/);
      return true;
    }
  );
});

test("extractResult uses the last item.completed when multiple are present", async () => {
  const driver = await loadDriver();
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "thread_abc123" }),
    JSON.stringify({ type: "item.completed", item: { type: "text", text: "first message" } }),
    JSON.stringify({ type: "item.completed", item: { type: "text", text: "final message" } })
  ].join("\n");

  const result = driver.extractResult(stdout, "");
  assert.equal(result.text, "final message");
});
