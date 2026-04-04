---
name: 0th:codex-review
description: |
  Send an artifact to Codex for cross-model review. Used by /think (decision records),
  /plan (slice lists), and /ship (diffs). Constructs the Codex prompt with full context,
  invokes Codex, and returns the structured review.
model: sonnet
---

Send an artifact to Codex for independent review.

## You Receive

The parent agent provides:
- **Artifact:** the decision record, plan, or description of the diff to review
- **Context:** relevant background (KB entries, architecture, what problem this solves)
- **Review type:** decision / plan / code

## Process

### 1. Construct the Codex Prompt

Build a prompt that gives Codex everything it needs in one shot:

```
Review this <type>:

<artifact content>

Context:
<relevant background>

Respond with:
- BLOCKER: issues that must be addressed before proceeding
- SUGGESTION: improvements worth considering (user decides)
- NIT: minor style/preference (skip or accept, don't debate)

Be specific. Name what's wrong and why. If everything looks good, say so in one line.
```

### 2. Invoke Codex

For decision/plan reviews:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task "<prompt>"
```

For code reviews (diffs):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" review
```

### 3. Handle Debate (if needed)

If the parent agent disagrees with a BLOCKER and sends a counter-argument:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task --resume-last "<counter-argument>"
```

Max 3 rounds. If round 2 introduces no new information, stop.

## What to Return

```
CODEX REVIEW: <type>

Blockers:
- <issue and why it matters> (or "none")

Suggestions:
- <improvement and tradeoff>

Nits:
- <minor point>

Overall: <one sentence assessment>
```

Rules:
- Return Codex's review as-is — don't editorialize or filter
- If Codex fails to invoke, return the error — don't fake a review
- Keep the prompt compact — Codex works better with focused context than dumps
