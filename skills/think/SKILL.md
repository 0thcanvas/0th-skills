---
name: think
description: "Turns an uncertain idea into a short, explicit decision. Use when requirements, architecture, or tradeoffs are materially unresolved."
argument-hint: "[idea or design question]"
---

# Think

Turn uncertainty into a decision, not implementation. Apply `../../references/skills-kernel.md`
once for root-task preflight, authority, optional delegation, safety, and closeout.

## Enter / skip

- Enter for new features, competing approaches, or decisions that affect architecture.
- Skip to `/build` when the solution and acceptance criteria are already clear.
- `$ARGUMENTS` is the idea or design question when invoked directly.

This workflow is read/design-only except for its decision record and an optional `CONTEXT.md`
vocabulary update. **Do not implement**, scaffold, or make product changes during `/think`.

## Process

1. State the decision, uncertainty, constraints, non-goals, and what would make it resolved.
2. Read the relevant decision records, project evidence, `CONTEXT.md`, and owning code paths. Answer
   discoverable questions from evidence instead of asking the user.
3. Ask one consequential question at a time only when the answer changes the decision. Give a
   recommendation with the question.
4. Compare 2–3 credible approaches. Lead with the recommendation and its decisive tradeoff. When
   external evidence is missing, route to `/research` instead of filling the gap with plausibility.
5. For hard independent analysis, use an optional bounded packet only when the capability gate in
   the Skills Kernel reports `allowed: true` and the additional perspective has an evidence
   advantage. Otherwise stay single-root.
6. Once aligned, write `docs/decisions/YYYY-MM-DD-<topic>.md` using
   `templates/decision-record.md`. Target 10–20 lines: context, decision, rationale, rejected
   alternatives, consequences, and proof risk.
7. If domain language was resolved, update `CONTEXT.md` in the same write. Never mutate vocabulary
   mid-grill.

Mark `Durable: yes` only when the choice is hard to reverse, surprising without context, and the
result of a real tradeoff. Otherwise future work may revisit it normally.

## Review and handoff

`ask-counterpart-review` is risk-triggered, not automatic. Use it only when a fresh context or
distinct model is likely to catch a named architectural risk; record unique blockers and added
review cost. The user owns the final decision.

Hand off to `/plan` when work needs multiple ordered slices, otherwise `/build`.

## References

- `templates/decision-record.md`
- `../../references/skills-kernel.md`
- `../../references/specialist-routing.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
