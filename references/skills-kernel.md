# Skills Kernel

Skill files define domain behavior; this Kernel owns shared startup, authority, execution topology,
safety, context transfer, and closeout.

## Root-task preflight

Run once per root task: infer 3–8 keywords and run
`node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" startup --query "<keywords>"`.
Use its compact repo state, relevant claims and open loops, and pointers. Expand only an id or source
that affects the task; read decision, plan, `CONTEXT.md`, or repo evidence only when pointed there.

Do not generate or read the full global, project, or open-loop briefs by default. Use targeted
`memory recall` when the packet exposes a gap; use full briefs only for explicit broad-state audits.

Cache repo root, branch, HEAD, dirty state, packet paths, relevant loops, and `observed_at`. Nested
phases reuse the receipt while task, repo, HEAD, and material tree state are unchanged. Refresh after
HEAD/external mutation, a new root task, or evidence that makes it stale.

## TaskSpec and authority

Write or infer a bounded TaskSpec: outcome, acceptance, non-goals, proof need, risk, and authority.

- Inspection, explanation, review, diagnosis, and planning authorize reads, not implementation.
- Build/fix requests authorize in-scope local edits and non-destructive checks.
- External writes, destructive actions, publishing, pushing, PR creation, messages, payments, and
  other side effects require explicit user or repo-workflow authority.
- Merge approval is specific to the current PR; never inherit it from a general “ship” instruction.

Stop with `BLOCKED_BY_SPEC` when the requested outcome cannot be judged. New evidence that breaks an
accepted premise returns `CONTRACT_INVALIDATED`. Work outside the bounded outcome returns
`SCOPE_EXPANSION_REQUIRED`. Missing required runtime proof returns `BLOCKED_REAL_ENV`; do not lower
the proof tier to manufacture completion.

## Execution topology

**Default: one root agent.** Consider delegation only when the user requests it or independent work
has a named evidence advantage. Before delegating, read `references/delegation.md` and require its
capability gate to return `allowed: true`; otherwise remain single-root.

## Safety and evidence

Apply `secret-control-policy.md`. Use an existing valid local environment before contacting its
secret manager, run the consuming application instead of reading secret files, and verify presence
without printing values. Never place resolved secret values in prompts, chat, argv, logs, diffs,
commits, or evidence. Never dump environments, cookies, authorization headers, session storage, HAR
bodies, or private browser payloads. If exposure may have occurred, identify the category without
repeating the value and recommend rotation.

Claims follow the strongest available evidence. Tests prove test seams; visual claims need visual
evidence; session-backed claims need session-backed evidence; live or destructive proof needs explicit
approval. Specialist output is input to 0th verification, not proof by itself. Preserve exact blocked
states and source limitations.

## Context handoff

When a task spans phases or large evidence, use `context_handoff` from `workflow-verification.md`:
carry a bounded summary, source pointers, unresolved gaps, and next read targets. Keep raw source
material, logs, screenshots, and experiments in their owning files instead of accumulating them in
the root context.

## Closeout

Return exit status, evidence paths, concerns, and next action. Apply `retro_open_loop_closeout` so
skipped verification, blocked real environments, repeated failures, and unfinished work stay visible.

Use the executable Memory Write Gate:
`node "${OTH_SKILLS_ROOT}/scripts/memory.mjs" write-gate <event flags>`. Read `memory-contract.md` only
when it cannot classify the event. Durable claims use `memory remember`, never hand-edited `claims.jsonl`;
“nothing durable” is valid. Unfinished work uses `memory open-loop`.

Keep gate evidence uncommitted under `${VERIFICATION_REPORT_DIR:-verification-report}`. Promote only
compact conclusions. After merge, close, abandonment, or worktree removal, delete raw evidence;
summarize and delete sensitive browser/session material as soon as it is unnecessary.

## Shared references

On-demand index, not a startup reading list. Load only when its triggering condition applies.

- `model-routing.md`
- `memory-contract.md`
- `workflow-verification.md`
- `specialist-routing.md`
- `working-artifacts.md`
- `proof-tiers.md`
- `stack-minimums.md`
