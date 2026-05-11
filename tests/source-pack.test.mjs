import test from "node:test";
import assert from "node:assert/strict";
import {
  hashSourceChunk,
  normalizeSourcePack
} from "../scripts/source-pack.mjs";

test("source packs preserve verbatim chunks with reproducible hashes", () => {
  const pack = normalizeSourcePack({
    source_id: "memory-systems-world-model",
    topic: "agent-memory",
    stale_after_days: 90,
    chunks: [
      {
        id: "mempalace-drawer",
        text: "A drawer preserves the original source text while indexes point back to it.",
        source_pointer: {
          kind: "url",
          url: "https://mempalaceofficial.com/concepts/the-palace.html"
        },
        summary: "MemPalace stores original text and indexes it for scoped retrieval.",
        redaction_status: "no_secrets_observed",
        observed_at: "2026-05-11T13:20:00.000Z"
      }
    ]
  }, { now: new Date("2026-05-11T13:20:00.000Z") });

  const [chunk] = pack.chunks;
  assert.equal(pack.source_id, "memory-systems-world-model");
  assert.equal(pack.topic, "agent-memory");
  assert.equal(pack.stale_after_days, 90);
  assert.equal(chunk.text, "A drawer preserves the original source text while indexes point back to it.");
  assert.equal(chunk.content_hash, hashSourceChunk({
    text: chunk.text,
    source_pointer: chunk.source_pointer,
    redaction_status: chunk.redaction_status
  }));
});

test("source-pack hashes are insensitive to source pointer key order", () => {
  const left = hashSourceChunk({
    text: "same stored bytes",
    source_pointer: { url: "https://example.com/a", kind: "url" },
    redaction_status: "no_secrets_observed"
  });
  const right = hashSourceChunk({
    text: "same stored bytes",
    source_pointer: { kind: "url", url: "https://example.com/a" },
    redaction_status: "no_secrets_observed"
  });

  assert.equal(left, right);
});

test("source packs reject secret-like chunk text before persistence", () => {
  assert.throws(
    () => normalizeSourcePack({
      source_id: "unsafe",
      chunks: [
        {
          text: "api_key=abc1234567890secret",
          source_pointer: { kind: "note", id: "unsafe" },
          summary: "unsafe"
        }
      ]
    }),
    /secret-like/
  );
});
