# Incident Contract

<!-- lifecycle: current — owned by /retro and scripts/retro-aggregator.mjs. -->

Store one redacted incident per file at
`${KB_ROOT}/learning/skill-incidents/YYYY-MM-DD-<slug>.md`; append `-2`, `-3`, and so on when the
slug already exists. The same agent that observed the miss captures facts first, then applies the
ordered workflow in `../SKILL.md`: extract evidence, redact, classify, aggregate.

Frontmatter contains a timezone-aware `date`, one primary `skill`, optional `related_skills`, one
classification, severity, and deduplicated tags. Classifications are `user-ambiguity`,
`skill-issue`, `context-rot`, `tool-failure`, `model-limitation`, `verification-skipped`, or
`unknown`. `unknown` requires exactly one of `candidate_new_category` or `insufficient_evidence`.

The body order is:

```markdown
## What user wanted
## What agent did
## Correction evidence
## Root cause
## Proposed action
```

Resolved secrets, tokens, cookies, customer PII, private prompt bodies, and unnecessary private code
must not enter an incident. Secret-manager references such as `op://` may be named; their resolved
values may not.

Aggregation uses the primary skill without fanning out `related_skills`. Surface every bucket that
reaches three lifetime entries and annotate whether three occurred in the inclusive prior 30 days.
The user chooses whether to apply, save, or ignore a proposed workflow change. Incident capture never
silently edits a skill.
