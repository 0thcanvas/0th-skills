---
name: think
description: "Turn an idea into a decision through structured conversation. Use when starting new features, exploring approaches, or facing design uncertainty. Grills the user, explores alternatives, produces a short decision record."
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

## Process

### 1. Understand Context

- Read relevant KB entries and project docs
- Explore the codebase where the work will happen
- Check recent commits in the affected area
- On Codex-hosted runs, explicitly use `0th_explorer` when code ownership or execution paths are not already obvious from the initial read

### 2. Grill

Ask questions one at a time. For each question:
- Provide your recommended answer
- If the question can be answered by reading code, read the code instead of asking

Focus on: purpose, constraints, what success looks like.

Prefer multiple choice when possible. One question per message.

### 3. Explore Approaches

Propose 2-3 approaches with tradeoffs. Lead with your recommendation and why.

For hard design questions (multiple valid architectures, non-obvious tradeoffs):
- Spawn 3+ agents with deliberately different constraints
- Present each design sequentially
- Compare in prose, recommend one

### 4. Decide

Once aligned, write the decision record. Always write it — even if you think you'll build in this session.

**Format** — save to `docs/decisions/YYYY-MM-DD-<topic>.md`:

```markdown
# <Topic>

**Date:** YYYY-MM-DD
**Status:** active

## Decision
What we're building and the approach chosen, in 2-3 sentences.

## Constraints
- Key constraint or tradeoff that shaped the decision
- Another constraint

## Not Doing
- What we explicitly excluded and why (one line each)

## Depends On
- Link to other decision records this interacts with (if any)
```

Target: 10-20 lines. If it's longer, you're writing a spec, not a decision.

### 5. Cross-Model Review

Send the decision record to the counterpart reviewer:
- Include the decision record + relevant context (KB entries, codebase state)
- In Claude-hosted runs, use Codex
- In Codex-hosted runs, use Claude
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

## KB Integration

- **Reads:** project domain index, design principles, prior decisions in this area
- **Writes:** decision record to docs/decisions/ (mirrored to vault)
