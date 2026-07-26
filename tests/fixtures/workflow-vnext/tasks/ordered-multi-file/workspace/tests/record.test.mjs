import assert from "node:assert/strict";
import test from "node:test";
import { parseRecord } from "../src/config.mjs";
import { formatRecordStatus } from "../src/format.mjs";
import { isRecordActive } from "../src/policy.mjs";

test("normalizes records with expiration", () => {
  assert.deepEqual(parseRecord({ id: " abc ", expiresAt: "2026-07-26T10:00:00.000Z" }), {
    id: "abc",
    expiresAt: "2026-07-26T10:00:00.000Z"
  });
});

test("rejects invalid expiration", () => {
  assert.throws(() => parseRecord({ id: "abc", expiresAt: "tomorrow" }), TypeError);
});

test("evaluates and formats the boundary instant", () => {
  const record = parseRecord({ id: "abc", expiresAt: "2026-07-26T10:00:00.000Z" });
  assert.equal(isRecordActive(record, "2026-07-26T09:59:59.999Z"), true);
  assert.equal(isRecordActive(record, "2026-07-26T10:00:00.000Z"), false);
  assert.equal(formatRecordStatus(record, "2026-07-26T10:00:00.000Z"), "abc: expired");
});

test("records without expiration remain active", () => {
  assert.equal(isRecordActive(parseRecord({ id: "abc" }), "2030-01-01T00:00:00.000Z"), true);
});
