import assert from "node:assert/strict";
import { normalizeTag } from "../src/normalize-tag.mjs";

assert.equal(normalizeTag("---A___B---"), "a-b");
assert.equal(normalizeTag("東京"), "東京");
