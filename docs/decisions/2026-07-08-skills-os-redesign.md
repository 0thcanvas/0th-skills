# 0th Skills Kernel Redesign
**Date:** 2026-07-08
**Status:** proposed — pending representative GPT-5.6 evaluation
**Durable:** no — activate only after the evaluation gate passes

## Decision
Redesign 0th skills as four layers: an Agent Skills-compatible portable contract, a machine-readable host capability adapter, a deterministic workflow controller, and an evaluation-driven routing policy. Frontier models choose ordinary execution paths; executable controls own authority, evidence, state, retries, and completion.

Default to one root agent at proportionate effort. Delegate only when work is independent, the worker has a useful evidence or isolation advantage, the host proves the requested model/effort/topology is available, and measured value justifies cost. If a child would inherit a disproportionate configuration, do not spawn it.

Migrate evaluation-first: record representative baselines, change one policy at a time, and replay identical cases. After contract lock, execute local in-scope work autonomously, but stop for missing authority or secrets, `BLOCKED_BY_SPEC`, `CONTRACT_INVALIDATED`, `SCOPE_EXPANSION_REQUIRED`, T4 approval, `BLOCKED_REAL_ENV`, or exhausted recovery. External writes require explicit TaskSpec or repo-workflow authority; merge remains human-default.

Descriptions state both what a skill does and when to use it. Keep E2E proof tiers, stack minimums, secrets, Memory v2 locking and evidence ownership, ship gates, isolated mutation ownership, and honest blocked outcomes. Remove repeated generic scaffolding and fixed model/topology/reviewer policy only when ablations preserve behavior.

## Not Doing
No fleet, same-model, fresh-reviewer, cross-model-review, lexical no-op-ban, automatic durable retro, or big-bang rewrite default. Memory hygiene and optional factory mode are separate follow-ons.

## Evidence
Implementation plan: `docs/plans/2026-07-08-skills-os-redesign.md`. External basis: https://agentskills.io/specification, https://developers.openai.com/api/docs/guides/prompt-guidance-gpt-5p6, https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5, and https://arxiv.org/abs/2512.08296.
