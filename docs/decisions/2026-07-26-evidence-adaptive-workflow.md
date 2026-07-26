# Evidence-Adaptive Workflow
**Date:** 2026-07-26
**Status:** pilot — smallest slice active; production default not authorized

## Decision
Use the least coordination artifact justified by task evidence: direct execution for one bounded
loop, an adaptive checkpoint for ordered/debug work whose next action changes with evidence, and a
formal plan for multi-session, irreversible, external/live, or explicitly requested coordination.
File count and multiple implementation approaches alone do not trigger planning.

Clarify intent only when multiple plausible outcome-level readings materially change acceptance,
authority, or irreversible effects. Transfer structured `ResultPacket` fields across context or
agent boundaries. Keep capability probes, model routing, launch controls, and receipts adapter-owned.

## Evidence and limits
The 2026-07-26 pilot produced 18/18 coding PASS results; direct was cheapest in every task. The
precommitted conservative rule selected adaptive checkpoints for ordered/debug work. Structured
handoff passed 2/2 while prose summary lost all required identifiers 2/2. Four-receipt orchestration
passed. Codex portability passed; Claude Code was blocked by `oauth_org_not_allowed`, so
cross-harness transport remains unproved. Expand the task corpus before changing the production
default.
