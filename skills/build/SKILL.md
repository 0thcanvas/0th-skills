---
name: build
description: "Implements approved changes with proof-gated TDD. Use when building or fixing a known solution."
argument-hint: "[instruction or plan path]"
---

# Build

Apply `../../references/skills-kernel.md` once. This file owns only build-specific behavior.

## Route

- Enter for a requested implementation, approved decision, or build-ready plan.
- Switch to `/think` for unresolved design and `/debug` for an unexpected failure.
- External/live work requires an approved `/plan` acquisition/operations contract before
  code/calls; else `CONTRACT_INVALIDATED`.
- `$ARGUMENTS` is the instruction or plan path when invoked directly.
- **Default: one root agent.** Only when delegation has a concrete advantage, read
  `../../references/delegation.md`; otherwise do not load its mechanics.

## Contract and Lightweight Build Lane

Infer a compact TaskSpec from the Kernel. New evidence that breaks it is `CONTRACT_INVALIDATED`;
work outside it is `SCOPE_EXPANSION_REQUIRED`.

Select the proof tier from `../../references/proof-tiers.md`. Under `proof_contract_required`,
ship-bound implementation work requires `verification-report/proof-contract.json` with
`minimum_proof_tier`; docs-only or metadata-only changes still use a `T0` contract when ship-bound.

Use the lightweight build lane only for bounded non-ship T0/T1 work needing no UI, live/session
proof, specialist, delegation, or subjective acceptance. Infer the TaskSpec, run focused tests and
the relevant nearby suite, do not create `verification-report` artifacts, follow repository branch
and commit policy, and report proof directly. Do not load `stack-minimums.md` in this lane. Promote
when any condition stops being true.

## No-code Operational Lane

Use only to build, sign, install, launch, restart, or verify an existing revision without a source
or configuration edit. Confirm the exact revision, expected worktree state, target identity,
signing/runtime prerequisites, and project runbook.

Do not create a feature branch, TDD test, PR, or `verification-report` merely to perform the
operation. Use the project runbook and owning tool or specialist, preserve user data, and capture
build, signing, install, launch, and health evidence. Live or device actions still require
effect-appropriate authority and real-environment proof.

If a source or configuration edit becomes necessary, stop the operational lane and enter normal
`/build` or `/debug` on a branch as appropriate.

## Slice loop

For testable work: RED failing behavior test → GREEN smallest implementation → REFACTOR touched code
only → VERIFY focused and nearby suites. For non-testable work, capture comparable before/after
evidence. Follow `references/slice-checklist.md`; do not make unrelated cleanup.

For a managed verification command, use:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/failure-dossier-runner.mjs" \
  --run-id <unique-run-id> -- <test command>
```

Use a fresh `--run-id`. An unexpected failure routes to `/debug`; three failed attempts stop with
`FAIL_UNRESOLVED`.

## Boundaries

- Apply `../../references/secret-control-policy.md`; run the consuming application and never inspect
  or print secret files.
- When a plugin or specialist owns work, read `../../references/specialist-routing.md`, create its
  specialist handoff envelope, and require a specialist return receipt. Specialist work does not satisfy proof by itself.
- If delegation becomes justified, follow `../../references/delegation.md`; do not duplicate its
  capability or dispatch procedure here.

## Verification

For full-lane work, read `../../references/stack-minimums.md`, detect every applicable stack, and
exercise each minimum. Tests alone cannot satisfy T2+. Persist `verification-report/brief.txt` and
`proof-result.json`; only `outcome: PASS` with `minimum_tier_satisfied: true` proceeds. Missing required
runtime evidence is `BLOCKED_REAL_ENV`, never a lower proof tier.

For UI, canvas, SVG, animation, overlay, or responsive work: Name the visual invariant.
If the claim is visual, the evidence must be visual: use a DOM/e2e test for behavior, screenshot inspection for fit,
and a pixel assertion or screenshot assertion for coordinate-sensitive rendering.

## Product Acceptance Loop

For full-lane user-facing work, read `references/product-acceptance.md` and produce
`verification-report/product-acceptance.json`. Mechanical/internal work records `NOT_REQUIRED` with
a concrete rationale. Review is risk-triggered, not automatic.
Use `ask-counterpart-review` only when another context has a named evidence advantage.

## Closeout

Report status, tests, proof tier, evidence, acceptance, and concerns. Apply `retro_open_loop_closeout`
from `../../references/workflow-verification.md`: skipped verification, blocked environments,
repeated failures, and unfinished work remain visible. Apply the Kernel's command-first Memory Write
Gate; read `../../references/memory-contract.md` only if the executable gate cannot classify the event.
Use `memory remember` for durable claims and `memory open-loop` for unfinished work. Gate evidence
stays uncommitted and follows `../../references/working-artifacts.md`.
