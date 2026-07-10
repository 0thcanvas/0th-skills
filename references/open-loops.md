# Open Loops Contract

Open loops are the Memory v2 action layer: unfinished work, blocked follow-ups, and handoff items
that should reappear at the next session start.

They are separate from memory claims. Memory says what is known; open loops say what still needs
action.

## Storage

- Open loops default to the user-level Memory v2 runtime state directory, not the product repo.
- The concrete runtime files are reported in command JSON as `task_file`, `brief_file`, or
  `output_file`.
- The default root is `$OTH_SKILLS_STATE_DIR/projects/<project-key>/...`,
  `$XDG_STATE_HOME/0th-skills/projects/<project-key>/...`, or
  `~/.0th/skills/projects/<project-key>/...`.
- Use `scripts/memory.mjs open-loop` for writes and status changes (`add`, `block`, `close`,
  `drop`, `reopen`, plus `list` for read access). `scripts/open-loop.mjs` holds the canonical
  implementation; direct invocation is supported for tests and migration tooling.
- Use `scripts/memory.mjs startup --query "<task keywords>"` for bounded startup retrieval. Reserve
  `task-brief` for explicit broad open-loop audits.
- If task-brief regeneration fails after an open-loop write, the task mutation is preserved and the
  command result reports `brief_error` with `brief_updated: false`.

## Lifecycle

- `open` — actionable now.
- `blocked` — waiting on input, external state, or a decision.
- `done` — completed and retained for provenance.
- `dropped` — intentionally no longer worth doing.

## Scope

- `repo` — tied to one checkout or PR.
- `project` — spans multiple repos in one product.
- `global` — cross-project operating concern.

The open-loop `scope` vocabulary is intentionally narrower than the memory-claim and evidence-record
vocabularies (which also include `domain` and `user`). Open loops describe **work items** —
actionable next steps that map cleanly onto a checkout, a product, or a cross-project concern.
Memory claims and evidence records describe **knowledge**, which can also be domain-specific (e.g.,
JavaScript module resolution) or user-specific (an operator's preference). Do not paste a
`--scope domain` flag from a memory write into an open-loop add; the writer will reject it.

## Required Fields

A stored open-loop record always carries all of the following. Fields marked **must supply**
must come from the caller (via `--<flag>` or the `--json` payload); the rest are filled in by
`scripts/open-loop.mjs` when omitted.

| Field             | Storage     | Caller obligation                       |
|-------------------|-------------|-----------------------------------------|
| `title`           | required    | **must supply**                         |
| `scope`           | required    | **must supply**                         |
| `next_action`     | required    | **must supply**                         |
| `evidence_path`, `evidence_ids`, or `source_paths` | required (at least one) | **must supply at least one** |
| `status`          | required    | defaults to `open`                      |
| `priority`        | required    | defaults to `P2`                        |
| `created_at`      | required    | defaults to `new Date().toISOString()`  |
| `updated_at`      | required    | defaults to `created_at`                |
| `blocked_reason`  | conditional | **must supply** when status flips to `blocked` |
| `drop_reason`     | conditional | **must supply** when status flips to `dropped` |

Both explicit flags (`--id`, `--blocked-reason`, `--drop-reason`, `--evidence-path`,
`--source-path`, `--evidence-id`, `--next-action`) and `--json FILE` are accepted. **Explicit flags always win
over `--json` values on conflict, regardless of argv order.** If you want a `--json` field to
take effect, omit the matching explicit flag.

Use open loops at handoff and workflow boundaries whenever real work remains. Do not store TODOs
as memory claims.

## State Machine

`scripts/memory.mjs open-loop` does not enforce terminal transition guards today: any status can
move to any other status, including reopening dropped or done work when the workflow evidence
supports it. The CLI does enforce **required-context** rules above (`blocked_reason` on `block`,
`drop_reason` on `drop`, existing `id` on `block`/`close`/`drop`/`reopen`).

If you need stricter lifecycle invariants (for example "done is terminal" or "dropped cannot be
reopened"), enforce them in the calling skill rather than at the writer for now. Each transition
is appended to the record's `history` array so future agents can see created, blocked, done,
dropped, and reopened events without treating the current status as the whole story.
