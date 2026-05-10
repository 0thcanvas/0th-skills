---
name: think
description: "Use when starting a feature, exploring approaches, or facing design uncertainty. Produces a short decision record."
argument-hint: "[idea or design question]"
---

# Think

Turn an idea into a decision. Not a document — a decision.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as the idea or design question. If
`$ARGUMENTS` is empty, infer it from the conversation.

## When to Use

- Starting something new and the shape is unclear
- Multiple valid approaches and you need to pick one
- Design question that affects architecture

Skip this when the task is obvious. "Add a /health endpoint" doesn't need /think.

## Triage Preamble

Before starting, assess in 3 lines:

```
What: [one sentence]
Uncertainty: low / medium / high
Why /think: [what decision needs to be made]
```

If uncertainty is low, say so and suggest /build directly.

## Session Resumption

If this is a new session on ongoing work:
1. Read the project's KB domain index
2. Read recent git log (last 10 commits)
3. Read any open decision records in docs/decisions/
4. Summarize what you found in 3-5 lines before proceeding

## Template Files

- See `templates/decision-record.md` for the canonical short-form decision record scaffold.

## Process

### 1. Understand Context

- Read relevant KB entries and project docs
- Read `CONTEXT.md` at the project root if it exists — adopt its vocabulary for the rest of the session
- Explore the codebase where the work will happen
- Check recent commits in the affected area
- On Codex-hosted runs, explicitly use `0th_explorer` when code ownership or execution paths are not already obvious from the initial read

### 2. Grill

Ask questions one at a time. For each question:
- Provide your recommended answer
- If the question can be answered by reading code, read the code instead of asking

Focus on: purpose, constraints, what success looks like.

Prefer multiple choice when possible. One question per message.

**Vocabulary discipline.** When the user's term conflicts with `CONTEXT.md`, surface it: "Your glossary defines X as A, but you seem to mean B — which is it?" Track resolved or sharpened terms in working memory for now — do not write to disk during grilling. Persisting vocabulary lands in Step 4 alongside the decision record so design conversations don't silently mutate the repo.

### 3. Explore Approaches

Propose 2-3 approaches with tradeoffs. Lead with your recommendation and why.

For hard design questions (multiple valid architectures, non-obvious tradeoffs):
- Spawn 3+ agents with deliberately different constraints
- Present each design sequentially
- Compare in prose, recommend one

When evidence for a recommendation is thin, dispatch /research before deciding rather than reasoning from pattern-matching.

### 4. Decide

Once aligned, write the decision record. Always write it — even if you think you'll build in this session.

**Format** — use `templates/decision-record.md` and save the result to
`docs/decisions/YYYY-MM-DD-<topic>.md`.

Target: 10-20 lines. If it's longer, you're writing a spec, not a decision.

**Capture vocabulary.** If the session resolved or sharpened domain terms, update `CONTEXT.md` at the project root alongside the decision-record write — lazy-create the file if it doesn't exist. Decision and vocabulary land together; no mid-grill writes.

**Durability tag.** Mark the record `Durable: yes` (in frontmatter or as the first body line) when *all three* are true:

1. **Hard to reverse** — changing direction later costs meaningful work.
2. **Surprising without context** — a future reader will wonder "why did they do it this way?"
3. **Result of a real trade-off** — there were genuine alternatives, you picked one for stated reasons.

Otherwise, leave the tag off — still write the record, but future architecture reviews can re-litigate freely. Durable records should not be re-proposed without an explicit revisit (`/improve-architecture` checks this tag before suggesting changes in the area).

### 5. Cross-Model Review

Send the decision record to the counterpart reviewer using `ask-counterpart-review`.
- Include the decision record + relevant context (KB entries, codebase state)
- The counterpart responds with concerns rated: nit / suggestion / blocker
- Blockers: address before proceeding
- Suggestions: present to user, incorporate if agreed
- Nits: accept or skip, don't debate
- If the counterpart raises no new information on round 2, stop the loop

Present to user: the decision + any interesting disagreements + the counterpart's blockers.

### 6. User Approves

User has final say. Update the decision record if anything changed.

## Iron Law

**Do not start implementation during /think.** Not even "let me just scaffold this real quick." The output is a decision, not code.

## Handoff

After approval, suggest /plan (if work needs slicing) or /build (if it's ready to implement).

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/session-preflight.mjs"`. It fetches upstream, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

When `.0th/memory/claims.jsonl` exists, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory-brief.mjs"` and read `.0th/memory/brief.md`; read it before browsing indexes or raw notes manually.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Classify new knowledge as `decision`, `observation`, `root_cause`, `vocabulary`, `incident`, `repo_state`, `external_research`, or `nothing durable`. For durable outcomes, write through `memory-write.mjs`; do not hand-edit `.0th/memory/claims.jsonl`.

## KB Integration

- **Reads:** project domain index, design principles, prior decisions in this area
- **Writes:** decision record to docs/decisions/ (mirrored to vault)
