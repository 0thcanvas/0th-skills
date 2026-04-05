---
name: 0th:ask-codex-review
description: |
  Send an artifact to Codex for cross-model review when the host model is Claude.
  Used by /think (decision records), /plan (slice lists), and /ship (diffs).
  Constructs the Codex prompt with full context, invokes Codex, and returns the structured review.
model: opus
---

Send an artifact to Codex for independent review.

## You Receive

The parent agent provides:
- **Artifact:** the decision record, plan, or description of the diff to review
- **Context:** relevant background (KB entries, architecture, what problem this solves)
- **Review type:** decision / plan / code

## Process

### 1. Construct the Codex Prompt

Build an XML-block-structured prompt. This shape follows the same pattern the openai-codex plugin's
`codex:codex-rescue` subagent uses internally (via its `gpt-5-4-prompting` skill), which Codex
reliably responds to:

```
<task>
Review this <type> for correctness, risks, and scope discipline.

<artifact>
<artifact content>
</artifact>

<context>
<relevant background: KB entries, architecture, what problem this solves>
</context>
</task>

<grounding_rules>
- Cite specific lines, files, or claims from the artifact. No generalities.
- If you lack context to judge a claim, say so — do not fabricate or guess.
- Distinguish "this is wrong" from "this could be better".
</grounding_rules>

<structured_output_contract>
Respond in exactly this shape:

BLOCKERS:
- <issue + why it matters + where in the artifact> (or "none")

SUGGESTIONS:
- <improvement + tradeoff>

NITS:
- <minor point>

OVERALL: <one-sentence assessment>
</structured_output_contract>

<dig_deeper_nudge>
Before returning, check once more: did you catch the non-obvious issue? Review edge cases and
scope creep specifically — look for what was changed that wasn't asked for.
</dig_deeper_nudge>
```

The BLOCKER / SUGGESTION / NIT contract is 0th-specific. The `<grounding_rules>`,
`<structured_output_contract>`, and `<dig_deeper_nudge>` blocks are the review-prompt pattern from
the openai-codex plugin — inlined here so this manifest is self-contained, rather than depending
on a skill the subagent may not be able to load.

### 2. Invoke Codex

For decision/plan reviews:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task --key "<review-key>" "<prompt>"
```

For code reviews (diffs):
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" review --key "<review-key>" "<prompt>"
```

The same `--key` resumes the prior Codex thread automatically if one already exists.

### 3. Handle Debate (if needed)

If the parent agent disagrees with a BLOCKER and sends a counter-argument:
```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task --key "<review-key>" "<counter-argument>"
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
- If Codex exits with `command not found`, an auth failure, or an install error, stop and tell the user: *"Codex needs setup — run `/codex:setup` first."* Do not retry. This delegates install/auth surface to the openai-codex plugin instead of duplicating it
- Keep the prompt compact — Codex works better with focused context than dumps

For Codex-hosted runs, use `agents/ask-claude-review.md` instead.
