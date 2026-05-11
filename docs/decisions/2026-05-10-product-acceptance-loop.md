# Product Acceptance Loop

**Date:** 2026-05-10
**Status:** active
**Durable:** yes

## Decision
Move substantive feature-quality review into `/build` by adding a Product Acceptance Loop before handoff to `/ship`. The loop judges the built feature against the decision record, plan, explicit user brief, repo standards, target user, and agreed product/content standards; the agent fixes all clear in-scope issues before asking the human to review.

## Constraints
- `/ship` stays lightweight: final tests, safety checks, evidence freshness, docs sync, PR hygiene, and merge approval.
- Subjective product judgment follows this hierarchy: decision record, plan acceptance criteria, explicit user brief, then repo standards. Reviewers enforce that agreed standard rather than inventing taste late.
- UI and learning features treat copy, instruction timing, pedagogy, and target-user fit as product behavior, not decoration.
- The loop must stop expansion: blockers and in-scope polish are fixed for at most three rounds; larger product ideas are recorded as out of scope.
- Build writes `verification-report/product-acceptance.json` so `/ship` can check evidence presence, freshness, and outcome without doing product judgment.

## Not Doing
- No broad feature growth during acceptance review; new ideas become follow-up decisions or plans.
- No first-time counterpart diff review in `/ship`; build must produce or explicitly skip that evidence before shipping.
- No claim that unit tests can validate experience, pedagogy, or human-sounding copy.

## Depends On
- `docs/decisions/2026-05-04-self-testing-failure-dossiers.md`
