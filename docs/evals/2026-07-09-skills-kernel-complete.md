# Skills Kernel Complete Migration Verification

**Date:** 2026-07-09
**Branch:** `feat/skills-kernel-pilot`
**Scope:** all ten workflow skills, shared kernel, Codex wrappers, capability routing, and ship review evidence

## Implemented

All ten shared skills now apply `references/skills-kernel.md` once per root task. The kernel owns
preflight, TaskSpec authority, single-root default execution, live capability gating, secret safety,
context handoff, blocked outcomes, Memory v2, and open-loop closeout.

The skill bodies retain only domain contracts:

- `think`: read/design-only decision capture and vocabulary discipline;
- `plan`: vertical slices, proof needs, and visual invariants;
- `build`: proof-gated TDD, specialist receipts, and product acceptance;
- `debug`: feedback loop and proven root cause before fixes;
- `research`: source routing, primary validation, and session-backed receipts;
- `deep-research`: adaptive file-backed world model and experiments;
- `ship`: evidence gate, PR creation, and PR-specific merge approval;
- `retro`: extract, redact, classify, aggregate;
- `improve-architecture`: evidence-backed deepening candidates without refactoring;
- `zoom-out`: explicit read-only system mapping.

Shared skill bodies contain no fixed host name, model name, reasoning effort, permanent worker role,
or mandatory fleet instruction. Deep-research phase guidance uses bounded packet types instead of
host-specific agent names. Counterpart review is risk-triggered; the ship gate accepts an explicit
`NOT_REQUIRED` evidence-advantage decision but rejects an unclassified skip.

## Size

| Measure | Before broad migration | Complete kernel |
|---|---:|---:|
| Ten shared skill bodies | 1,585 lines / 12,844 words | 750 lines / 4,546 words |
| Shared kernel | none | 103 lines / 681 words |
| Total hot workflow text | 1,585 lines / 12,844 words | 853 lines / 5,227 words |
| Shared bodies containing fixed host/model/role policy | 5 | 0 |

The complete hot workflow is 46.2% smaller by lines and 59.3% smaller by words while moving shared
policy to one tested contract.

## Verification

- Full repository suite: 386 passed, 0 failed.
- Wrapper drift check: all 10 Codex wrappers in sync.
- Formal skill validation: all 10 Codex ingestion entrypoints passed.
- Repository install smoke: passed for version 0.3.2.
- Public capability CLI: exited 0 and conservatively returned `single-root` with
  `disproportionate_inherited_effort` for the observed high-effort runtime.
- Proof tier: T1, using the public CLI plus packaging and full regression proof.

The generic plugin-creator validator cannot model this existing dual-host package: it requires the
manifest skill path to resolve literally to `skills/` and then rejects the Claude-only
`argument-hint`/explicit-invocation metadata there. The actual Codex manifest intentionally points
to `codex-skills/`; those ten entrypoints pass the formal skill validator and the repository smoke
check. This limitation existed before the migration and does not indicate an ingestion failure.

## Remaining boundary

Implementation is complete in the feature worktree. Fresh-session behavioral ablations across the
eight-task corpus are still open, so this report does not claim measured quality, latency, token, or
review-yield improvement.

The installed marketplace source is a symlink to the dirty primary checkout, not this clean feature
worktree. It was not reinstalled because doing so would install the stale primary checkout or require
overwriting unrelated user changes. Refresh the cachebuster and reinstall after this branch is landed
or the marketplace source is deliberately repointed.
