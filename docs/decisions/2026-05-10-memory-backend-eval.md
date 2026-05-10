# Memory Backend Eval

Date: 2026-05-10

## Decision

Keep the thin 0th-local memory layer as the active Memory v2 backend.

Do not replace it with MemPalace or agentmemory yet.

## Evidence

- The eval set in `docs/evals/2026-05-10-memory-recall-questions.json` covers 12 real 0th recall tasks across decisions, stale claims, recurring mistakes, repo vocabulary, and changed code behavior.
- The baseline matrix in `docs/evals/2026-05-10-memory-backend-baselines.json` compares current markdown lookup, the thin local layer, MemPalace-style verbatim retrieval, and agentmemory-style lifecycle/profile behavior.
- `scripts/memory-eval.mjs` scores each baseline by the capabilities required to answer those tasks. This is a capability eval, not a full retrieval benchmark.
- The thin local layer is the only candidate that covers canonical writes, repo preflight, memory sync after pulls, generated briefs, read-set reconciliation, open-loop action tracking, and lifecycle state in the current workflow.

## Consequences

- Markdown remains the authoritative storage format for now, but agents should interact with it through workflow commands, compact briefs, and open-loop tracking instead of manual vault browsing.
- External memory backends remain candidates for a later executable retrieval benchmark, especially if recall volume grows beyond what local JSON/markdown indexes can handle.
- Adoption criteria for an external backend: it must beat the thin local layer on real recall tasks without losing repo freshness, stale-claim handling, and source provenance.
