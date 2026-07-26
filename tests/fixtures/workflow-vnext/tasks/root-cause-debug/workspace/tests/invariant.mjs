import assert from "node:assert/strict";
import { runWithRetry } from "../src/retry.mjs";

for (const maxAttempts of [0, -1, 1.5, "3"]) {
  await assert.rejects(
    runWithRetry(async () => "ok", { maxAttempts }),
    TypeError
  );
}
