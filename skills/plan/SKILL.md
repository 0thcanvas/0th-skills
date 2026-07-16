---
name: plan
description: "Converts an approved outcome into verifiable vertical slices. Use when implementation has ordering, dependency, risk, multi-session complexity, external APIs, paid data, webhooks, third-party authorization, or live operational effects."
argument-hint: "[decision record path or scope]"
---

# Plan

Produce a build checklist, not a tutorial. Apply `../../references/skills-kernel.md` once for
root-task preflight, authority, optional delegation, safety, and closeout.

## Enter / skip

- Enter when the work spans multiple meaningful slices or sessions.
- Enter before implementation whenever the work introduces or changes an external API, paid data
  source, webhook/stream, third-party authorization flow, destructive migration, or live
  operational effect. This gate applies even when the code change appears bounded.
- Skip to `/build` when one bounded implementation loop is sufficient.
- `$ARGUMENTS` is the decision record or requested scope when invoked directly.

This workflow plans only. It does not implement slices.

## Process

1. Load the approved decision or direct instruction and every declared dependency. If a material
   product or architecture question remains unresolved, return `BLOCKED_BY_SPEC` or `/think`.
2. Capture 3–5 cross-slice decisions: data shape, key interfaces, authority boundary, proof tier,
   deployment/runtime boundary, and any irreversible migration.
3. When any external data or API is involved, add an **Acquisition Contract** before slicing:
   - exact product and endpoint or event name;
   - push, stream, polling, or snapshot semantics;
   - whose data can be accessed and what OAuth/consent is required;
   - billing unit, documented unit price, worst-case cost for baseline and recurring operation;
   - rate, subscription, retention, and replay limits;
   - a maximum live-probe budget and the stop condition before the first paid call;
   - rejected alternatives, especially any full-list polling fallback.
   Unknown pricing, authorization, or event semantics is `BLOCKED_BY_SPEC`, not an implementation
   detail. Verify these fields from current primary sources.
4. Slice vertically through the observable behavior. Each slice must be independently verifiable
   and small enough for one build loop. Prefer many thin slices to a few horizontal layers.
5. Give each slice an outcome, acceptance criteria, non-goals, dependency, expected proof tier, and
   possible `blocked_real_env` state. Name a `context_handoff` only when later work needs bounded
   source pointers or unresolved gaps.
6. For UI, canvas, SVG, animation, overlay, responsive layout, or game work, name the visual invariant
   and required screenshot evidence, screenshot assertion, or pixel assertion.
7. For specialist work, name the capability boundary, handoff envelope, return receipt, and native
   fallback. Never plan a plugin’s internal workflow.
8. Save the approved checklist to `docs/plans/YYYY-MM-DD-<topic>.md`.

Plan shape:

```markdown
# <Topic> Plan
**Decision:** <path or direct instruction>
**Slices:** N

## Architecture
- <cross-slice contract>

## Acquisition Contract
- <required for external data/API work; omit only when not applicable>

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
