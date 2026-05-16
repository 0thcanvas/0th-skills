---
name: deep-research
description: "Use when hard questions need deeper research."
---

# Deep Research

Read the [shared workflow](../../skills/deep-research/SKILL.md) before acting. It is the source of truth; this Codex wrapper omits Claude-only `argument-hint`.

Codex dispatch note: phases 1, 2, 5, and 6 dispatch subagents. If named `0th_*` agents are not `agent_type` choices, use `spawn_agent` fallback roles from the shared workflow with `model: gpt-5.4` and explicit `reasoning_effort` pins.

Do not continue in the main thread solely because a named agent is unavailable; main-thread execution is only for when `spawn_agent` fails.
