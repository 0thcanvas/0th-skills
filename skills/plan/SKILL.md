---
name: plan
description: "Converts an approved outcome into verifiable vertical slices. Use when implementation has ordering, dependency, risk, or multi-session complexity."
argument-hint: "[decision record path or scope]"
---

# Plan

Produce a build checklist, not a tutorial. Apply `../../references/skills-kernel.md` once for
root-task preflight, authority, optional delegation, safety, and closeout.

## Enter / skip

- Enter when the work spans multiple meaningful slices or sessions.
- Skip to `/build` when one bounded implementation loop is sufficient.
- `$ARGUMENTS` is the decision record or requested scope when invoked directly.

This workflow plans only. It does not implement slices.

## Process

1. Load the approved decision or direct instruction and every declared dependency. If a material
   product or architecture question remains unresolved, return `BLOCKED_BY_SPEC` or `/think`.
2. Capture 3–5 cross-slice decisions: data shape, key interfaces, authority boundary, proof tier,
   deployment/runtime boundary, and any irreversible migration.
3. Slice vertically through the observable behavior. Each slice must be independently verifiable
   and small enough for one build loop. Prefer many thin slices to a few horizontal layers.
4. Give each slice an outcome, acceptance criteria, non-goals, dependency, expected proof tier, and
   possible `blocked_real_env` state. Name a `context_handoff` only when later work needs bounded
   source pointers or unresolved gaps.
5. For UI, canvas, SVG, animation, overlay, responsive layout, or game work, name the visual invariant
   and required screenshot evidence, screenshot assertion, or pixel assertion.
6. For specialist work, name the capability boundary, handoff envelope, return receipt, and native
   fallback. Never plan a plugin’s internal workflow.
7. Save the approved checklist to `docs/plans/YYYY-MM-DD-<topic>.md`.

Plan shape:

```markdown
# <Topic> Plan
**Decision:** <path or direct instruction>
**Slices:** N

## Architecture
- <cross-slice contract>

## Slices
### 1. <Outcome>
- [ ] <externally visible acceptance>
- [ ] Proof: <tier and evidence>
```

Keep each slice to 2–5 lines. File-by-file edit instructions belong to implementation, not the plan.

## Review and handoff

Use `ask-counterpart-review` only when ordering, migration risk, or missing coverage gives a reviewer
a concrete evidence advantage. The user may approve, reorder, or narrow the slices. Then hand off
to `/build` with the plan path.

## References

- `../../references/skills-kernel.md`
- `../../references/specialist-routing.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
