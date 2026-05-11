# Working Artifacts

Working artifacts are temporary files that help a human or agent think through work before the
useful result is compacted, promoted, or discarded.

## Lanes

- **Memory v2** is the compact agent record. Durable lessons, decisions, tombstones,
  supersession links, and evidence pointers belong there.
- **repo docs** are promoted durable evidence. They should describe current reality or
  intentionally preserved history.
- **working artifacts** are temporary scaffolding. Draft plans, decision drafts, research drafts,
  exploratory HTML reports, and human review cockpits are not agent truth by default.

## Paths

Place temporary `work/` and `artifacts/` files under the existing 0th state root rather than
hardcoding a home path. Resolve the state root using the same order as Memory v2:
`$OTH_SKILLS_STATE_DIR`, then `$XDG_STATE_HOME`, then `~/.0th/skills/...`.

Use checkout-local `${VERIFICATION_REPORT_DIR:-verification-report}` for gate-consumed evidence.
This is an explicit exception: `/build`, `/ship`, and `ship-gate` read verifier briefs, structured
reports, product acceptance, and counterpart-review evidence from `verification-report`.

## Lifecycle Choices

Use lifecycle, not age:

- **current**: keep in repo docs when the file describes live behavior, active constraints, or a
  still-valid decision.
- **compact**: extract the durable lesson into Memory v2, then discard or archive the working file.
- **supersede**: record the replacement and source pointer when a newer decision or feature
  replaces the old one.
- **delete**: remove pure scaffolding once it has no current value and no uncaptured lesson.

Before deleting repo docs that Memory v2 cites, leave a durable tombstone, evidence record, source
pack, or replacement source pointer so memory does not point at vanished proof.

aligned `/think` decision records keep their current contract: after alignment, write the decision
record to `docs/decisions/`. This reference only adds a draft lane before alignment and a lifecycle
review after a repo doc stops describing current reality.
