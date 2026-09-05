---
name: think
description: "Turns an uncertain idea into a short, explicit decision. Use when requirements, architecture, or tradeoffs are materially unresolved."
---

# Think

Turn uncertainty into a decision, not implementation. Apply `../../references/skills-kernel.md`
once for root-task preflight, authority, optional delegation, safety, and closeout.

## Enter / skip

- Enter for new features, competing approaches, or decisions that affect architecture.
- When the solution is already clear, return the decision directly. Continue to `/build` only if
  implementation is part of the authorized request.
- `$ARGUMENTS` is the idea or design question when invoked directly.

This workflow is read/design-only except for the smallest durable record justified by the result and
an optional `CONTEXT.md` vocabulary update. **Do not implement**, scaffold, or make product changes
during `/think`.

## Process

1. State the decision, uncertainty, constraints, non-goals, and what would make it resolved.
2. Read the relevant current contracts, Memory claims, project evidence, `CONTEXT.md`, and owning
   code paths. Load historical records only when a source pointer makes their rationale relevant.
   Answer discoverable questions from evidence instead of asking the user.
3. Resolve technical implementation choices from evidence. Ask one consequential question at a
   time only for a user-owned outcome, authority boundary, lasting constraint, or material cost/risk
   tradeoff. Give a recommendation with the question.
4. Compare credible alternatives when a real tradeoff remains; do not invent alternatives to fill
   a quota. Lead with the recommendation and its decisive tradeoff. When
   external evidence is missing, route to `/research` instead of filling the gap with plausibility.
5. For hard independent analysis, use an optional bounded packet only when the capability gate in
   the Skills Kernel reports `allowed: true` and the additional perspective has an evidence
   advantage. Otherwise stay single-root.
6. Once aligned, choose the smallest durable record:
   - update an existing current contract when it owns the surviving behavior;
   - write a compact Memory claim when future recall needs the conclusion but no repo doc does;
   - write `docs/decisions/YYYY-MM-DD-<topic>.md` from `templates/decision-record.md` only when the
     user requested a committed ADR or the choice is hard to reverse, surprising without context,
     the result of a real tradeoff, and not already captured by a current contract or code.
7. If domain language was resolved, update `CONTEXT.md` in the same write. Never mutate vocabulary
   mid-grill. If no durable record is justified, write nothing.

Use `Durable: yes` only for the exceptional committed decision-record lane above.

## Review and handoff

`ask-counterpart-review` is risk-triggered, not automatic. Use it only when a fresh context or
distinct model has a named evidence advantage for a material uncertainty. Review findings are
hypotheses; accept only those supported by the decision evidence or a new check. The user owns
product direction and authority; the agent owns internal workflow mechanics.

Let `../../references/execution-policy.md` select the internal coordination artifact. Hand off to
`/plan` only for formal-plan mode and `/build` only when implementation is already authorized.
For a design-only request, return the decision and any justified record; do not start implementation.

## References

- `templates/decision-record.md`
- `../../references/skills-kernel.md`
- `../../references/specialist-routing.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
