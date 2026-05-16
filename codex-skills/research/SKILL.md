---
name: research
description: "Use when answers need external sources."
---

# Research

Read the [shared workflow](../../skills/research/SKILL.md) before acting. It is the source of truth; this Codex wrapper omits Claude-only `argument-hint`.

Codex dispatch note: use `spawn_agent` for research subquestions. If `0th_researcher` is not an `agent_type`, use `agent_type: default`, `model: gpt-5.4`, and `reasoning_effort: medium` with a self-contained `0th_researcher fallback` prompt.

Do not continue in the main thread solely because the named agent is unavailable; main-thread search is only for when `spawn_agent` fails.
