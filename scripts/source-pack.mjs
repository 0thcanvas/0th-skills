#!/usr/bin/env node

import crypto from "node:crypto";
import { assertNoSecretLikeText } from "./lib/redaction.mjs";

export const SOURCE_REDACTION_STATUSES = ["no_secrets_observed", "redacted", "secret_reference_only"];

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function normalizeList(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function assertAllowed(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
}

export function hashSourceChunk({
  text,
  source_pointer,
  redaction_status = "no_secrets_observed"
}) {
  return crypto.createHash("sha256")
    .update(stableStringify({
      redaction_status,
      source_pointer: stableValue(source_pointer),
      text: String(text ?? "")
    }))
    .digest("hex");
}

function normalizeChunk(input, {
  now
}) {
  if (!input || typeof input !== "object") throw new Error("source chunk is required");
  const text = String(input.text ?? "");
  const summary = String(input.summary ?? "").trim();
  const sourcePointer = input.source_pointer ?? input.sourcePointer;
  const redactionStatus = String(input.redaction_status ?? input.redactionStatus ?? "no_secrets_observed").trim();
  const observedAt = input.observed_at ?? input.observedAt ?? now.toISOString();

  if (!text.trim()) throw new Error("source chunk text is required");
  if (!sourcePointer) throw new Error("source_pointer is required");
  assertAllowed("redaction_status", redactionStatus, SOURCE_REDACTION_STATUSES);

  assertNoSecretLikeText([
    input.id,
    text,
    summary,
    stableStringify(sourcePointer)
  ], "source pack contains secret-like content; redact it before writing");

  const contentHash = hashSourceChunk({
    text,
    source_pointer: sourcePointer,
    redaction_status: redactionStatus
  });

  return {
    id: input.id ? String(input.id).trim() : `chunk-${contentHash.slice(0, 12)}`,
    text,
    source_pointer: stableValue(sourcePointer),
    summary,
    observed_at: observedAt,
    redaction_status: redactionStatus,
    content_hash: contentHash
  };
}

export function normalizeSourcePack(input, {
  now = new Date()
} = {}) {
  if (!input || typeof input !== "object") throw new Error("source pack is required");
  const sourceId = String(input.source_id ?? input.sourceId ?? "").trim();
  const topic = input.topic ? String(input.topic).trim() : "";
  const staleAfterDays = input.stale_after_days ?? input.staleAfterDays ?? null;
  const relatedIds = normalizeList(input.related_ids ?? input.related_id ?? input.relatedId);
  const chunks = Array.isArray(input.chunks) ? input.chunks : [];

  if (!sourceId) throw new Error("source_id is required");
  if (chunks.length === 0) throw new Error("at least one source chunk is required");

  assertNoSecretLikeText([
    input.id,
    sourceId,
    topic,
    ...relatedIds
  ], "source pack contains secret-like content; redact it before writing");

  const pack = {
    id: input.id ? String(input.id).trim() : sourceId,
    source_id: sourceId,
    created_at: input.created_at ?? now.toISOString(),
    chunks: chunks.map((chunk) => normalizeChunk(chunk, { now }))
  };

  if (topic) pack.topic = topic;
  if (staleAfterDays != null) pack.stale_after_days = Number(staleAfterDays);
  if (relatedIds.length > 0) pack.related_ids = relatedIds;

  return pack;
}
