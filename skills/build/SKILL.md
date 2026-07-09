---
name: build
description: "Implements a known code change with proof-gated TDD. Use when the user asks to build, add, change, or fix a known solution."
argument-hint: "[instruction or plan path]"
---

# Build

Apply the root workflow in `../../references/skills-kernel.md` once, then use the build-specific
rules below.

## Goal

Deliver the requested change on a feature branch with the smallest sufficient workflow and honest proof.

## Enter / Skip

- Enter for a direct implementation request, an approved decision, or a build-ready plan.
- Skip to `/think` when requirements or architecture are materially unresolved.
- Switch to `/debug` when an unexpected failure needs root cause before a fix.
- `$ARGUMENTS` is the instruction or plan path when invoked directly.

## Root-Task Preflight

Only the root task runs the full startup sequence. Nested phases and workers receive the current brief, ledger, and evidence paths.

1. Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" preflight`. It may fast-forward only a clean behind branch; dirty or divergent states remain untouched and visible.
2. Run `memory brief --scope global`, then the project `memory brief`; read each `output_file` before browsing indexes. If the global brief is missing or corrupt, warn and continue. Memory v2 runtime is the canonical agent recall path; legacy KB, Obsidian, and markdown are fallback evidence surfaces. Load source packs only on demand.
3. Run `memory task-brief` after the memory brief and read its `output_file`.
4. Read the decision, plan, `CONTEXT.md`, current branch, and relevant code/tests. Do not reread broad indexes when the briefs identify the target.

## Contract and Authority

Write or confirm a TaskSpec containing outcome, acceptance, non-goals, proof tier, risk, and authority. Inspection, review, diagnosis, and planning do not authorize implementation. Build and fix requests authorize in-scope local edits and non-destructive tests; external writes require TaskSpec or repo-workflow authority.

Valid stops include `BLOCKED_BY_SPEC`, `CONTRACT_INVALIDATED`, `SCOPE_EXPANSION_REQUIRED`, `BLOCKED_REAL_ENV`, T4 approval, and exhausted recovery. New evidence that falsifies the contract is not ordinary implementation friction.

Before implementation, apply `proof_contract_required`: ship-bound implementation work requires `verification-report/proof-contract.json`; docs-only or metadata-only changes still use a `T0` contract. Select `minimum_proof_tier` from `../../references/proof-tiers.md` by the seam where defects escape.

## Execution Policy

**Default: one root agent.** The root reads, edits, tests, and synthesizes unless bounded delegation demonstrates value.

Delegation requires:

1. an independent work packet with an evidence or isolation advantage;
2. no unsafe shared mutable state, or proven workspace isolation;
3. a bounded capability packet and worker/round budget;
4. a live capability record, not documentation alone;
5. proportionate model and effort controls.

Resolve the gate with:

```bash
node scripts/0th.mjs capabilities \
  --harness <host> \
  --runtime-json <observed-capabilities.json> \
  --packet-json <capability-packet.json>
```

Delegate only when the result is `allowed: true`. Missing, stale, unsupported, shared-state, ordered-work, or disproportionate inherited-effort results stay `single-root`. Do not substitute a requested profile name for the actual emitted model and effort.

## Per-Slice Loop

For testable work:

1. RED: write one failing behavior test through the public interface and run it.
2. GREEN: implement the smallest change and rerun the focused test.
3. REFACTOR: improve only touched code while staying green.
4. VERIFY: run nearby tests and inspect actual output.
5. COMMIT: create one atomic slice commit.

For non-testable work, capture before state, make one bounded change, capture after state in the same format, compare, then commit.

Use `skills/build/references/slice-checklist.md` for the compact loop. Do not make unrelated cleanup.

For managed verification failures, run:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/failure-dossier-runner.mjs" \
  --run-id <unique-run-id> -- <test command>
```

Use a fresh `--run-id` per run. An unexpected failure switches to `/debug`; three failed attempts on one slice stop with `FAIL_UNRESOLVED`.

## Secrets

Code reads secrets from environment variables or runtime bindings. Run secret-dependent commands through the project safe runner. Never print resolved values, use revealing secret-manager commands, disable masking, or enable shell tracing. If no safe runner exists, return `BLOCKED` and name the required configuration.

## Specialist Boundary

Read `../../references/specialist-routing.md` when a plugin or specialist owns part of the work. Create a specialist handoff envelope and require a specialist return receipt. Specialist work does not satisfy proof by itself; re-run the proof and product acceptance gates. Missing or incomplete adapter evidence cannot silently downgrade the selected tier.

Use a visual target or frontend builder capability only when rendered design evidence is required; receipts name screenshots, design QA, or browser QA. Use an iOS simulator capability when simulator evidence is required; compile/test proof does not claim simulator proof. Use a logged-in browser capability for private/session-backed surfaces; public search is not a substitute.

## Verification

Run the full relevant suite after slices pass. Read `../../references/stack-minimums.md`, detect every applicable row, and exercise each minimum behavior. Tests alone cannot satisfy T2+.

For UI, canvas, SVG, animation, overlay, or responsive work: Name the visual invariant before checking. If the claim is visual, the evidence must be visual. Use a DOM/e2e test for behavior, screenshot inspection for fit and layout, and a pixel assertion or screenshot assertion for coordinate-sensitive rendering.

When independent verification has a concrete evidence advantage, route one bounded verifier packet through the capability gate. Otherwise the root performs the required checks. Persist `verification-report/brief.txt` and `proof-result.json`; only `outcome: PASS` with `minimum_tier_satisfied: true` proceeds. Unavailable required runtime evidence is `BLOCKED_REAL_ENV`, never a lower tier.

## Product Acceptance Loop

Read `references/product-acceptance.md`. Required user-facing acceptance consumes proof, screenshots, or live-flow evidence and writes `verification-report/product-acceptance.json`. Mechanical/internal work records `NOT_REQUIRED` with a concrete rationale. Review and `ask-counterpart-review` are risk-triggered: use them only when another context or model has a named evidence advantage worth its cost.

## Completion

Report status, slices, tests, proof tier, evidence paths, product acceptance, optional reviewer yield, and concerns. Then apply `retro_open_loop_closeout` from `../../references/workflow-verification.md`: skipped verification, blocked real environments, repeated failures, and unfinished work must remain visible.

Run the Memory Write Gate from `../../references/memory-contract.md`. For durable claims use `memory remember`; do not hand-edit runtime `claims.jsonl`. “nothing durable” is valid. Track unfinished work with `memory open-loop`; do not store TODOs as memory claims.

Gate-consumed evidence stays under `${VERIFICATION_REPORT_DIR:-verification-report}` and is not committed. Follow `../../references/working-artifacts.md`; after merge, close, abandonment, or worktree removal, preserve a safe summary when needed and delete raw local evidence.

## References

- `references/slice-checklist.md`
- `references/verification-checklist.md`
- `references/product-acceptance.md`
- `../../references/proof-tiers.md`
- `../../references/stack-minimums.md`
- `../../references/real-env-recipes.md`
- `../../references/workflow-verification.md`
- `../../references/specialist-routing.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
