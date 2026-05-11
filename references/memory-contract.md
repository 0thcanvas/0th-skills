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

## Open Loops

Open loops are unfinished actions, blockers, and handoff items. They are not durable memory
claims; do not store TODOs as memory claims.

Track open loops in `.0th/tasks/open-loops.jsonl` through `scripts/open-loop.mjs`, then
generate `.0th/tasks/brief.md` with `scripts/open-loop-brief.mjs` at session start after the
memory brief. Use `repo` scope for work tied to one checkout, `project` scope for work spanning
repos in the same product, and `global` scope only for cross-project operating concerns.

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

## Canonical Writer

Durable memory claims must be written through `scripts/memory-write.mjs`; do not hand-edit
`.0th/memory/claims.jsonl`.

Minimum command shape:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory-write.mjs" \
  --type decision \
  --claim "Use write-through memory events instead of session-end hooks." \
  --scope repo \
  --evidence-path "docs/decisions/2026-05-10-0th-memory-v2.md" \
  --source-path "references/memory-contract.md" \
  --confidence high
```

The writer validates required fields, appends one JSONL claim, rejects duplicate explicit ids,
and regenerates `.0th/memory/brief.md` unless `--no-brief` is passed. `scripts/memory-sync.mjs`
and `scripts/read-set-reconcile.mjs` also refresh the brief whenever they update any claim, so
the brief never lags lifecycle-state changes. If brief regeneration fails (filesystem error,
disk full, brief target is a directory), the claim or lifecycle update is preserved and the
failure surfaces on the result as `brief_error` — the writer never silently drops a successful
claim because the brief refresh threw.

`evidence_path` vs `source_paths`: `evidence_path` is a single path to the proof artifact that
justifies the claim (the decision record, dossier, or doc you would point a human at to defend
the claim). `source_paths` is the list of code or document paths the claim is *about* — the
files that, if they change, should mark the claim `needs_review`. A claim can have one
`evidence_path` and zero or more `source_paths`; supplying neither is a validation error.

## Concurrency

The canonical writer and the open-loop writer both use a read-modify-write cycle with an atomic
`tmp + rename`. That guards against torn writes from a single process, but it does **not**
guard against lost updates under concurrent writers: if two processes (e.g., two `/build`
sessions on the same checkout, or `memory-write` overlapping with the auto-sync inside
`session-preflight`) both read the JSONL at time T, both append their own claim, and both
rename, whichever renames last wins and the other claim is silently lost.

Memory v2 assumes a **single writer per checkout**. If you run multiple agents or shells against
the same `.0th/memory/` or `.0th/tasks/` directory, serialize the writes yourself (one CLI at a
time, or a wrapper that takes an exclusive lock). A future revision may add `flock`-style
locking; until then the contract is documented above so silent loss does not surprise anyone.

## Sync Granularity

`scripts/memory-sync.mjs` intersects each claim's `source_paths` against the files reported by
`git diff --name-only <from>..<to>`. It does **not** check `source_symbols`: symbol-level
matching belongs to `scripts/read-set-reconcile.mjs`, which compares a claim's listed symbols
against the actual symbols an explorer agent inspected. A claim with only `source_symbols` and
no `source_paths` will therefore not be flagged by sync; it must be reconciled via the read-set
path. This split keeps sync cheap and deterministic (no diff-text grep) while still enabling
symbol-aware verification when an agent has already paid the inspection cost.

## Claim Schema

Each claim in `.0th/memory/claims.jsonl` is one JSON object with:

- `id` — unique; generated from date, type, and claim text when omitted.
- `type` — one of the Memory Types above.
- `claim` — concise reusable knowledge, not a transcript.
- `scope` — `repo`, `project`, `domain`, `user`, or `global`.
- `lifecycle_state` — one of the Lifecycle States above.
- `created_at` and `last_confirmed_at` — ISO timestamps.
- `confidence` or `review_caveat`.
- `evidence_path` or at least one `source_paths` entry.
- Optional `source_symbols`, `supersedes`, and `superseded_by`.
