import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { runMemorySync } from "../scripts/memory-sync.mjs";

function sh(cwd, args) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function tempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-sync-"));
  sh(dir, ["git", "init", "-b", "main"]);
  sh(dir, ["git", "config", "user.email", "test@example.com"]);
  sh(dir, ["git", "config", "user.name", "Test User"]);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "cart.js"), "export const cart = 1;\n");
  fs.writeFileSync(path.join(dir, "src", "profile.js"), "export const profile = 1;\n");
  sh(dir, ["git", "add", "."]);
  sh(dir, ["git", "commit", "-m", "initial"]);
  return dir;
}

function appendJsonl(filePath, entries) {
  fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

test("memory sync marks claims tied to changed source paths as needs_review", () => {
  const repo = tempRepo();
  const memoryFile = path.join(repo, "claims.jsonl");
  appendJsonl(memoryFile, [
    {
      id: "cart-placement",
      claim: "Cart banner anchors before checkout.",
      lifecycle_state: "active",
      source_paths: ["src/cart.js"]
    },
    {
      id: "profile-flow",
      claim: "Profile page uses local state.",
      lifecycle_state: "active",
      source_paths: ["src/profile.js"]
    }
  ]);

  const from = sh(repo, ["git", "rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(repo, "src", "cart.js"), "export const cart = 2;\n");
  sh(repo, ["git", "add", "src/cart.js"]);
  sh(repo, ["git", "commit", "-m", "update cart"]);
  const to = sh(repo, ["git", "rev-parse", "HEAD"]);

  const result = runMemorySync({ cwd: repo, from, to, memoryFile });
  const [cartClaim, profileClaim] = readJsonl(memoryFile);

  assert.deepEqual(result.changed_sources, ["src/cart.js"]);
  assert.deepEqual(result.affected_claim_ids, ["cart-placement"]);
  assert.equal(result.from_revision, from);
  assert.equal(result.to_revision, to);
  assert.equal(cartClaim.lifecycle_state, "needs_review");
  assert.equal(cartClaim.review.reason, "source_changed");
  assert.equal(cartClaim.review.from_revision, from);
  assert.equal(cartClaim.review.to_revision, to);
  assert.deepEqual(cartClaim.review.changed_sources, ["src/cart.js"]);
  assert.equal(profileClaim.lifecycle_state, "active");
  assert.equal(profileClaim.review, undefined);
});

test("memory sync is a no-op when the memory file does not exist", () => {
  const repo = tempRepo();
  const from = sh(repo, ["git", "rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(repo, "src", "cart.js"), "export const cart = 2;\n");
  sh(repo, ["git", "add", "src/cart.js"]);
  sh(repo, ["git", "commit", "-m", "update cart"]);
  const to = sh(repo, ["git", "rev-parse", "HEAD"]);
  const missingMemoryFile = path.join(repo, "missing", "claims.jsonl");

  const result = runMemorySync({ cwd: repo, from, to, memoryFile: missingMemoryFile });

  assert.deepEqual(result.changed_sources, ["src/cart.js"]);
  assert.deepEqual(result.affected_claim_ids, []);
  assert.equal(result.memory_file_exists, false);
});

test("memory sync regenerates the brief after flipping lifecycle_state to needs_review", () => {
  // PR #19 review fix: mutators that flip lifecycle_state must refresh the
  // brief so it doesn't keep saying "active" for claims memory-sync just
  // demoted to "needs_review". Previously brief.md stayed stale until the
  // next memory-write.
  const repo = tempRepo();
  const from = sh(repo, ["git", "rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(repo, "src", "cart.js"), "export const cart = 2;\n");
  sh(repo, ["git", "add", "src/cart.js"]);
  sh(repo, ["git", "commit", "-m", "update cart"]);
  const to = sh(repo, ["git", "rev-parse", "HEAD"]);

  const memoryFile = path.join(repo, ".0th", "memory", "claims.jsonl");
  fs.mkdirSync(path.dirname(memoryFile), { recursive: true });
  fs.writeFileSync(memoryFile, JSON.stringify({
    id: "cart-claim",
    type: "decision",
    claim: "Cart logic is single-line export.",
    scope: "repo",
    lifecycle_state: "active",
    confidence: "high",
    source_paths: ["src/cart.js"],
    evidence_path: "docs/cart.md",
    created_at: "2026-05-09T00:00:00.000Z",
    last_confirmed_at: "2026-05-09T00:00:00.000Z"
  }) + "\n");

  const briefFile = path.join(repo, ".0th", "memory", "brief.md");
  // Pre-populate a stale brief so we can detect whether sync refreshed it
  fs.writeFileSync(briefFile, "STALE BRIEF\n");

  const result = runMemorySync({ cwd: repo, from, to, memoryFile, briefFile });

  assert.deepEqual(result.affected_claim_ids, ["cart-claim"]);
  assert.equal(result.brief_updated, true, "brief must be regenerated when claims are mutated");
  assert.equal(result.brief_error, null);

  const brief = fs.readFileSync(briefFile, "utf8");
  assert.ok(!brief.includes("STALE BRIEF"), "old brief content must be replaced");
  assert.match(
    brief,
    /needs[ _-]?review|Repo State Warnings|cart-claim/i,
    `brief should reflect the needs_review claim, got: ${brief.slice(0, 200)}`
  );
});
