# Product Acceptance and Risk-Triggered Review

Product acceptance is required for complex, multi-slice, UI, content-heavy, onboarding, learning, or other user-facing work. Mechanical internal changes may record `required: false` with a concrete rationale.

Write `verification-report/product-acceptance.json`. Judge against the decision record, plan acceptance criteria, explicit user brief, then repo standards. If those sources cannot judge subjective quality, return `BLOCKED_BY_SPEC`.

For required acceptance, inspect user-facing evidence such as screenshots, browser notes, terminal
output, or live-flow results. A diff alone cannot prove product quality. Iterate only while new
evidence or an in-scope change justifies another pass; do not loop merely to satisfy a reviewer.

Product acceptance is an evidence check, not mandatory model review. Use another reviewer only when
it has a named evidence advantage such as fresh context, a distinct product surface, separate evidence
access, or a measured capability difference; route cross-model review through
`ask-counterpart-review`. Findings remain hypotheses; the implementer may reject them. When review
is used, record its useful findings, false positives, accepted fixes, and cost if that information
helps later evaluation. `/ship` does not require a review artifact or a skip explanation.

Required report shape:

```json
{
  "schema_version": 1,
  "feature": "<short feature name>",
  "required": true,
  "required_rationale": "<why acceptance is required>",
  "source": {
    "decision": "docs/decisions/...",
    "plan": "docs/plans/...",
    "user_brief": "<summary>"
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
  "evidence_paths": [
    "verification-report/<evidence-path>"
  ],
  "reviewed_at": "<ISO timestamp>"
}
```

Allowed outcomes: `PASS`, `NEEDS_ITERATION`, `BLOCKED_BY_SPEC`, `NOT_REQUIRED`.
