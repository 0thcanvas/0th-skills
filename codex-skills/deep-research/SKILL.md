---
name: deep-research
description: "Use when hard questions need deeper research."
---

# Deep Research

Read the [shared workflow](../../skills/deep-research/SKILL.md) before acting. It is the source of truth; this Codex wrapper omits Claude-only `argument-hint`.

Codex dispatch note: phases 1, 2, 5, and 6 dispatch subagents via `spawn_agent`. If a named `0th_*` agent is not an `agent_type`, follow `../../references/codex-dispatch-fallback.md` instead of continuing in the main thread.
