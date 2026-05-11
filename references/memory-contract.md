# Memory Contract

This contract defines how 0th skills decide whether new knowledge should become memory.

Memory is workflow-integrated: capture happens at meaningful events, not only at session end.
Markdown artifacts remain the human-review evidence layer; generated briefs, local evidence
records, compact recall, and expand-by-id are the machine-facing recall layer.

## Runtime State

Generated Memory v2 state is user/runtime data, not product-repo content. By default, scripts
store project-scoped state outside the target checkout under:

- `$OTH_SKILLS_STATE_DIR/projects/<project-key>/...` when `OTH_SKILLS_STATE_DIR` is set.
- `$XDG_STATE_HOME/0th-skills/projects/<project-key>/...` when `XDG_STATE_HOME` is set.
- `~/.0th/skills/projects/<project-key>/...` otherwise.

`<project-key>` is derived from the Git `origin` URL when available, falling back to the checkout
path for non-Git directories. The command JSON output always reports the concrete file it read or
wrote. Use explicit `--memory-file`, `--brief-output`, `--task-file`, or `--output` only for tests
or deliberate migration work.

Global cross-project claims and evidence use the same state-root contract, but route to the
shared global brain instead of the current project store:

- `$OTH_SKILLS_STATE_DIR/global/...`
- `$XDG_STATE_HOME/0th-skills/global/...`
- `~/.0th/skills/global/...`

For normal memory/evidence writes, `scope: global` routes to the global brain. Explicit file flags
still win for tests and deliberate migration work. Use `memory doctor` when an agent needs to
inspect the resolved project paths, global paths, routing rules, and plugin/cache versions.

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

Track open loops through `scripts/memory.mjs open-loop`, then generate the open-loop brief with
`scripts/memory.mjs task-brief` at session start after the memory brief. Use `repo` scope for work
tied to one checkout, `project` scope for work spanning repos in the same product, and `global`
scope only for cross-project operating concerns. `memory.mjs` is the unified entrypoint; the
named per-command scripts (`memory-write.mjs`, `open-loop.mjs`, `memory-recall.mjs`, etc.) hold
the canonical implementation and remain usable directly for tests and migration work.

Normal agents should use the unified entrypoint:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" open-loop list
```

The per-command scripts hold the canonical implementation; `memory.mjs` only routes. Direct
invocation of `scripts/memory-write.mjs`, `scripts/open-loop.mjs`, etc. is supported for tests
and migration tooling.

## Evidence Records

Evidence records are local provenance events under the same user/runtime state root as claims and
open loops. They capture the workflow event that produced a claim or action without committing
generated state to the product repo.

Evidence records include:

- `id`
- `event_type`: decision, exploration, repo_update, test, ship, research, user_correction,
  open_loop, or maintenance
- `scope`: repo, project, domain, user, or global
- `summary`
- `observed_at`
- `redaction_status`: no_secrets_observed, redacted, or secret_reference_only
- optional `source_paths`, `evidence_paths`, and `related_ids`

Secret-bearing values must never be written to evidence records. The evidence writer rejects
obvious token/API-key shapes, but the workflow still depends on agents recording source pointers
and redacted summaries rather than raw transcript dumps.

## Global Routing Fields

Global Memory v2 separates record ownership from recall scope. Claims and evidence may carry:

- `brain_id` — storage owner, e.g. `global` or `project`.
- `source_id` — named source namespace, e.g. a research pack or workflow domain.
- `topic` — coarse retrieval bucket.
- `subject_key` — stable conflict/reconciliation key for the thing being discussed.
- `owner_project_key` — project that produced or applies the record when relevant.
- `related_ids` — explicit source-backed links to other records.

Legacy project records without these fields remain valid. Recall synthesizes defaults rather than
rewriting old memory: `brain_id: project`, `source_id: project-runtime`, `subject_key: <record id>`,
and `topic: null`.

Global claim writes are stricter than project claim writes: `scope: global` requires an explicit
`source_id` plus normal evidence/source pointers. This prevents reusable cross-project memory from
landing in the global brain without a named source namespace.

## Source Packs

Source packs are the fidelity layer for global research/reference material. A source pack stores
verbatim redacted text chunks, stable source-pointer metadata, chunk summaries, timestamps,
redaction status, stale-after policy, and content hashes. Hashes are computed from the stored
redacted bytes plus stable source-pointer metadata, so deduplication and fidelity checks are
reproducible. Summaries and indexes point back to chunks; they do not replace source text.

Source packs are written through the unified memory surface:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" source-pack ingest \
  --json /path/to/source-pack.json
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" source-pack expand \
  --id memory-systems-world-model
```

The global source store keeps compact metadata in `global/sources/index.jsonl` and verbatim chunks
in per-pack JSONL files under `global/sources/packs/`. Ingestion normalizes and scans chunks for
secret-like content before taking the write lock, then deduplicates by `content_hash`. Expansion by
id reads only the requested pack file; agents should expand source packs on demand instead of
loading all global source material at startup.

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

When the scope is not obvious, use the executable gate:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" write-gate \
  --event-type research \
  --claim "Source-pack content hashes are reusable across memory projects." \
  --source-id memory-systems-world-model \
  --evidence-path "sources/memory/source-pack.jsonl" \
  --confidence high
