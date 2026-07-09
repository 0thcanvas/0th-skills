# Skills Kernel

This contract applies to every 0th workflow. Skill files define domain behavior; this file owns
startup, authority, execution topology, safety, context transfer, and closeout.

## Root-task preflight

Run this once per root task, before domain work:

1. Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" preflight`.
2. Generate and read the global memory brief, then the project memory brief.
3. Generate and read the open-loop brief.
4. Read only the decision, plan, `CONTEXT.md`, files, and evidence those briefs or the task point to.

Record a compact receipt with repo root, branch, HEAD, dirty state, brief paths, relevant open loops,
and `observed_at`. The receipt stays fresh while the root task, repo identity, HEAD, and material
working-tree state are unchanged. Nested phases reuse it; they do not repeat startup. Refresh it
after a branch/HEAD change, external mutation, resume into a new root task, or evidence that makes the
receipt stale.

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

**Default: one root agent.** The root reads, acts, verifies, and synthesizes.

Delegation is optional and requires all of:

1. independent or isolated work;
2. a concrete evidence advantage, context-isolation advantage, or measured latency advantage;
3. a bounded capability packet with task, inputs, output schema, authority, budget, and stop rules;
4. a live, fresh capability record showing the requested controls actually exist;
5. no unsafe shared mutable state.

Evaluate the packet through:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/0th.mjs" capabilities \
  --harness <runtime-harness> \
  --runtime-json <observed-capabilities.json> \
  --packet-json <capability-packet.json>
```

Delegate only when it returns `allowed: true`. Documentation, requested profile names, or assumed
model/effort settings are not runtime evidence. Ordered work, stale observations, missing isolation,
unsupported overrides, or disproportionate inherited effort stay single-root. Do not create a
reviewer, verifier, researcher, or fleet merely because a workflow phase has that name.

## Safety and evidence

Never place resolved secret values in prompts, chat, command arguments, logs, diffs, or artifacts.
Use the project’s safe runtime injection path and verify presence without printing values. Never dump
environments, cookies, authorization headers, session storage, HAR bodies, or private browser payloads.
If exposure may have occurred, identify the category without repeating the value and recommend rotation.

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

Return an exit status, evidence paths, unresolved concerns, and any required next action. Apply
`retro_open_loop_closeout`: skipped verification, blocked real environments, repeated failures, and
unfinished work remain visible.

Run the Memory Write Gate from `memory-contract.md`. Durable claims go through `memory remember`;
do not hand-edit runtime `claims.jsonl`. “nothing durable” is valid. Track unfinished work through
`memory open-loop`, not as a memory claim.

Gate-consumed evidence belongs under `${VERIFICATION_REPORT_DIR:-verification-report}` and remains
uncommitted. Promote only compact durable conclusions. Delete raw local evidence after merge, close,
abandonment, or worktree removal; sensitive browser/session material is summarized safely and deleted
as soon as it is no longer required.

## Shared references

- `memory-contract.md`
- `workflow-verification.md`
- `specialist-routing.md`
- `working-artifacts.md`
- `proof-tiers.md`
- `stack-minimums.md`
