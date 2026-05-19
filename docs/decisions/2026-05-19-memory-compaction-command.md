# Memory Compaction Command

**Date:** 2026-05-19
**Status:** active
**Durable:** yes — deleting or rewriting memory history would be hard to audit later; the lifecycle choice should be explicit.

## Decision

Add `memory compact` with `memory consolidate` as an alias. Compaction writes one source-backed summary claim, marks the selected originals `superseded`, links them through `supersedes`/`superseded_by`, and regenerates the brief so superseded claims leave startup context.

## Constraints

- Never delete old claims during compaction; old claims remain in JSONL for audit and expansion.
- Require explicit claim ids and a normal Memory v2 summary claim with evidence and confidence.
- Refuse ambiguous compaction with fewer than two ids or missing targets.
- Keep `--dry-run` available so agents can preview the summary id and target set before mutation.

## Not Doing

- No automatic semantic clustering yet.
- No vector summarization or opaque generated summaries.
- No destructive purge command.

## Depends On

- [0th Memory v2](./2026-05-10-0th-memory-v2.md)
- [Memory v2 Boundary Hardening](./2026-05-19-memory-v2-boundary-hardening.md)
