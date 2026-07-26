# Evidence-Adaptive Workflow
**Date:** 2026-07-26
**Status:** release candidate — merge and installed-runtime refresh pending

## Decision
The agent selects the least coordination artifact justified by task evidence: direct execution for
one bounded loop, an adaptive checkpoint when evidence changes the next action, and a formal plan
only when prospective slices materially reduce coordination risk. The agent does not ask the user
whether to plan.

External/live and irreversible effects require authority and a bounded effect contract, but do not
automatically require a formal plan. A request for a plan means the plan is the deliverable; it does
not make approval of internal planning mechanics a prerequisite for authorized implementation.
File count and multiple implementation approaches alone do not trigger planning.

Clarify intent only when multiple plausible outcome-level readings materially change acceptance,
authority, or irreversible effects. Transfer structured `ResultPacket` fields across context or
agent boundaries. Keep capability probes, model routing, launch controls, and receipts adapter-owned.

## Evidence and limits
The 2026-07-26 pilot produced 18/18 coding PASS results; direct was cheapest in every task. The
precommitted conservative rule selected adaptive checkpoints for ordered/debug work. Structured
handoff passed 2/2 while prose summary lost all required identifiers 2/2. Four-receipt orchestration
passed. Codex portability passed; Claude Code was blocked by `oauth_org_not_allowed`, so
cross-harness transport remains unproved. The user authorized the smallest production change on
2026-07-26 with these limits explicit; expand the task corpus before claiming universal superiority.
