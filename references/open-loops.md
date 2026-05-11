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
- Use `scripts/open-loop.mjs` for writes and status changes (`add`, `block`, `close`, `drop`,
  plus `list` for read access).
- Use `scripts/open-loop-brief.mjs` for the generated startup brief.

## Lifecycle

- `open` — actionable now.
- `blocked` — waiting on input, external state, or a decision.
- `done` — completed and retained for provenance.
- `dropped` — intentionally no longer worth doing.

## Scope

- `repo` — tied to one checkout or PR.
- `project` — spans multiple repos in one product.
- `global` — cross-project operating concern.

## Required Fields

A stored open-loop record always carries all of the following. Fields marked **must supply**
must come from the caller (via `--<flag>` or the `--json` payload); the rest are filled in by
`scripts/open-loop.mjs` when omitted.

| Field             | Storage     | Caller obligation                       |
|-------------------|-------------|-----------------------------------------|
| `title`           | required    | **must supply**                         |
| `scope`           | required    | **must supply**                         |
| `next_action`     | required    | **must supply**                         |
| `evidence_path` or `source_paths` | required (at least one) | **must supply at least one** |
| `status`          | required    | defaults to `open`                      |
| `priority`        | required    | defaults to `P2`                        |
| `created_at`      | required    | defaults to `new Date().toISOString()`  |
| `updated_at`      | required    | defaults to `created_at`                |
| `blocked_reason`  | conditional | **must supply** when status flips to `blocked` |
| `drop_reason`     | conditional | **must supply** when status flips to `dropped` |

Both explicit flags (`--id`, `--blocked-reason`, `--drop-reason`, `--evidence-path`,
`--source-path`, `--next-action`) and `--json FILE` are accepted. **Explicit flags always win
over `--json` values on conflict, regardless of argv order.** If you want a `--json` field to
take effect, omit the matching explicit flag.

Use open loops at handoff and workflow boundaries whenever real work remains. Do not store TODOs
as memory claims.

## State Machine

`scripts/open-loop.mjs` does not enforce transition guards today: any status can move to any
other status. The CLI does, however, enforce **required-context** rules above (`blocked_reason`
on `block`, `drop_reason` on `drop`, existing `id` on `block`/`close`/`drop`).

If you need stricter lifecycle invariants (for example "done is terminal" or "dropped cannot be
reopened"), enforce them in the calling skill rather than at the writer for now. A future
revision may add transition guards plus an append-only audit log; the current contract is
loose-by-design to avoid premature constraints.
