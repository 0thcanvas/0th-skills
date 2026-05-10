# Memory Contract

This contract defines how 0th skills decide whether new knowledge should become memory.

Memory is workflow-integrated: capture happens at meaningful events, not only at session end.
Markdown artifacts remain the evidence layer; generated briefs and indexes are the machine-facing
recall layer.

## Memory Types

- `decision` — a chosen direction, rejected alternative, or durability reason.
- `observation` — a dated fact noticed during work that may or may not become durable.
- `root_cause` — a verified explanation for a bug, failure, or confusing behavior.
- `vocabulary` — a canonical project term, rejected alias, relationship, or ambiguity.
- `incident` — a user correction, agent misfire, tool failure, or workflow issue.
- `repo_state` — branch, upstream, changed-source, or review-state information that affects work.
- `external_research` — source-backed outside knowledge that should be reusable.

## Lifecycle States

- `active` — current and safe to use.
- `needs_review` — source changed or confidence is uncertain; use only with that caveat.
- `superseded` — replaced by newer memory; keep for provenance.
- `archived` — low-current-value memory retained as evidence.
- `ephemeral` — useful in the current turn or slice, not promoted to durable memory.

## Memory Write Gate

Run this gate at meaningful workflow boundaries: after a decision, verified root cause, user
correction, stale assumption, repo update, slice completion, external research finding, or before
context compaction.

Choose exactly one primary outcome:

- `decision`
- `observation`
- `root_cause`
- `vocabulary`
- `incident`
- `repo_state`
- `external_research`
- `nothing durable`

For every durable outcome, record:

- evidence or source path
- scope: repo, project, domain, user, or global
- lifecycle state
- created date
- last confirmed date when verified
- confidence or review caveat
- supersedes / superseded_by when replacing older memory

If the outcome is `nothing durable`, write nothing and say so only when the user needs to know.
