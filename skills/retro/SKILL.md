---
name: retro
description: "Turns a concrete workflow miss into a redacted incident record and pattern signal. Use when the session contains a user correction, agent misfire, skipped verification, or tool failure worth preserving."
---

# Retro

Capture facts before labels. Apply `../../references/skills-kernel.md` once for root-task preflight,
authority, safety, and closeout. Read
`references/incident-contract.md` before writing.

`$ARGUMENTS` narrows the incident focus; otherwise scan the current conversation. Skip when there
was no concrete correction or workflow failure. `retro_open_loop_closeout` may trigger this skill
after skipped verification, blocked proof, or repeated failure, but an incident still needs evidence.
Requests such as “take a note” or “remember this” without a concrete incident route to the configured
Memory write path or project KB instead; they do not enter `/retro` and must not fabricate an incident.

## Optional feedback migration

Legacy feedback migration is separate from recording a current incident. Run
`scripts/feedback-migrator.mjs` in dry-run mode only when migration is requested or relevant to the
current scope. Apply it only with migration authority, reusing authorization already given. Report
counts without echoing content. Its absence never blocks the current retro; migration is idempotent.

## Iron law

The workflow MUST run in this order: **extract evidence → redact → classify → aggregate**.

## 1. Extract evidence

For each candidate, capture:

- **What user wanted**
- **What agent did**
- **Correction evidence**: the minimum verbatim exchange that proves the gap

Do not classify yet.

## 2. Redact

Remove resolved secrets, tokens, cookies, JWTs, customer PII, proprietary prompt bodies, and private
code not needed to prove the incident. Shape-only replacements are sufficient. `op://` references are allowed; the resolved values behind them are not.

## 3. Classify

Choose one primary classification: `user-ambiguity`, `skill-issue`, `context-rot`, `tool-failure`,
`model-limitation`, `verification-skipped`, or `unknown`. Choose one primary skill: a slash-skill,
`none`, or `general-agent`. Related skills are informational only.

`unknown` requires exactly one of `candidate_new_category` or `insufficient_evidence`; it cannot be
a prose junk drawer. Add severity, deduplicated tags, provisional root cause, and proposed action.

## 4. Aggregate

Resolve the destination using `../../references/working-artifacts.md`. Honor an explicit user
destination first. With a configured KB incident owner, write one file per incident to
`${KB_ROOT}/learning/skill-incidents/YYYY-MM-DD-<slug>.md`; on collision append `-2`, `-3`, and so on.
Use an atomic write. Without a configured KB, return the redacted incident in chat or write the
requested file to the selected destination; do not invent a KB or require setup.

Required body order:

```markdown
## What user wanted
## What agent did
## Correction evidence
## Root cause
## Proposed action
```

Frontmatter includes timezone-aware `date`, primary `skill`, optional `related_skills`,
`classification`, `severity`, and unique `tags`. Do not copy schema comments into the incident.

When the configured incident directory is available, run:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/retro-aggregator.mjs" \
  --dir "${KB_ROOT}/learning/skill-incidents" \
  --now "$(date -Iseconds)" \
  --just-written "<incident-path>"
```

Without an incident corpus, report that historical aggregation was unavailable; the current
incident is still complete. For an available corpus, surface every bucket crossing three lifetime
entries, its prior entries, whether three are within 30 days, and one evidence-grounded action. The user chooses `apply`, `save for later`, or `ignore`;
`/retro` never silently edits skills or behavior rules.

## Return

Report the incident or saved path, classification × skill, any supported patterns, and proposed
actions. Ask for a choice only when an action requires new authority; recording a retro alone
does not require a follow-up approval. Run the Memory Write Gate only for a distinct durable
workflow conclusion; the incident itself is already the evidence record.

## References

- `references/incident-contract.md`
- `../../references/skills-kernel.md`
- `../../references/workflow-verification.md`
- `../../references/memory-contract.md`
- `../../references/working-artifacts.md`
