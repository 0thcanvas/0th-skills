<!--
This is the legacy source for the memory + open-loop preamble that core skills embedded before the
Skills Kernel migration. It remains only as migration evidence; active workflows use
`references/skills-kernel.md`.

The PR #19 cross-review flagged the duplication: nine SKILL.md files carry
the same ~1.5 KB block, with no test enforcing identity. If the block in
one skill diverges, agents on that skill read a contradictory instruction
and there is no failure signal.

`scripts/skill-block-sync.mjs` now verifies that migrated skills link to the Kernel instead of
propagating this block.
-->

## Legacy startup replacement

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" startup --query "<task keywords>"` once. It combines compact preflight state with bounded relevant claims and open loops. Expand returned ids on demand; do not read full generated briefs by default.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Use `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" write-gate` when the scope is ambiguous so the event is classified as project, global, both, or nothing durable. For direct durable claims, write through `memory remember` (shorthand for the full `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" remember` command shown above); do not hand-edit runtime `claims.jsonl`.

## Open Loop Integration

When work remains unfinished, blocked, or intentionally dropped, update open loops through `memory open-loop` (shorthand for the full `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" open-loop` command); do not store TODOs as memory claims. Use `add` for new unfinished work, `block` for waiting states, `close` when completed, `drop` when no longer worth doing, and `reopen` when deferred work becomes active again.
