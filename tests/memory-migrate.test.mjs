import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildObsidianMigrationManifest,
  generateObsidianExport
} from "../scripts/memory-migrate.mjs";
import { runMemoryCommand } from "../scripts/memory.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "0th-memory-migrate-"));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

test("Obsidian migration dry-run manifest classifies markdown without writing runtime state", () => {
  const kbRoot = tempDir();
  const stateRoot = path.join(tempDir(), "state");
  const previousState = process.env.OTH_SKILLS_STATE_DIR;
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  try {
    const durableContent = [
      "---",
      "scope: global",
      "confidence: high",
      "type: external_research",
      "topic: agent-memory",
      "subject_key: memory-v2-world-model",
      "---",
      "Memory v2 should treat source packs as evidence and promote only explicit reusable lessons."
    ].join("\n");
    writeFile(kbRoot, "tech/raw/memory-v2-world-model.md", durableContent);
    writeFile(kbRoot, "projects/app/todo.md", [
      "---",
      "type: open_loop",
      "priority: P1",
      "---",
      "TODO: wire the migration command into startup docs."
    ].join("\n"));
    writeFile(kbRoot, "archive/old.md", [
      "---",
      "lifecycle: archived",
      "---",
      "This note was already archived in the old KB."
    ].join("\n"));

    const manifest = buildObsidianMigrationManifest({
      kbRoot,
      now: new Date("2026-05-11T19:00:00.000Z")
    });

    assert.equal(manifest.schema_version, 1);
    assert.equal(manifest.mode, "dry_run");
    assert.deepEqual(manifest.allowed_actions, [
      "source_pack",
      "durable_claim",
      "open_loop",
      "needs_review",
      "archive",
      "skip"
    ]);
    assert.equal(manifest.candidates.length, 3);

    const durable = manifest.candidates.find((candidate) => candidate.relative_path === "tech/raw/memory-v2-world-model.md");
    assert.equal(durable.action, "durable_claim");
    assert.equal(durable.content_hash, hashText(durableContent));
    assert.match(durable.reason, /high-confidence cross-project/i);
    assert.equal(durable.proposed_record.scope, "global");
    assert.equal(durable.proposed_record.source_id, "kb-migration");
    assert.equal(durable.proposed_record.subject_key, "memory-v2-world-model");

    const loop = manifest.candidates.find((candidate) => candidate.relative_path === "projects/app/todo.md");
    assert.equal(loop.action, "open_loop");
    assert.match(loop.reason, /unfinished work/i);

    const archived = manifest.candidates.find((candidate) => candidate.relative_path === "archive/old.md");
    assert.equal(archived.action, "archive");
    assert.match(archived.reason, /already archived/i);

    assert.equal(fs.existsSync(path.join(stateRoot, "global")), false);
  } finally {
    if (previousState === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previousState;
    }
  }
});

test("Obsidian migration routes stale material to source packs and speculative material to skip", () => {
  const kbRoot = tempDir();
  writeFile(kbRoot, "research/raw/stale-memory-note.md", [
    "---",
    "scope: global",
    "lifecycle: stale",
    "topic: agent-memory",
    "---",
    "This old note may still be useful as source evidence but should not become a durable claim."
  ].join("\n"));
  writeFile(kbRoot, "research/raw/speculative.md", [
    "---",
    "scope: global",
    "confidence: low",
    "speculative: true",
    "---",
    "Maybe a future graph traversal layer could replace scoped recall."
  ].join("\n"));

  const manifest = buildObsidianMigrationManifest({
    kbRoot,
    now: new Date("2026-05-11T19:05:00.000Z")
  });

  const stale = manifest.candidates.find((candidate) => candidate.relative_path === "research/raw/stale-memory-note.md");
  assert.equal(stale.action, "source_pack");
  assert.match(stale.reason, /stale/i);
  assert.equal(stale.proposed_record.source_id, "kb-migration");
  assert.equal(stale.proposed_record.redaction_status, "no_secrets_observed");

  const speculative = manifest.candidates.find((candidate) => candidate.relative_path === "research/raw/speculative.md");
  assert.equal(speculative.action, "skip");
  assert.match(speculative.skip_reason, /speculative/i);
});

test("Obsidian migration manifest includes replay and rollback instructions for every candidate", () => {
  const kbRoot = tempDir();
  writeFile(kbRoot, "tech/raw/memory-v2.md", [
    "---",
    "scope: global",
    "confidence: high",
    "subject_key: memory-v2",
    "---",
    "Runtime memory is the canonical recall layer across projects."
  ].join("\n"));

  const manifest = buildObsidianMigrationManifest({
    kbRoot,
    now: new Date("2026-05-11T19:10:00.000Z")
  });

  assert.match(manifest.replay.instructions, /dry-run manifest/i);
  assert.match(manifest.rollback.instructions, /migration_batch_id/i);
  for (const candidate of manifest.candidates) {
    assert.ok(candidate.migration_id);
    assert.equal(typeof candidate.replay.command, "string");
    assert.match(candidate.rollback.instructions, /migration_id/i);
  }
});

test("unified memory entrypoint emits an Obsidian migration manifest", () => {
  const kbRoot = tempDir();
  writeFile(kbRoot, "tech/raw/global.md", [
    "---",
    "scope: global",
    "confidence: high",
    "---",
    "Global memory briefs should be read before project memory briefs."
  ].join("\n"));

  const output = runMemoryCommand(["migrate", "obsidian", "--kb-root", kbRoot, "--now", "2026-05-11T19:15:00.000Z"], {
    cwd: tempDir()
  });
  const manifest = JSON.parse(output);

  assert.equal(manifest.mode, "dry_run");
  assert.equal(manifest.candidates[0].action, "durable_claim");
  assert.equal(manifest.candidates[0].relative_path, "tech/raw/global.md");
});

test("Obsidian export is generated from Memory v2 runtime state", () => {
  const root = tempDir();
  const memoryFile = path.join(root, "global", "memory", "claims.jsonl");
  const sourceIndexFile = path.join(root, "global", "sources", "index.jsonl");
  writeJsonl(memoryFile, [
    {
      id: "2026-05-11-external_research-memory-v2",
      type: "external_research",
      claim: "Memory v2 source packs preserve source fidelity for cross-project research.",
      scope: "global",
      lifecycle_state: "active",
      confidence: "high",
      source_id: "kb-migration",
      topic: "agent-memory",
      subject_key: "source-fidelity",
      created_at: "2026-05-11T19:20:00.000Z",
      last_confirmed_at: "2026-05-11T19:20:00.000Z"
    }
  ]);
  writeJsonl(sourceIndexFile, [
    {
      id: "kb-migration-tech-raw-memory-v2",
      source_id: "kb-migration",
      topic: "agent-memory",
      updated_at: "2026-05-11T19:20:00.000Z",
      chunk_count: 1,
      content_hashes: ["abc123"]
    }
  ]);

  const exported = generateObsidianExport({
    memoryFile,
    sourceIndexFile,
    now: new Date("2026-05-11T19:25:00.000Z")
  });

  assert.equal(exported.mode, "generated_export");
  assert.equal(exported.files.length, 1);
  assert.equal(exported.files[0].relative_path, "memory-v2-index.md");
  assert.match(exported.files[0].content, /Generated from Memory v2 runtime state/);
  assert.match(exported.files[0].content, /source fidelity/);
  assert.match(exported.files[0].content, /kb-migration-tech-raw-memory-v2/);
  assert.doesNotMatch(exported.files[0].content, /Obsidian is canonical/);
});
