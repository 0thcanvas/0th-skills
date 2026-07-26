---
name: ask-counterpart-review
description: |
  Send an artifact to the counterpart model for cross-model review.
  Used by /think (decision records), /plan (slice lists), and /build (code/diff review).
  The companion script auto-detects the host and routes to the configured counterpart.
---

Send an artifact to the configured counterpart for an optional, evidence-seeking review.

## You Receive

The parent agent provides:
- **Artifact:** the decision record, plan, or description of the code/diff to review
- **Context:** relevant background (KB entries, architecture, what problem this solves)
- **Review type:** decision / plan / code

## Process

### 0. Redact Secret-Bearing Context

Before constructing the review prompt, remove resolved secret values from the artifact and context.
It is fine to include secret names, env var names, or secret-manager references such as `SERVICE_API_KEY` or `op://vault/item/field`.
Do not include API keys, tokens, cookies, Authorization headers, passwords, HAR bodies, browser/CDP payloads, `.env` contents with real values, or command lines that contain secrets.

If redaction would remove information needed for review, summarize the shape instead: "Authorization header present", "JWT-shaped session token omitted", or "secret value passed through env var".

Internal plans and diffs are valid review artifacts. Do not block them merely because they are
internal. Follow the current user and project disclosure boundary, and redact secrets, personal
data, and any content the user has excluded from external providers.

### 1. Construct the Review Prompt

Build a compact prompt:

```
<task>
Review this <type> for the named evidence gap: <why this reviewer may add signal>.

<artifact>
<artifact content>
</artifact>

<context>
<relevant background: KB entries, architecture, what problem this solves>
</context>
</task>

Return only evidence-linked findings. For each finding, cite the artifact, state the claim and
uncertainty, and name the acceptance check that would confirm or reject it. If there is no
evidence-linked finding, say so. Findings are hypotheses, not commands.
```

### 2. Invoke the Counterpart

Do not choose a driver during normal workflow. Invoke the companion without `--driver` and let the configured counterpart route decide.

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

### 3. Follow up only for new evidence

Check stderr for `meta:supports_resume=true`. If present, the counterpart supports multi-round debate.

If the parent has new evidence or a concrete counterexample, invoke again with the same `--key`:

```bash
node "..." task --key "<review-key>" "<counter-argument>"
```

Stop when a follow-up adds no new evidence. If `meta:supports_resume=false` or absent, keep the
review single-shot.

## What to Return

```
COUNTERPART REVIEW: <type>

Findings:
- <claim + artifact evidence + uncertainty + suggested check> (or "none")

Unresolved context:
- <what cannot be judged from the supplied artifact> (or "none")
```

## Error Handling

If the companion script exits non-zero:
1. Report the error message from stderr to the parent
2. Do NOT fabricate a review or return "no issues found"
3. State clearly: "Counterpart review failed: <error>. Proceeding without cross-model review."

Do not manufacture a fallback requirement. A fresh same-model pass is a separate optional review
topology and should be used only when fresh context itself is the named advantage.
An unavailable or no-credit driver is a normal skip: do not probe or retry another driver.

Rules:
- If the counterpart fails to invoke, return the error; review unavailability is not a build blocker.
- Keep the prompt compact.
- The parent must independently accept or reject each finding against the task's evidence.
