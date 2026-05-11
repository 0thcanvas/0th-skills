import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expandSourcePack,
  hashSourceChunk,
  ingestSourcePack,
  normalizeSourcePack
} from "../scripts/source-pack.mjs";
import { expandMemory } from "../scripts/memory-recall.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-source-pack-"));
}

function withTempStateRoot(callback) {
  const previous = process.env.OTH_SKILLS_STATE_DIR;
  const stateRoot = path.join(tempDir(), "state");
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  try {
    return callback(stateRoot);
  } finally {
    if (previous === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previous;
    }
  }
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

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

test("source-pack ingestion stores global chunks and deduplicates by content hash", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();
    const first = ingestSourcePack({
      cwd: repo,
      now: new Date("2026-05-11T14:00:00.000Z"),
      input: {
        id: "memory-systems-world-model",
        source_id: "memory-systems-world-model",
        topic: "agent-memory",
        stale_after_days: 90,
        chunks: [
          {
            id: "chunk-a",
            text: "GBrain routes durable knowledge through named sources.",
            source_pointer: { kind: "url", url: "https://example.com/gbrain" },
            summary: "Named sources are the global routing namespace."
          }
        ]
      }
    });
    const second = ingestSourcePack({
      cwd: repo,
      now: new Date("2026-05-11T14:05:00.000Z"),
      input: {
        id: "memory-systems-world-model",
        source_id: "memory-systems-world-model",
        topic: "agent-memory",
        chunks: [
          {
            id: "duplicate-chunk-a",
            text: "GBrain routes durable knowledge through named sources.",
            source_pointer: { url: "https://example.com/gbrain", kind: "url" },
            summary: "Duplicate text and pointer should not create a second chunk."
          },
          {
            id: "chunk-b",
            text: "MemPalace keeps verbatim drawers behind compact indexes.",
            source_pointer: { kind: "url", url: "https://example.com/mempalace" },
            summary: "Indexes point to stored source chunks."
          }
        ]
      }
    });

    const index = readJsonl(first.source_index_file);
    const chunks = readJsonl(first.source_pack_file);

    assert.equal(first.source_index_file, path.join(stateRoot, "global", "sources", "index.jsonl"));
    assert.equal(first.added_chunks, 1);
    assert.equal(second.added_chunks, 1);
    assert.equal(second.duplicate_chunks, 1);
    assert.equal(index.length, 1);
    assert.equal(index[0].id, "memory-systems-world-model");
    assert.equal(index[0].chunk_count, 2);
    assert.equal(index[0].topic, "agent-memory");
    assert.equal(chunks.length, 2);
    assert.deepEqual(chunks.map((chunk) => chunk.id), ["chunk-a", "chunk-b"]);
  });
});

test("source packs expand by id without returning unrelated global source text", () => {
  withTempStateRoot(() => {
    const repo = tempDir();
    ingestSourcePack({
      cwd: repo,
      input: {
        id: "target-source",
        source_id: "target-source",
        chunks: [
          {
            text: "Target source text should be returned.",
            source_pointer: { kind: "note", id: "target" },
            summary: "target"
          }
        ]
      }
    });
    ingestSourcePack({
      cwd: repo,
      input: {
        id: "unrelated-source",
        source_id: "unrelated-source",
        chunks: [
          {
            text: "Unrelated source text must stay out of the expansion.",
            source_pointer: { kind: "note", id: "unrelated" },
            summary: "unrelated"
          }
        ]
      }
    });

    const expanded = expandSourcePack({ cwd: repo, id: "target-source" });
    const memoryExpanded = expandMemory({ cwd: repo, id: "target-source" });

    assert.equal(expanded.found, true);
    assert.equal(expanded.kind, "source_pack");
    assert.equal(expanded.record.chunks.length, 1);
    assert.equal(expanded.record.chunks[0].text, "Target source text should be returned.");
    assert.equal(JSON.stringify(expanded), JSON.stringify(memoryExpanded));
    assert.equal(JSON.stringify(expanded).includes("Unrelated source text"), false);
  });
});

test("source-pack ingestion rejects secret-like chunks before any source file is written", () => {
  withTempStateRoot((stateRoot) => {
    const repo = tempDir();

    assert.throws(
      () => ingestSourcePack({
        cwd: repo,
        input: {
          id: "unsafe",
          source_id: "unsafe",
          chunks: [
            {
              text: "API_KEY=abc1234567890secret",
              source_pointer: { kind: "note", id: "unsafe" },
              summary: "unsafe"
            }
          ]
        }
      }),
      /secret-like/
    );
    assert.equal(fs.existsSync(path.join(stateRoot, "global", "sources")), false);
  });
});
