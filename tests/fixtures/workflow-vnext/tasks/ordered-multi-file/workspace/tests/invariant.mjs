import assert from "node:assert/strict";
import { parseRecord } from "../src/config.mjs";
import { isRecordActive } from "../src/policy.mjs";

assert.throws(
  () => isRecordActive(parseRecord({ id: "x" }), "not-a-date"),
  TypeError
);
assert.equal(
  isRecordActive(
    parseRecord({ id: "x", expiresAt: "2026-07-26T10:00:00+00:00" }),
    new Date("2026-07-26T09:00:00.000Z")
  ),
  true
);
