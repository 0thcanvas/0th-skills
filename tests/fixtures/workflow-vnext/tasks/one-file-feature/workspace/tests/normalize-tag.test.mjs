import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTag } from "../src/normalize-tag.mjs";

test("normalizes mixed separators", () => {
  assert.equal(normalizeTag("  Hello__WORLD -- now  "), "hello-world-now");
});

test("preserves non-separator Unicode", () => {
  assert.equal(normalizeTag("  Été_日本  "), "été-日本");
});

test("rejects non-string input", () => {
  assert.throws(() => normalizeTag(null), TypeError);
});
