# Verification Authority

**Date:** 2026-07-10
**Status:** active
**Durable:** yes

## Context
The local ship gate validates evidence written by the same agent, while this repository has no CI workflow or protected required check. A clean checkout also exposes tests that assume an ignored local directory already exists.

## Decision
Fresh-checkout CI is the authority for objective T0/T1 test and installation claims. The local ship gate remains a fast guardrail for safety, proof-tier mismatch, blocked real environments, current-commit binding, and evidence-path existence; it is not independent proof that commands ran.

`/ship` must wait for PR checks before reporting ready-to-merge. T2+ proof remains environment-specific and cannot be replaced by CI alone.

## Rejected
- Keep self-authored JSON as proof: easy to satisfy without executing the claimed command.
- Remove the gate entirely: loses useful local safety and real-environment downgrade checks.
- Change `codex-skills/` to satisfy the generic validator: breaks the intentional compact wrapper layout.

## Consequences
Add a fresh-checkout GitHub Actions workflow, make tests self-contained, harden proof receipts, and use the repository smoke check as the manifest authority for this plugin layout. Branch protection is the final external enforcement step after the check exists.
