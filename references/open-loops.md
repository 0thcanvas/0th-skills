# Open Loops Contract

Open loops are the Memory v2 action layer: unfinished work, blocked follow-ups, and handoff items
that should reappear at the next session start.

They are separate from memory claims. Memory says what is known; open loops say what still needs
action.

## Storage

- Repo-local loops live in `.0th/tasks/open-loops.jsonl`.
- The session-start brief lives in `.0th/tasks/brief.md`.
- Use `scripts/open-loop.mjs` for writes and status changes.
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

- `title`
- `scope`
- `status`
- `priority` (`P0`-`P3`)
- `next_action`
- `evidence_path` or `source_paths`
- `created_at`
- `updated_at`

Use open loops at handoff and workflow boundaries whenever real work remains. Do not store TODOs as
memory claims.
