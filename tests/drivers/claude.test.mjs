import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const driverPath = path.resolve(__dirname, "..", "..", "scripts", "drivers", "claude.mjs");
const fixturePath = path.resolve(__dirname, "..", "fixtures", "claude-success.json");

const { default: driver } = await import(driverPath);
const fixtureJson = fs.readFileSync(fixturePath, "utf8");

test("driver has the correct name", () => {
  assert.equal(driver.name, "claude");
});

test("driver bin defaults to 'claude' when CLAUDE_BIN is not set", () => {
  // bin is evaluated at import time using process.env.CLAUDE_BIN
  assert.equal(typeof driver.bin, "string");
  assert.ok(driver.bin.length > 0);
});

test("driver env is an empty object", () => {
  assert.deepEqual(driver.env, {});
});

test("driver supportsResume is true", () => {
  assert.equal(driver.supportsResume, true);
});

test("driver stateSuffix is '.claude.json'", () => {
  assert.equal(driver.stateSuffix, ".claude.json");
});

test("buildArgs returns base args with prompt and cwd only", () => {
  const args = driver.buildArgs({ prompt: "review this", cwd: "/some/dir" });
  assert.deepEqual(args, ["-p", "--output-format", "json", "--add-dir", "/some/dir", "review this"]);
});

test("buildArgs appends --model when model is provided", () => {
  const args = driver.buildArgs({ prompt: "review this", cwd: "/some/dir", model: "opus" });
  assert.ok(args.includes("--model"), "should include --model flag");
  const modelIndex = args.indexOf("--model");
  assert.equal(args[modelIndex + 1], "opus");
});

test("buildArgs appends --resume when priorSession has session_id", () => {
  const args = driver.buildArgs({
    prompt: "follow up",
    cwd: "/some/dir",
    priorSession: { session_id: "sess_abc123" }
  });
  assert.ok(args.includes("--resume"), "should include --resume flag");
  const resumeIndex = args.indexOf("--resume");
  assert.equal(args[resumeIndex + 1], "sess_abc123");
});

test("buildArgs with model and resume appends both flags before prompt", () => {
  const args = driver.buildArgs({
    prompt: "the prompt",
    cwd: "/work",
    model: "haiku",
    priorSession: { session_id: "sess_999" }
  });
  assert.equal(args[args.length - 1], "the prompt");
  assert.ok(args.includes("--model"));
  assert.ok(args.includes("--resume"));
});

test("buildArgs does not append --resume when priorSession has no session_id", () => {
  const args = driver.buildArgs({ prompt: "review", cwd: "/work", priorSession: {} });
  assert.equal(args.includes("--resume"), false);
});

test("extractResult parses the success fixture and returns sessionId and text", () => {
  const result = driver.extractResult(fixtureJson, "");
  assert.equal(result.sessionId, "sess_xyz789");
  assert.ok(result.text.includes("BLOCKERS"));
  assert.ok(result.text.includes("OVERALL: Solid work."));
});

test("extractResult prefers result event text over assistant event text", () => {
  const payload = JSON.stringify([
    {
      type: "assistant",
      session_id: "sess_xyz789",
      message: { content: [{ type: "text", text: "assistant text" }] }
    },
    {
      type: "result",
      session_id: "sess_xyz789",
      result: "result text"
    }
  ]);
  const result = driver.extractResult(payload, "");
  assert.equal(result.text, "result text");
});

test("extractResult falls back to assistant event text when no result event", () => {
  const payload = JSON.stringify([
    {
      type: "assistant",
      session_id: "sess_fallback",
      message: { content: [{ type: "text", text: "assistant fallback text" }] }
    }
  ]);
  const result = driver.extractResult(payload, "");
  assert.equal(result.sessionId, "sess_fallback");
  assert.equal(result.text, "assistant fallback text");
});

test("extractResult throws on invalid JSON", () => {
  assert.throws(
    () => driver.extractResult("not valid JSON", ""),
    /not valid JSON/
  );
});

test("extractResult throws when payload is not an array", () => {
  assert.throws(
    () => driver.extractResult(JSON.stringify({ type: "result" }), ""),
    /expected a JSON array/
  );
});

test("extractResult throws when no session_id is present", () => {
  const payload = JSON.stringify([
    { type: "result", result: "some text" }
  ]);
  assert.throws(
    () => driver.extractResult(payload, ""),
    /did not include a session_id/
  );
});

test("extractResult throws when no text result is present", () => {
  const payload = JSON.stringify([
    { type: "result", session_id: "sess_xyz", result: "" }
  ]);
  assert.throws(
    () => driver.extractResult(payload, ""),
    /did not include a result payload/
  );
});
