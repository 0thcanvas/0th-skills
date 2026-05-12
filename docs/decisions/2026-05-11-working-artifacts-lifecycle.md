# Working Artifacts Lifecycle

**Date:** 2026-05-11
**Status:** active
**Durable:** yes — this changes the meaning of repo docs, memory, and generated artifacts across all 0th workflows; future agents would otherwise treat stale pre-production files as current truth.

## Decision

Separate workflow outputs into three lanes — Memory v2 (compact agent record), repo docs (promoted durable evidence), and working artifacts (temporary scaffolding under the 0th state root). Drafts, exploratory reports, and human-facing comparisons default to the state root (`$OTH_SKILLS_STATE_DIR`, `$XDG_STATE_HOME`, then `~/.0th/skills/...`) until a workflow boundary compacts their useful content into memory or promotes it to repo docs. See `references/working-artifacts.md` for the full contract.

Aligned `/think` decision records still write to `docs/decisions/`; this decision only adds a draft lane before alignment and a lifecycle review after a repo doc stops describing current reality. Deleting a repo doc that Memory v2 cites requires first leaving a tombstone, evidence record, source pack, or replacement source pointer.

## Constraints

- Stale HTML, plans, and decision drafts in `docs/` can poison agent context even when intended for humans, so the three lanes must stay distinct.
- Cleanup is lifecycle-driven, not age-driven: current, compact, supersede, or delete based on whether the artifact still helps a future decision; report before destructive cleanup.
- Gate-consumed verification artifacts are an explicit exception — `${VERIFICATION_REPORT_DIR:-verification-report}` remains checkout-local and gitignored because `/build`, `/ship`, and `ship-gate` read verifier briefs, reports, product acceptance, and counterpart-review evidence from that path.

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
