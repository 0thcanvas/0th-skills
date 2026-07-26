# Product Acceptance Loop Plan

**Status:** completed historical plan; review mechanics partially superseded on 2026-07-26
**Original decision:** [Product Acceptance Loop](../decisions/2026-05-10-product-acceptance-loop.md)
**Current review decision:** [Evidence-Seeking Review](../decisions/2026-07-26-evidence-seeking-review.md)

This plan introduced product acceptance evidence and the optional experience-reviewer surface. Those
parts remain useful. Its fixed review taxonomy, three-round loop, and mandatory counterpart-review
or skip artifacts are no longer workflow requirements.

Current executable behavior lives in:
- `skills/build/references/product-acceptance.md`
- `scripts/ship-gate.mjs`
- `tests/product-acceptance-workflow.test.mjs`
- `tests/ship-gate.test.mjs`
