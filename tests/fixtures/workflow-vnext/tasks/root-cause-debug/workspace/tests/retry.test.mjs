import assert from "node:assert/strict";
import test from "node:test";
import { runWithRetry, shouldRetry } from "../src/retry.mjs";

function retryable(message) {
  return Object.assign(new Error(message), { retryable: true });
}

test("maxAttempts includes the initial call", async () => {
  let calls = 0;
  await assert.rejects(
    runWithRetry(async () => {
      calls += 1;
      throw retryable("no");
    }, { maxAttempts: 3 }),
    /no/
  );
  assert.equal(calls, 3);
});

test("returns after an eventual success", async () => {
  const result = await runWithRetry(async (attempt) => {
    if (attempt < 1) throw retryable("again");
    return "ok";
  }, { maxAttempts: 2 });
  assert.equal(result, "ok");
});

test("does not retry permanent errors", async () => {
  let calls = 0;
  await assert.rejects(
    runWithRetry(async () => {
      calls += 1;
      throw new Error("permanent");
    }, { maxAttempts: 3 }),
    /permanent/
  );
  assert.equal(calls, 1);
});

test("shouldRetry observes the zero-based boundary", () => {
  assert.equal(shouldRetry({ attempt: 0, maxAttempts: 3, error: retryable("x") }), true);
  assert.equal(shouldRetry({ attempt: 1, maxAttempts: 3, error: retryable("x") }), true);
  assert.equal(shouldRetry({ attempt: 2, maxAttempts: 3, error: retryable("x") }), false);
});
