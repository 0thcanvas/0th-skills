---
name: plan
description: "Converts a resolved outcome into verifiable vertical slices. Use when a plan is requested as the deliverable or the agent selects formal coordination."
---

# Plan

Produce a build checklist, not a tutorial. Apply `../../references/skills-kernel.md` once for
root-task preflight, authority, optional delegation, safety, and closeout.

## Enter / skip

- Enter when a plan is requested as the deliverable or
  `../../references/execution-policy.md` selects formal planning.
- Do not ask the user whether a plan is needed. The agent owns that internal coordination choice.
- External/live or irreversible work is a risk signal, not an automatic plan trigger. It still
  requires the authority and effect contract defined by the execution policy.
- Skip to `/build` when one bounded implementation loop is sufficient.
- Ordered multi-file or debugging work alone is not a plan trigger; `/build` may use an adaptive
  checkpoint while evidence evolves.
- `$ARGUMENTS` is the resolved decision or requested scope when invoked directly.

This workflow produces the plan artifact; it does not implement slices. If implementation was
already requested, continue to `/build` without asking the user to approve internal planning
mechanics.

## Process

1. Load the resolved decision or direct instruction and every declared dependency. If a material
   product or architecture question remains unresolved, return `BLOCKED_BY_SPEC` or `/think`.
2. Capture 3–5 cross-slice decisions: data shape, key interfaces, authority boundary, proof tier,
   deployment/runtime boundary, and any irreversible migration.
3. When a formal plan covers an external API, paid data source, webhook/stream, or other external
   acquisition, add an **Acquisition Contract** before slicing:
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
8. Save an internal plan under the 0th state root described by
   `../../references/working-artifacts.md`, then hand off that path. A committed plan under
   `docs/plans/` is exceptional: use it only when the user requests the plan as a repository
   deliverable or the checklist has lasting shared value beyond the active task. Delete temporary
   plans after merge, abandonment, or replacement.

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
a concrete evidence advantage. Treat findings as hypotheses and accept them only when the request,
decision evidence, or a reproducible constraint supports them. An unavailable or skipped reviewer
does not block the plan. The user may reorder or narrow a user-facing plan, but do not insert an
approval pause for an internal plan when implementation already has authority. Hand off to `/build`
with the plan path.

## References

- `../../references/skills-kernel.md`
- `../../references/execution-policy.md`
- `../../references/specialist-routing.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
