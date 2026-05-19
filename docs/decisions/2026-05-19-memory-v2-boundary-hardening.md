# Memory v2 Boundary Hardening

**Date:** 2026-05-19
**Status:** active
**Durable:** yes — the chosen slice redraws where Memory v2 treats project roots, evidence ownership, and incident sources as first-class boundaries; future agents would otherwise patch each dogfood symptom independently.

## Decision

Build the next Memory v2 iteration as **boundary hardening**: make workspace/project root selection, evidence pointer ownership, and incident import boundaries explicit in runtime behavior. The first slice should handle non-git workspace preflight guidance, stable evidence resolution for archived or cross-project sources, and `/retro` incident promotion into the generated memory brief.

## Constraints

- Runtime eval already passes, so this is not a backend rewrite; preserve the local JSONL/runtime-state backend.
- Markdown remains evidence, but evidence pointers must survive normal KB lifecycle moves such as `raw/` to `raw/archived/`.
- Global memory must not resolve relative evidence against whichever repo the current agent happens to be in.
- Incident aggregation already exists in `/retro`; do not create a second incident taxonomy.
- Keep startup context small: improve briefs and diagnostics, not broad KB scanning.

## Not Doing

- No hosted memory backend or vector database adoption in this slice.
- No wholesale Obsidian migration helper in the installed runtime.
- No automatic destructive cleanup of broken evidence pointers; report and offer source-backed repair.
- No instruction-only fix for `AGENTS.md` drift unless a runtime/test guard also catches future drift.

## Depends On

- [0th Memory v2](./2026-05-10-0th-memory-v2.md)
- [Memory Backend Eval](./2026-05-10-memory-backend-eval.md)
- [Working Artifacts Lifecycle](./2026-05-11-working-artifacts-lifecycle.md)
- [Skill Incident Log + /retro Process](./2026-05-03-skill-incident-log.md)
- [Memory Dogfood Opportunities](../evals/2026-05-19-memory-dogfood-opportunities.md)