```

The gate classifies events as `project`, `global`, `both`, or `nothing_durable`. Global and `both`
capture require `source_id` plus source-backed evidence. `both` writes one canonical global claim
and, only when a distinct `--project-claim` is supplied, a project-local application note linked to
the global claim by `related_ids` and the shared `subject_key`; it does not silently duplicate the
global claim into the project store. Consolidation from source packs or evidence into durable claims
requires an explicit reusable lesson and source-backed evidence.

## Canonical Writer

Durable memory claims must be written through `scripts/memory.mjs remember`; do not hand-edit
the runtime `claims.jsonl`. The canonical implementation lives in `scripts/memory-write.mjs`;
`scripts/memory.mjs` is a routing dispatcher and direct invocation of `scripts/memory-write.mjs`
is supported for tests and migration tooling.

Minimum command shape:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" remember \
  --type decision \
  --claim "Use write-through memory events instead of session-end hooks." \
  --scope repo \
  --evidence-path "docs/decisions/2026-05-10-0th-memory-v2.md" \
  --source-path "references/memory-contract.md" \
  --confidence high
```

The writer validates required fields, appends one JSONL claim under a local file lock, rejects
duplicate explicit ids, and regenerates the memory brief unless `--no-brief` is passed.
`memory sync`, `memory reconcile`, and `memory maintain --apply` also refresh the brief whenever
they update any claim, so the brief never lags lifecycle-state changes. If brief regeneration
fails (filesystem error, disk full, brief target is a directory), the claim or lifecycle update is
preserved and the failure surfaces on the result as `brief_error` — the writer never silently
drops a successful claim because the brief refresh threw.

`evidence_path` vs `evidence_ids` vs `source_paths`: `evidence_path` is a single path to the
proof artifact that justifies the claim (the decision record, dossier, or doc you would point a
human at to defend the claim). `evidence_ids` cite local evidence records. `source_paths` is the
list of code or document paths the claim is *about* — the files that, if they change, should mark
the claim `needs_review`. A claim can have one `evidence_path`, one or more `evidence_ids`, and
zero or more `source_paths`; supplying none of these is a validation error.

## Concurrency

Memory, evidence, repo-state, and open-loop mutations take a local file lock before the
read-modify-write cycle. The lock prevents silent lost updates when multiple hooks or agents write
the same project runtime directory. If a lock is stale, the command removes it deterministically
and reports `lock.stale_removed: true`; if a live lock cannot be acquired before timeout, the
command fails visibly rather than racing.

## Sync Granularity

`scripts/memory-sync.mjs` intersects each claim's `source_paths` against the files reported by
`git diff --name-only <from>..<to>`. It does **not** check `source_symbols`: symbol-level
matching belongs to `scripts/read-set-reconcile.mjs`, which compares a claim's listed symbols
against the actual symbols an explorer agent inspected. A claim with only `source_symbols` and
no `source_paths` will therefore not be flagged by sync; it must be reconciled via the read-set
path. This split keeps sync cheap and deterministic (no diff-text grep) while still enabling
symbol-aware verification when an agent has already paid the inspection cost.

## Claim Schema

Each claim in the runtime `claims.jsonl` is one JSON object with:

- `id` — unique; generated from date, type, and claim text when omitted.
- `type` — one of the Memory Types above.
- `claim` — concise reusable knowledge, not a transcript.
- `scope` — `repo`, `project`, `domain`, `user`, or `global`.
- `lifecycle_state` — one of the Lifecycle States above.
- `created_at` and `last_confirmed_at` — ISO timestamps.
- `confidence` or `review_caveat`.
- `evidence_path`, at least one `evidence_ids` entry, or at least one `source_paths` entry.
- Optional `source_symbols`, `supersedes`, and `superseded_by`.

## Recall and Maintenance

Use compact recall before expanding detail:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" recall \
  --query "repo preflight stale memory" \
  --limit 5
```

Default recall is `store_scope: combined`: it searches current-project memory/tasks/evidence first,
then appends a bounded global-memory result set. This keeps repo work anchored in local state while
still making cross-project knowledge available. Use `--project-only`, `--global-only`,
`--source-id <source_id>`, `--project-limit N`, `--global-limit N`, or `--all-project-tasks` when
the workflow needs narrower routing.

Recall returns ranked compact records with `id`, kind/type, `store_scope`, brain/source/subject
routing fields, lifecycle state, confidence or caveat, timestamps, snippets, and source pointers.
Claims with the same `subject_key` and different claim text are surfaced in the top-level
`conflicts` array with source pointers so an agent can reconcile them with evidence instead of
silently picking one. Use `memory expand --id <id>` to fetch the full record or source pack. If no
record matches, recall/expand returns an abstention-shaped result instead of inventing.

Use `memory maintain` to report stale claims, duplicate candidates, missing sources, orphan open
loops, supersession candidates, and repo drift. `memory maintain --apply` may perform conservative
source-backed lifecycle changes, such as marking duplicate candidates `needs_review`; it does not
destructively delete memory.
