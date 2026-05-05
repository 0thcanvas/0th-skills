import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const driverPath = path.join(__dirname, "..", "scripts", "drivers", "claude.mjs");
const claudeDriver = (await import(driverPath)).default;

test("buildArgs: separates prompt from variadic --add-dir option", () => {
  const prompt = "Review the diff";
  const args = claudeDriver.buildArgs({
    prompt,
    cwd: "/tmp/project",
    model: null,
    priorSession: null
  });

  assert.deepEqual(args.slice(-2), ["--", prompt]);
});

