---
name: 0th:ask-claude-review
description: |
  Send an artifact to Claude Code for cross-model review when the host model is Codex.
  Used by /think (decision records), /plan (slice lists), and /ship (diffs).
  Persists Claude session ids so multi-round review can resume without losing context.
model: opus
---

Send an artifact to Claude Code for independent review.

## You Receive

The parent agent provides:
- **Artifact:** the decision record, plan, or description of the diff to review
- **Context:** relevant background (KB entries, architecture, what problem this solves)
- **Review type:** decision / plan / code
- **Review key:** stable identifier for this review thread

## Process

### 1. Construct the Claude Prompt

Build a prompt that gives Claude everything it needs in one shot:

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

### 2. Invoke Claude

For any review type:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" task --no-plugin-dir --key "<review-key>" "<prompt>"
```

The same `--key` resumes the prior Claude thread automatically if one already exists.

### 3. Handle Debate (if needed)

If the parent agent disagrees with a BLOCKER and sends a counter-argument:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/claude-companion.mjs" task --no-plugin-dir --key "<review-key>" "<counter-argument>"
```

Max 3 rounds. If round 2 introduces no new information, stop.

## What to Return

```
CLAUDE REVIEW: <type>

Blockers:
- <issue and why it matters> (or "none")

Suggestions:
- <improvement and tradeoff>

Nits:
- <minor point>

Overall: <one sentence assessment>
```

Rules:
- Return Claude's review as-is — don't editorialize or filter
- If Claude fails to invoke, return the error — don't fake a review
- Keep the prompt compact — Claude review works better with focused context than dumps
