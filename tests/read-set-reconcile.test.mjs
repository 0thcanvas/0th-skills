import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reconcileReadSet } from "../scripts/read-set-reconcile.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-read-set-"));
}

function writeJsonl(filePath, entries) {
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("read-set reconciliation checks only memory tied to inspected files and symbols", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  writeJsonl(memoryFile, [
    {
      id: "cart-placement",
      claim: "Cart banner anchors before checkout.",
      lifecycle_state: "active",
      source_paths: ["src/cart/banner.ts"],
      source_symbols: ["renderCartBanner"]
    },
    {
      id: "profile-flow",
      claim: "Profile flow uses local state.",
      lifecycle_state: "active",
      source_paths: ["src/profile/page.ts"]
    }
  ]);

  const result = reconcileReadSet({
    memoryFile,
    readSet: {
      files: ["src/cart/banner.ts"],
      symbols: ["renderCartBanner"],
      tests: ["tests/cart-banner.test.ts"],
      verified_claims: [
        {
          id: "cart-placement",
          outcome: "contradicted",
          evidence: "Read src/cart/banner.ts and saw the anchor moved after checkout.",
          evidence_path: "tests/cart-banner.test.ts"
        }
      ]
    }
  });

  const [cartClaim, profileClaim] = readJsonl(memoryFile);
  assert.deepEqual(result.read_set.files, ["src/cart/banner.ts"]);
  assert.deepEqual(result.checked_claim_ids, ["cart-placement"]);
  assert.deepEqual(result.updated_claim_ids, ["cart-placement"]);
  assert.equal(cartClaim.lifecycle_state, "needs_review");
  assert.equal(cartClaim.review.reason, "verified_contradiction");
  assert.match(cartClaim.review.evidence, /anchor moved/);
  assert.equal(cartClaim.review.evidence_path, "tests/cart-banner.test.ts");
  assert.equal(profileClaim.lifecycle_state, "active");
  assert.equal(profileClaim.review, undefined);
});

test("read-set reconciliation can confirm an in-scope claim without touching unrelated memory", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  writeJsonl(memoryFile, [
    {
      id: "cart-placement",
      claim: "Cart banner anchors before checkout.",
      lifecycle_state: "needs_review",
      source_paths: ["src/cart/banner.ts"]
    },
    {
      id: "profile-flow",
      claim: "Profile flow uses local state.",
      lifecycle_state: "active",
      source_paths: ["src/profile/page.ts"]
    }
  ]);

  const result = reconcileReadSet({
    memoryFile,
    confirmedAt: "2026-05-10T00:00:00.000Z",
    readSet: {
      files: ["src/cart/banner.ts"],
      symbols: [],
      tests: ["tests/cart-banner.test.ts"],
      verified_claims: [{ id: "cart-placement", outcome: "confirmed" }]
    }
  });

  const [cartClaim, profileClaim] = readJsonl(memoryFile);
  assert.deepEqual(result.checked_claim_ids, ["cart-placement"]);
  assert.equal(cartClaim.lifecycle_state, "active");
  assert.equal(cartClaim.last_confirmed_at, "2026-05-10T00:00:00.000Z");
  assert.equal(cartClaim.review, undefined);
  assert.equal(profileClaim.last_confirmed_at, undefined);
});
