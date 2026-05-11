# Global Memory v2 Plan

**Decision:** Direct refinement of [0th Memory v2](../decisions/2026-05-10-0th-memory-v2.md): Obsidian/Markdown is no longer the canonical agent recall path; global cross-project knowledge lives in a local agent-first runtime layer, with human pages generated on demand.
**Reference systems:** GBrain brain/source routing, MemPalace wing/room/tunnel retrieval, agentmemory hook-driven consolidation, and G-Memory hierarchical insights.
**Slices:** 9

## Architecture

- Brain/source model: one local user-owned global brain with named sources, plus project runtime stores keyed by repo identity; owner and scope are separate concepts.
- Agent-first records: claims, evidence, source packs, briefs, and lightweight related-id links carry `brain_id`, `source_id`, `topic`, `subject_key`, and provenance.
- Source fidelity: source packs preserve verbatim text chunks plus content hashes; summaries and indexes are pointers, not replacements.
- Recall routing: project memory is default for repo work; global memory is added by explicit routing rules, per-scope quotas, and conflict surfacing.
- Cutover rule: skills read Memory v2 runtime first; Obsidian/Markdown is only optional import/export or human-rendered evidence.

## Slices

### 1. Routing Contract and Global Paths
Define owner-vs-scope routing before adding any global writes.
- [x] Global memory, evidence, source-pack, link, and brief locations resolve under the same state root contract as project state.
- [x] Existing project state paths remain stable and backward compatible.
- [x] `scope: global` no longer strands claims in the current project store; writes either route to the global brain or fail with a clear error.
- [x] A diagnostic command reports project paths, global paths, routing precedence, and plugin/cache version in one machine-readable payload.

### 2. Record Schema and Source Fidelity
Upgrade records so global memory can be cited, compared, and replayed safely.
- [x] Claims and evidence can carry `brain_id`, `source_id`, `topic`, `subject_key`, `owner_project_key`, lifecycle, confidence, and provenance fields.
- [x] Legacy project claims without new routing fields recall with synthesized defaults instead of requiring a rewrite migration.
- [x] Source packs store verbatim chunks, content hashes, source pointers, chunk summaries, timestamps, redaction status, and stale-after policy.
- [x] Source-pack hashes are computed from stored redacted bytes plus stable source-pointer metadata so dedup and fidelity checks are reproducible.
- [x] Related records use explicit ids or source-backed links; graph-like traversal is deferred until flat scoped recall fails in evaluation.

### 3. Global Writes and Source-Pack Ingestion
Add the smallest useful global write path without changing project behavior.
- [x] Agents can write global claims only with an explicit source namespace and source-backed evidence.
- [x] Source-pack ingestion deduplicates by content hash before adding chunks or derived claims.
- [x] A source pack can be expanded by id without loading unrelated global knowledge into context.
- [x] Redaction checks run before any claim, evidence record, source chunk, or link reaches disk.

### 4. Cross-Scope Recall Contract
Compose project and global recall deterministically instead of one merged fuzzy list.
- [x] Default repo recall searches project memory first, then global memory with a bounded per-scope quota.
- [x] Agents can request project-only, global-only, source-specific, or all-project open-loop views.
- [x] Recall results include brain, source, subject key, lifecycle, confidence, timestamps, and provenance fields.
- [x] Claims with matching subject keys and incompatible content surface as conflicts requiring source-backed reconciliation.

### 5. Startup and Instruction Cutover
Make Memory v2 the actual workflow path, not an optional side channel.
- [x] Core skills read a small global brief, then the current project memory and open-loop briefs, before any legacy KB fallback.
- [x] `AGENTS.md`/`CLAUDE.md`, README, and the shared memory block name Memory v2 runtime as the canonical recall path and Obsidian/KB markdown as optional import/export.
- [x] Repo-authored docs such as decisions, plans, and `CONTEXT.md` remain valid source/evidence artifacts; they are no longer the primary memory interface.
- [x] If global state is missing or corrupt, startup degrades with a visible warning and still reads project memory.
- [x] Large research packs stay out of startup context until recalled or expanded.

### 6. Event-Gated Global Capture
Capture global knowledge at workflow boundaries instead of relying on migration or session-end hooks.
- [x] The write gate can classify new knowledge as project-local, global, both, or nothing durable.
- [x] `both` means one canonical global claim plus an optional project-local application note, sharing evidence and `subject_key`; it does not mean silent duplicate claims.
- [x] Research, user preference, recurring workflow lesson, and cross-project architecture events can write global claims with evidence.
- [x] Consolidation promotes source-pack/evidence material into durable claims only when the reusable lesson is explicit and source-backed.

### 7. Maintenance, Staleness, and Locks
Extend maintenance from project runtime state to global brain health without creating racey multi-file updates.
- [x] Maintenance reports stale global claims, expired source packs, duplicates, orphan links, missing source evidence, and conflicts.
- [x] Apply mode performs only conservative lifecycle changes such as `needs_review`, `superseded`, or `archived`.
- [x] Maintenance never deletes global source material without an explicit operator action.
- [x] Multi-file updates use append-only records or deterministic lock ordering, and stale brief regeneration failures preserve successful writes.

### 8. Evaluation and Dogfood Gates
Protect the design with executable behavior checks before calling the global layer done.
- [x] Runtime eval covers global write, scoped recall, project/global conflict, source-pack expansion, stale global maintenance, and no-Obsidian dependency.
- [x] A dogfood report compares startup usefulness before and after global briefs using real 0th sessions: useful recalls, stale/conflicting recalls, token cost, and whether legacy KB fallback was needed.
- [x] Install/runtime doctor verifies repo version, plugin cache version, project state, global state, and recall readiness.
- [x] Source-pack fidelity checks prove verbatim chunks round-trip by content hash.

### 9. Obsidian Migration Boundary
Keep the shipped skill focused on ongoing Memory v2 behavior; legacy Obsidian migration is a one-time operator task outside the installed skill surface.
- [x] No `memory migrate` command or Obsidian-specific migration script ships with the skill.
- [x] Memory v2 proves it can stand alone through no-Obsidian runtime evaluation instead of through a bundled migration path.
- [x] Existing markdown remains source/evidence material; promotion into global memory happens through normal source packs and write gates.
- [x] Human-readable Obsidian-style pages, if needed later, should be generated by a one-off operator script from Memory v2 state, not maintained as canonical skill behavior.
