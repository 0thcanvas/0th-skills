# Product Acceptance Loop

**Date:** 2026-05-10
**Status:** partially superseded by [Evidence-Seeking Review](2026-07-26-evidence-seeking-review.md)
**Durable:** yes

## Decision
Keep product acceptance in `/build` as an evidence check against the decision record, explicit user
brief, executable behavior, and applicable product standards. Another model or agent may contribute
evidence, but its review is optional and advisory.

## Constraints
- `/ship` stays lightweight: final tests, safety checks, evidence freshness, docs sync, PR hygiene, and merge approval.
- Subjective product judgment follows this hierarchy: decision record, plan acceptance criteria, explicit user brief, then repo standards. Reviewers enforce that agreed standard rather than inventing taste late.
- UI and learning features treat copy, instruction timing, pedagogy, and target-user fit as product behavior, not decoration.
- Build writes `verification-report/product-acceptance.json` so `/ship` can check evidence presence, freshness, and outcome without doing product judgment.
- Stop when the acceptance evidence is sufficient or a concrete blocker is recorded. There is no
  fixed model-review round count.

## Not Doing
- No broad feature growth during acceptance review; new ideas become follow-up decisions or plans.
- No mandatory counterpart diff review or skip artifact in `/build` or `/ship`.
- No claim that unit tests can validate experience, pedagogy, or human-sounding copy.

## Superseded Mechanics
The former fixed three-round loop and mandatory counterpart-review evidence were removed on
2026-07-26. See `docs/decisions/2026-07-26-evidence-seeking-review.md`.

## Depends On
- `docs/decisions/2026-05-04-self-testing-failure-dossiers.md`
