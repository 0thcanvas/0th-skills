# Plan Review Build Gate

**Date:** 2026-07-16
**Status:** active

## Decision
Substantive implementation follows `/plan → independent plan-completeness review → /build`.
The review compares the original request, decisions, constraints, and proposed slices to find
omissions before implementation; `/build` starts only after blockers are resolved in the plan.

## Constraints
- One bounded implementation loop may still enter `/build` directly.
- Review failure is visible and blocks substantive build work; it is never silently treated as approval.
- The review checks coverage, not implementation style or speculative scope expansion.

## Not Doing
- Requiring a formal plan for trivial edits where planning costs more than the change.
- Treating post-build code review as a substitute for pre-build plan review.

## Depends On
- `docs/decisions/2026-07-09-evidence-backed-skill-surface.md`
