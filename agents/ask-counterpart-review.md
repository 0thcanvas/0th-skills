---
name: 0th:ask-counterpart-review
description: |
  Send an artifact to the counterpart model for cross-model review.
  Used by /think (decision records), /plan (slice lists), and /ship (diffs).
  The companion script auto-detects the host and routes to the configured counterpart.
model: opus
---

Send an artifact to the counterpart model for independent review.

## You Receive

The parent agent provides:
- **Artifact:** the decision record, plan, or description of the diff to review
- **Context:** relevant background (KB entries, architecture, what problem this solves)
- **Review type:** decision / plan / code

## Process

### 1. Construct the Review Prompt

Build an XML-block-structured prompt:

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

### 2. Invoke the Counterpart

```bash
node "${COUNTERPART_COMPANION_SCRIPT:-${CLAUDE_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-${OTH_SKILLS_ROOT}}}/scripts/counterpart-companion.mjs}" \
  task --key "<review-key>" "<prompt>"
```

For code reviews (diffs), use `review` instead of `task`:

```bash
node "${COUNTERPART_COMPANION_SCRIPT:-${CLAUDE_PLUGIN_ROOT:-${CODEX_PLUGIN_ROOT:-${OTH_SKILLS_ROOT}}}/scripts/counterpart-companion.mjs}" \
  review --key "<review-key>" "<prompt>"
```

If none of the env vars resolve, report: "Cannot locate counterpart-companion.mjs. Set OTH_SKILLS_ROOT to the 0th plugin directory."

### 3. Handle Debate (if supported)

Check stderr for `meta:supports_resume=true`. If present, the counterpart supports multi-round debate.

If the parent agent disagrees with a BLOCKER and sends a counter-argument, invoke again with the same `--key`:

```bash
node "..." task --key "<review-key>" "<counter-argument>"
```

Max 3 rounds. If round 2 introduces no new information, stop.
If `meta:supports_resume=false` or absent, skip debate — each review is single-shot.

## What to Return

```
COUNTERPART REVIEW: <type>

Blockers:
- <issue and why it matters> (or "none")

Suggestions:
- <improvement and tradeoff>

Nits:
- <minor point>

Overall: <one sentence assessment>
```

## Error Handling

If the companion script exits non-zero:
1. Report the error message from stderr to the parent
2. Do NOT fabricate a review or return "no issues found"
3. State clearly: "Counterpart review failed: <error>. Proceeding without cross-model review."

Rules:
- Return the counterpart's review as-is — don't editorialize or filter
- If the counterpart fails to invoke, return the error — don't fake a review
- Keep the prompt compact — focused context produces better reviews than dumps
