# Plan Review Build Gate Plan
**Decision:** `docs/decisions/2026-07-16-plan-review-build-gate.md`
**Slices:** 3
**Review status:** review-blocked

## Plan Review
- Reviewer: configured independent counterpart (`agy`)
- Result: unavailable — quota exhausted on 2026-07-16
- Blocker: no completeness review was produced, so this plan is not build-ready.
- Next action: rerun the independent review when quota resets, or use a user-approved alternate
  independent reviewer; incorporate all blockers before changing the workflow.

## Architecture
- Substantive work means more than one meaningful slice, cross-system changes, external/live
  effects, destructive changes, multi-session work, or material product/architecture risk.
- `/plan` owns a completeness review packet containing the original request, governing decision,
  relevant constraints, non-goals, dependencies, and the proposed plan.
- An independent counterpart reviews for omitted requirements, edge cases, dependencies, failure
  modes, proof, rollout/rollback, cost/authorization, and scope conflicts.
- Review blockers must be incorporated or explicitly resolved in the plan. The plan records the
  review result and becomes `build-ready`; review failure leaves it `review-blocked`.
- `/build` accepts substantive work only from a build-ready plan. One-loop bounded work remains a
  direct-build exception.

## Slices
### 1. Correct top-level routing
- [ ] Remove language that makes `/plan` optional and `/build` universally default.
- [ ] Route substantive implementation through `/plan → review → /build`.
- [ ] Proof: routing contract test covers substantive and bounded paths.

### 2. Make plan review an omission gate
- [ ] `/plan` always constructs the completeness packet and runs independent review.
- [ ] Review output identifies blockers and omissions against the request and governing evidence.
- [ ] The revised plan records review status and blocker resolution before handoff.
- [ ] Proof: metadata and workflow tests assert the review contract.

### 3. Enforce the build boundary and activate it
- [ ] `/build` rejects substantive work without a build-ready reviewed plan.
- [ ] Codex wrapper metadata exposes the substantive-plan trigger during initial routing.
- [ ] Regenerate wrappers, run focused/full workflow tests, package, smoke-test, and reinstall.
- [ ] Proof: source/cache parity and installed-plugin smoke check pass.
