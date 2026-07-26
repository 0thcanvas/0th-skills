# Skills Kernel

Skills own domain behavior; this Kernel owns startup, authority, topology, safety, handoff, and closeout.

## Root-task preflight

Set `OTH_SKILLS_ROOT` to two directories above the active shared `SKILL.md`.

Resolve the optional runtime profile once per root task. With `workflow_store: 0th-state` (the
default without a profile), infer 3–8 keywords and run:
`node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" startup --query "<keywords>"`.
Use its compact claims, open loops, and repo state. With `host-native`, use the host's current-state
packet. With `none`, run live repo preflight and continue without Memory. Cache the receipt until
mutation, a new task, or staleness. Reuse the receipt. Expand history/source packs on demand; full
briefs only for broad audits.

## TaskSpec and authority

Infer a bounded TaskSpec: outcome, acceptance, non-goals, proof, risk, and authority. Ask one focused
question only when evidence leaves multiple plausible outcome-level intentions that materially change
acceptance, authority, or irreversible effects. Multiple implementation paths are not ambiguity.

Technical choices are agent-owned unless they change outcomes, cost/risk, lasting constraints, or
authority. Never ask whether to plan; choose the smallest artifact.

- Inspection, explanation, review, diagnosis, and planning authorize reads, not implementation.
- Build/fix requests authorize in-scope local edits and non-destructive checks.
- External writes, destructive actions, publishing, pushing, PR creation, messages, payments, and
  other side effects require explicit user or repo-workflow authority.
- Merge approval is specific to the current PR; never inherit it from a general “ship” instruction.

Use `BLOCKED_BY_SPEC` for an unjudgeable outcome, `CONTRACT_INVALIDATED` for a broken premise,
`SCOPE_EXPANSION_REQUIRED` outside scope, and `BLOCKED_REAL_ENV` for missing runtime proof.

## Execution topology

**Default: one root agent.** Delegate only on request or for a named evidence advantage. First read
`references/delegation.md` and require `allowed: true`; otherwise remain single-root.

## Safety and evidence

Apply `secret-control-policy.md`. Prefer an existing project environment; run the consumer and never
read secret files; resolved secret values never enter prompts, chat, argv, logs, diffs, commits, or
evidence. Never dump environments, cookies, auth headers, storage, HARs, or private browser payloads.

Claims follow the strongest evidence. Tests prove test seams; visual and session-backed claims need
matching evidence; live/destructive proof needs approval. Specialist output is input, not proof.

## Context handoff

For large evidence or phase changes, use `context_handoff` and the `ResultPacket` from
`workflow-verification.md` and `execution-policy.md`. Keep raw evidence in owning files.

## Closeout

Return status, evidence, concerns, and next action. Apply `retro_open_loop_closeout`.

With `0th-state`, use the executable Memory Write Gate:
`node "${OTH_SKILLS_ROOT}/scripts/memory.mjs" write-gate <event flags>`. Read `memory-contract.md` only
when the gate cannot classify. Durable claims use `memory remember`, never hand-edited `claims.jsonl`.
Otherwise “nothing durable.” Unfinished work uses `memory open-loop`.
With `host-native`, return bounded facts to the host. With `none`, keep unfinished work in the
ResultPacket and final response.

Keep gate evidence uncommitted under `${VERIFICATION_REPORT_DIR:-verification-report}`. After merge,
close, abandonment, or worktree removal, delete it; summarize/delete sensitive session material early.

## Shared references

On-demand index, not a startup reading list. Load only when its triggering condition applies.

- `model-routing.md`
- `execution-policy.md`
- `memory-contract.md`
- `workflow-verification.md`
- `specialist-routing.md`
- `working-artifacts.md`
- `proof-tiers.md`
- `stack-minimums.md`
