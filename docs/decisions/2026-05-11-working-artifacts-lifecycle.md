# Working Artifacts Lifecycle

**Date:** 2026-05-11
**Status:** active
**Durable:** yes — this changes the meaning of repo docs, memory, and generated artifacts across all 0th workflows; future agents would otherwise treat stale pre-production files as current truth.

## Decision

Separate workflow outputs into three lanes: memory is the compact agent record, repo docs are promoted durable evidence, and working artifacts are temporary scaffolding outside the repo. Decision drafts, planning drafts, research drafts, exploratory HTML reports, and human review cockpits should default to the 0th state root (`$OTH_SKILLS_STATE_DIR`, `$XDG_STATE_HOME`, then `~/.0th/skills/...`) under `work/` or `artifacts/` until a workflow boundary compacts their useful content into memory and explicitly promotes any durable repo documentation.

Aligned `/think` decision records still follow the current skill contract and are written to `docs/decisions/`; this decision adds a draft lane before alignment and a lifecycle review after the decision stops describing current reality. Repo docs should describe current reality or intentionally promoted history. When a feature is deleted, replaced, or fully revamped, its docs should be deleted, superseded, or compacted into memory rather than left in `docs/` as accidental context. Deleting a repo doc that memory cites requires first leaving a durable tombstone, evidence record, source pack, or replacement source pointer so memory does not point at vanished proof.

## Constraints

- Future agents can read any checked-in file, so stale HTML, plans, and decision drafts in `docs/` can poison context even if they were intended for humans.
- Most decisions and plans are agent scaffolding, not human documentation; keeping every intermediate file creates a fossil layer with low current value.
- The system still needs a track record: durable lessons, tombstones, supersession links, and evidence pointers belong in Memory v2 lifecycle records.
- Cleanup should be lifecycle-driven, not age-driven: current, compact, supersede, or delete based on whether the artifact still helps a future decision.
- Gate-consumed verification artifacts are an explicit exception: `${VERIFICATION_REPORT_DIR:-verification-report}` remains checkout-local and gitignored because `/build`, `/ship`, and `ship-gate` read verifier briefs, reports, product acceptance, and counterpart-review evidence from that path.

## Not Doing

- No new `/html` skill; HTML remains a human-facing artifact mode used by existing skills when useful.
- No automatic destructive cleanup yet; initial maintenance should report candidates before applying changes.
- No promotion of HTML or draft docs as agent truth without a canonical memory/doc source.
- No session-end-only compaction; workflow boundaries such as decide, ship, abandon, delete, or supersede are the reliable capture points.
- No immediate rewrite of `/think`'s existing aligned-decision contract; changing that contract needs a build slice with tests and migration guidance.

## Depends On

- `docs/decisions/2026-05-10-0th-memory-v2.md` — Memory v2 is the compact agent-facing recall layer.
- `docs/decisions/2026-05-10-memory-backend-eval.md` — local Memory v2 won because it preserves lifecycle, evidence, and maintenance behavior.
- `docs/evals/2026-05-10-memory-backend-eval.md` — capability eval behind the selected Memory v2 backend.
- `${KB_ROOT}/tech/raw/2026-05-10-agent-memory-kb-alternatives.md` — prior research on compact briefs, lifecycle memory, and source-backed evidence.
