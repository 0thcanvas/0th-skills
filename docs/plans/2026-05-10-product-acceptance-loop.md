# Product Acceptance Loop Plan

**Decision:** [Product Acceptance Loop](../decisions/2026-05-10-product-acceptance-loop.md)
**Slices:** 5

## Architecture
- `/build` owns feature quality through implementation, slice review, product acceptance, verifier evidence, and counterpart diff review.
- Product acceptance uses `/think` and `/plan` as the subjective source of truth: target user, tone, content standards, and acceptance criteria.
- `/ship` becomes a lightweight landing gate that checks evidence freshness, safety, docs sync, PR shape, and merge approval.
- Reports should distinguish `BLOCKER`, `POLISH`, `NIT`, `OUT_OF_SCOPE`, and `BLOCKED_BY_SPEC`.
- Product acceptance evidence is one machine-readable artifact: `verification-report/product-acceptance.json`.
- Shared reviewer behavior must land on both host surfaces: Claude `agents/*.md`, Codex `.codex/agents/*.toml`, README docs, and parity tests.

## Product Acceptance Report

`/build` writes `verification-report/product-acceptance.json` before handoff to `/ship`:

```json
{
  "schema_version": 1,
  "feature": "<short feature name>",
  "required": true,
  "required_rationale": "<why acceptance was required or not required>",
  "source": {
    "decision": "docs/decisions/...",
    "plan": "docs/plans/...",
    "user_brief": "<short summary or null>"
  },
  "judgment_hierarchy": [
    "decision_record",
    "plan_acceptance_criteria",
    "explicit_user_brief",
    "repo_standards"
  ],
  "outcome": "PASS",
  "rounds": [],
  "fixed_issues": [],
  "deferred_items": [],
  "evidence_paths": ["verification-report/<evidence-path>"],
  "reviewed_at": "2026-05-10T00:00:00.000Z"
}
```

Allowed outcomes: `PASS`, `NEEDS_ITERATION`, `BLOCKED_BY_SPEC`, `NOT_REQUIRED`. If `required` is `true`, only `PASS` may ship. If `required` is `false`, outcome must be `NOT_REQUIRED` and `required_rationale` must explain why.

## Slices

### 1. Define Product Acceptance Contract
Document the loop, finding classes, stop conditions, and source-of-truth hierarchy.
- [x] Build guidance requires plan/decision/user-journey comparison before ship handoff.
- [x] Reviewers cannot invent subjective taste when the decision or plan is underspecified.
- [x] The loop fixes blockers and in-scope polish, records out-of-scope ideas, and stops after three rounds.
- [x] `verification-report/product-acceptance.json` is documented as the single acceptance evidence artifact.

### 2. Add Experience Reviewer Role
Introduce an agent prompt for product, UX, and content review from the target user's perspective.
- [x] Reviewer checks UI flow, unnecessary elements, edge cases, copy quality, and instruction timing.
- [x] Learning-app guidance includes learner level, pedagogy, cognitive load, and human-sounding copy.
- [x] Output format produces actionable findings with evidence and fix-before-human-review items.
- [x] Claude and Codex reviewer manifests are both added and covered by parity tests.

### 3. Wire Build To Run Acceptance Before Ship
Update build flow so features produce acceptance evidence after verifier/user-flow evidence and before ship handoff.
- [x] Complex/UI/content-heavy features trigger the Product Acceptance Loop.
- [x] Non-complex features write a `NOT_REQUIRED` product acceptance report with rationale.
- [x] UI/content-heavy acceptance consumes screenshots, verifier evidence, or its own live user-flow evidence before judging experience.
- [x] Build completion summary includes acceptance rounds, issues fixed, and remaining deferred items.
- [x] Counterpart diff review moves from ship into build evidence collection.
- [x] `agents/ask-counterpart-review.md` describes `/build` as the code/diff review owner and `/ship` as evidence checker.

### 4. Lighten Ship Into Landing Hygiene
Reduce ship to final fast checks and PR handling.
- [x] Ship checks tests, verifier report, product acceptance report, counterpart review evidence, and docs sync.
- [x] Ship no longer initiates first-time substantive counterpart review.
- [x] Ship validates product acceptance presence/freshness/outcome only; it does not re-judge product quality.
- [x] PR summary presents evidence status and any explicitly deferred product concerns.

### 5. Add Mechanical Guards And Tests
Protect the new boundary with docs tests and gate behavior.
- [x] Tests fail if ship still owns first-time counterpart review language.
- [x] Tests fail if build omits product acceptance or counterpart evidence requirements.
- [x] Tests fail if a shared experience reviewer lacks Claude/Codex parity.
- [x] Ship gate fails on missing/malformed product acceptance reports, required reports without `PASS`, and not-required reports without rationale.
