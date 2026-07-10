---
name: deep-research
description: "Builds a budgeted file-backed world model for an expensive external investigation. Use when feasibility, decision, or survey work requires multiple source passes, contradiction analysis, a reusable landscape, or an experiment; ordinary source-backed questions stay in research."
argument-hint: "[feasibility|decision|survey] [question]"
---

# Deep Research

Deep research is an expensive escalation, not the default response to a hard question. Use the
smallest multi-pass investigation that can resolve the accepted decision. Apply
`../../references/skills-kernel.md` once for root-task preflight, authority, optional delegation,
safety, context transfer, and closeout. Ordinary source-backed research is the default and belongs
in `/research`.

## Cost gate and budget

Enter only when the accepted deliverable requires at least one of: a reusable file-backed world
model, explicit contradiction analysis across source passes, a buildable feasibility experiment, or
a reusable survey. Complexity, importance, or the phrase “deep research” alone is insufficient.

Before the first search, record explicit limits in `state.md`:

- source-pass budget: default `2`;
- worker budget: default `1` root worker unless the Skills Kernel proves bounded delegation useful;
- iteration budget: default `2` full loops and at most `1` reframe.

The user or accepted TaskSpec may raise a limit. Do not raise one autonomously. Stop as soon as the
decision is supported, even when budget remains. If ordinary `/research` resolves the question, do
not enter this workflow.

## Modes

- `feasibility`: buildable architecture plus an experiment against the highest-risk assumption.
- `decision`: evidence-backed comparison and decision record.
- `survey`: landscape and reusable wiki pages.

Parse mode and question from `$ARGUMENTS`; if mode is absent, infer it only when unambiguous.
Generate a short topic slug and resolve the KB root through project configuration.

## Disk contract

Use `{KB_ROOT}/research/{topic}/` with `state.md`, `journal.md`, `raw/`, `raw/archived/`, `wiki/`,
and `experiments/`. Existing `state.md` is the resume authority. Two sessions must not mutate the
same topic concurrently.

Raw sources and experiments stay on disk. The root carries only `state.md`, bounded summaries,
source pointers, unresolved gaps, and next read targets through `context_handoff`; each summary stays
small and does not
accumulate raw source material.

## Adaptive phase loop

Read the relevant section of `references/phase-guide.md` before each phase.

1. **Frame:** define verdict criteria, decompose sub-problems, assign source buckets, and identify
   the assumption most likely to invalidate the frame.
2. **Search:** run broad and learned-vocabulary passes. Default to one root agent; use independent
   source packets only when the Skills Kernel capability gate allows them.
3. **Build world model:** synthesize claims, mechanisms, contradictions, confidence, and provenance
   into `world-model.md`.
4. **Probe gaps:** show verified findings, unverified claims, conflicting evidence, and threats to
   the decomposition.
5. **Reassess:** change the frame when evidence invalidates it; do not defend the original split.
6. **Develop:** assemble the architecture, decision, or survey and run
   `references/quality-rubric.md`.
7. **Experiment:** feasibility mode only; test the highest-risk buildable assumption through an
   executable seam.
8. **Conclude:** state `SUCCESS`, `PARTIAL`, `PIVOT`, `EXHAUSTED`, `USER_STOP`, or
   `MAX_ITERATIONS`, with evidence paths and remaining gaps.

Human alignment is required before a materially new frame, destructive/live experiment, or final
decision that exceeds the accepted TaskSpec. A routine phase transition is not a reason to pause.

## Termination

Stop early when verdict criteria are met or the decision is supported. Stop as `EXHAUSTED` when a
budget is spent without enough evidence. Higher limits require explicit TaskSpec or user approval;
the defaults remain two source passes, two full loops, and one reframe. Survey is normally one
frame/search/world model/gap/conclusion pass.

## References

- `references/phase-guide.md`
- `references/quality-rubric.md`
- `references/failure-modes.md`
- `references/abstract-mechanisms.md`
- `templates/state.md`
- `templates/world-model.md`
- `templates/raw-finding.md`
- `templates/experiment-report.md`
- `templates/conclusion.md`
- `templates/journal-entry.md`
- `templates/quality-gate.md`
- `../../references/skills-kernel.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
