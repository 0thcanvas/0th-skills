# Skills Kernel Baseline

**Captured:** 2026-07-09
**Revision:** `4405e37`
**Host:** Codex

## Repository baseline

- `node --test tests/*.test.mjs`: 368 passed, 0 failed.
- `skills/build/SKILL.md`: 415 lines, 3,210 words.
- Build skill SHA-256: `7f1f0a4fb82b1b7ac5d5d48e764198f8a01eea29606f818c035385e73d993743`.
- Build skill contains 16 references to explicit role dispatch, reviewer/verifier orchestration, counterpart review, or human checkpoints.
- `.codex/config.toml`: `max_threads = 4`, `max_depth = 1`.
- Codex role registry: GPT-5.4/GPT-5.4-mini pins with fixed medium/high effort profiles.

## Current runtime observation

- Root model: `gpt-5.6-sol`.
- Root reasoning effort: `xhigh`.
- Child model override exposed by the current delegation interface: no.
- Child effort override exposed by the current delegation interface: no.
- Maximum concurrent slots exposed to this task: 4 including the root.
- Project-configured nesting depth: 1.
- Shared worktree between delegated agents: yes; no automatic workspace isolation.
- Existing-agent resume/follow-up: available.

The model and effort values were extracted as fields only from current session metadata; no prompt, credential, or arbitrary session payload was copied.

## Baseline consequence

Routine delegation can silently multiply GPT-5.6 `xhigh` cost while providing no model diversity. Until a live capability record proves proportionate child controls, the correct default is one root agent. The tagged eight-task corpus lives at `tests/fixtures/skills-kernel/tasks.json`; Slice 3 will replay representative tasks against migrated behavior.
