---
name: plan
description: "Use when a decision needs vertical implementation slices, acceptance criteria, dependency ordering, or multi-session coordination."
argument-hint: "[decision record path or scope]"
---

# Plan

Break a decision into buildable slices. Optional — only when the work needs structure.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as the initial scope or decision record
reference. If `$ARGUMENTS` is empty, infer the scope from the conversation.

## When to Use

- Work spans multiple sessions (need to resume)
- Multiple slices with ordering dependencies
- Want to dispatch parallel agents per slice
- Scope is large enough that "just build it" risks drift

Skip this when a single TDD session will cover it.

## Triage Preamble

```
What: [one sentence]
Decision record: [path or "none — building from direct instruction"]
Slices (estimate): [number]
Why /plan: [what structure is needed]
```

## Session Resumption

If resuming ongoing work:
1. Read the decision record(s) this plan implements
2. Read any existing plan in docs/plans/
3. Read recent git log to see what's already been built
4. Report: "N of M slices complete. Next: [slice name]."

## Process

### 1. Read the Decision

Load the decision record from /think (or the user's direct instruction). Read all decision records it references via `depends-on`.

On Codex-hosted runs, explicitly use `0th_explorer` when you need help mapping the current code
paths or interfaces before you can slice the work cleanly.

### 2. Identify Durable Decisions

Before slicing, note architectural decisions that span all slices:
- Data models / schema shapes
- Key interfaces and their contracts
- Route structures
- Auth/authz approach
- Service or deployment boundaries when the work introduces heavy local runtimes, ML models, or worker processes

These go in the plan header. 3-5 bullet points max.

### 3. Slice Vertically

Each slice is end-to-end through all layers (data → logic → interface). Not horizontal (all models, then all routes, then all UI).

Rules:
- Each slice is independently demoable or verifiable
- Many thin slices over few thick ones
- Describe behavior and acceptance criteria, NOT implementation steps
- No file paths — describe contracts and interfaces
- For UI, canvas, SVG, animation, overlay, responsive layout, or game-scene slices, name the visual invariant that could fail and the required screenshot evidence, pixel assertion, or other visual evidence.

### 4. Write the Plan

Save to `docs/plans/YYYY-MM-DD-<topic>.md`:

```markdown
# <Topic> Plan

**Decision:** [link to decision record]
**Slices:** N

## Architecture
- Data model: [shape]
- Key interface: [contract]

## Slices

### 1. <Name>
<What this slice delivers — one sentence>
- [ ] Acceptance criterion
- [ ] Acceptance criterion
- [ ] Visual invariant: [what must visually hold + screenshot evidence/pixel assertion], if applicable

### 2. <Name>
<What this slice delivers>
- [ ] Acceptance criterion
- [ ] Visual invariant: [what must visually hold + screenshot evidence/pixel assertion], if applicable

...
```

Target: 2-4 lines per slice. The plan is a checklist, not a tutorial. If a slice description exceeds 5 lines, it's too thick — split it.

### 5. Cross-Model Review

Send to the counterpart reviewer using `ask-counterpart-review` with the decision record + plan:
- Missing slices? Wrong order? Scope creep beyond the decision?
- Same severity protocol: nit / suggestion / blocker

### 6. User Approves

User scans the slice list. Approves, reorders, or adjusts scope.

## Handoff

After approval, suggest /build with the plan path.

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" preflight`. It fetches upstream, reconciles previously unseen HEAD drift, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" brief --scope global` and read the `output_file` path from its JSON result; if the global brief is missing or corrupt, warn visibly and continue with project memory. Then run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" brief` and read the project `output_file`. Memory v2 runtime is the canonical agent recall path. Read generated briefs before browsing indexes, raw notes, or legacy KB/Obsidian markdown manually. Treat markdown KB material as optional fallback, import/export source, or human-rendered evidence only. Do not load source packs at startup; recall or expand source packs on demand.

## Open Loop Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" task-brief` and read the `output_file` path from its JSON result after the memory brief; use it to resume unfinished work before starting new scope.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Use `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" write-gate` when the scope is ambiguous so the event is classified as project, global, both, or nothing durable. For direct durable claims, write through `memory remember` (shorthand for the full `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" remember` command shown above); do not hand-edit runtime `claims.jsonl`.

## Open Loop Integration

When work remains unfinished, blocked, or intentionally dropped, update open loops through `memory open-loop` (shorthand for the full `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" open-loop` command); do not store TODOs as memory claims. Use `add` for new unfinished work, `block` for waiting states, `close` when completed, `drop` when no longer worth doing, and `reopen` when deferred work becomes active again.

## KB Integration

- **Reads:** decision records, project architecture docs, design principles
- **Writes:** plan to docs/plans/ (mirrored to vault)
