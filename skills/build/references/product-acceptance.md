# Product Acceptance and Risk-Triggered Review

Product acceptance is required for complex, multi-slice, UI, content-heavy, onboarding, learning, or other user-facing work. Mechanical internal changes may record `required: false` with a concrete rationale.

Write `verification-report/product-acceptance.json`. Judge against the decision record, plan acceptance criteria, explicit user brief, then repo standards. If those sources cannot judge subjective quality, return `BLOCKED_BY_SPEC`.

For required acceptance, inspect user-facing evidence such as screenshots, browser notes, terminal output, or live-flow results. A diff alone cannot prove product quality. Max 3 product acceptance rounds; fix blockers and in-scope polish, rerun affected proof, and preserve deferred out-of-scope findings.

Use another reviewer only when it has a named evidence advantage: fresh context plus an executable oracle, a distinct product surface, or a measured cross-model blind-spot advantage. Route it through the observed capability gate. `ask-counterpart-review` is risk-triggered, not a universal build step. Record unique blockers, duplicates, false positives, fixes accepted, and cost when available.

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
