<!--
This is the single source of truth for the five-section memory + open-loop
preamble that every core SKILL.md embeds verbatim (Repo Preflight, Memory
Brief, Open Loop Brief, Memory Integration, Open Loop Integration).

The PR #19 cross-review flagged the duplication: nine SKILL.md files carry
the same ~1.5 KB block, with no test enforcing identity. If the block in
one skill diverges, agents on that skill read a contradictory instruction
and there is no failure signal.

`tests/skill-metadata.test.mjs` now reads this file, extracts the canonical
block, and asserts every core SKILL.md contains it byte-for-byte. To update
the block, edit it here; the test will fail until every SKILL.md is updated
to match. Use `node scripts/skill-block-sync.mjs --check` (or `--write`) to
audit / propagate changes.
-->

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" preflight`. It fetches upstream, reconciles previously unseen HEAD drift, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" brief` and read the `output_file` path from its JSON result; the script resolves Memory v2 user-level runtime state outside the product repo. Read the generated brief before browsing indexes or raw notes manually.

## Open Loop Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" task-brief` and read the `output_file` path from its JSON result after the memory brief; use it to resume unfinished work before starting new scope.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Classify new knowledge as `decision`, `observation`, `root_cause`, `vocabulary`, `incident`, `repo_state`, `external_research`, or `nothing durable`. For durable outcomes, write through `memory remember`; do not hand-edit runtime `claims.jsonl`.

## Open Loop Integration

When work remains unfinished, blocked, or intentionally dropped, update open loops through `memory open-loop`; do not store TODOs as memory claims. Use `add` for new unfinished work, `block` for waiting states, `close` when completed, `drop` when no longer worth doing, and `reopen` when deferred work becomes active again.
