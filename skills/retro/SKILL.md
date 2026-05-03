---
name: retro
description: "Capture user corrections, agent misfires, and tool/skill issues into a structured incident log. Invoke at end of session to write one entry per misfire, classify each, and surface patterns when threshold is crossed."
argument-hint: "[optional: hint at which corrections to capture, e.g. 'today's PR mix-ups']"
---

# Retro

Capture this session's user corrections, agent misfires, and tool/skill issues into the persistent incident log so patterns become visible across sessions.

This skill implements the contract in [`docs/decisions/2026-05-03-skill-incident-log.md`](../../docs/decisions/2026-05-03-skill-incident-log.md). Read that decision before acting; it defines the schema, classification taxonomy, threshold rules, and privacy contract that this prompt enforces.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as a hint about which corrections to focus on. If `$ARGUMENTS` is empty, scan the entire current conversation for corrections worth logging.

## When to Use

- End of a session that contained one or more user corrections, agent misfires, or tool/skill issues
- Anytime the user asks to "log a retro," "log incidents," or "process this session's misses"
- When you want to check whether recent patterns have crossed the ≥ 3 threshold

Skip this when the session had no corrections — there's nothing to log.

## Iron Law

The four steps below MUST run in this exact order: **extract evidence → redact → classify → aggregate**. Do not classify before evidence is captured. Do not aggregate before classifying. Do not skip the redact step. The order forces facts-first thinking and prevents the agent from labelling its own misfire before the misfire is even on paper.

## Process

### Step 1 — Extract evidence

Walk the conversation. For each candidate misfire, capture three plain-language facts in working memory before any classification:

- **What user wanted** — one paragraph stating the intent the user actually had.
- **What agent did** — one paragraph stating the action the agent took (or claim it made).
- **Correction evidence** — the verbatim exchange that revealed the gap. Quote the user's correcting message and the agent's prior misfiring claim.

Do not skip ahead to "this was a skill-issue" or "this was context-rot." Labels come later.

### Step 2 — Redact

Sanitize the evidence sections per the 0th secret-handling contract. Replace any of the following with shape-only summaries:

- Resolved API keys, tokens, session cookies, JWTs
- Resolved values of `op://` references (the *references* themselves are fine — `op://vault/item/field` stays; the value behind it must not appear)
- Customer PII (emails, names, addresses, IDs)
- Sensitive prompt bodies (proprietary documents, private code)

Replacement form: `"user pasted JWT-shaped token (omitted)"`, `"API key referenced via env var"`, `"customer email (redacted)"`. Treat the verbatim section as the same disclosure surface as a counterpart-review prompt — KBs sometimes get synced or backed up.

### Step 3 — Classify

For each captured incident, pick exactly one **primary** classification:

- `user-ambiguity` — the instruction had multiple valid readings; agent picked the wrong one
- `skill-issue` — a skill's prompt is wrong, ambiguous, or missing a case
- `context-rot` — agent drifted in a long session; would have been correct earlier
- `tool-failure` — a script broke, MCP hung, hook fired silently
- `model-limitation` — known model bias (Opus jumps to plausibility, Sonnet over-explains, etc.)
- `verification-skipped` — agent claimed something without checking when checking was cheap
- `unknown` — none of the above fits

If you choose `unknown`, the entry MUST also include exactly one of:
- `candidate_new_category: <name>` — propose what new bucket should exist
- `insufficient_evidence: <what's missing>` — say what would be needed to classify

Free-form prose under `unknown` is rejected. The conditional fields exist to prevent `unknown` from drifting into a junk drawer.

Pick the primary `skill` from: a slash-skill name (e.g. `/think`, `/build`), `none`, or `general-agent`. Optional `related_skills:` array carries cross-cuts but does not fan out into bucket counts (it is informational only).

Add a provisional **root cause** paragraph and a **proposed action** (skill edit, behavior rule, bug fix, or "no action — one-off"). Mark these as revisable — future retros can reclassify by reading the verbatim evidence.

### Step 4 — Aggregate

Resolve the KB root using the 0th protocol (`KB_ROOT` env → project instructions → one-time prompt; never hardcoded). Write each incident as **one file per incident** at:

```
${KB_ROOT}/learning/skill-incidents/<YYYY-MM-DD>-<short-slug>.md
```

If the date+slug filename already exists, append a numeric suffix: `-2`, `-3`, etc. Use atomic writes (temp-file-then-rename if you can) so partial files never appear.

Each file's frontmatter:

```yaml
---
date: <ISO 8601 timestamp with timezone>
skill: /think          # slash-skill name | none | general-agent
related_skills: []     # optional cross-cuts; informational only
classification: verification-skipped
severity: trivial | moderate | high   # subjective; tighten if drift appears
tags: [confabulation, scope-creep]
# When classification = unknown, include exactly one of:
#   candidate_new_category: <name>
#   insufficient_evidence: <what's missing>
---
```

Body sections (in this exact order):

```markdown
## What user wanted
## What agent did
## Correction evidence
## Root cause
## Proposed action
```

The inline schema-block comments above are documentation for this prompt only — they MUST NOT appear in generated incident files.

After writing the new entry, **walk** `${KB_ROOT}/learning/skill-incidents/` and grouped-count *all* entries (including the just-written one) by:

- `(classification × skill)` — primary `skill` only; `related_skills` does not fan out
- `(classification)` alone
- one bucket per distinct value in `tags`

If any bucket reaches **≥ 3 lifetime entries**, surface the pattern with links to the **prior** entries (exclude the just-written entry from the link list — the report is retrospective). When multiple buckets cross at once, surface all of them; let the user pick where to act.

For each surfaced pattern, annotate whether it is a **recent cluster**: ≥ 3 of the matched entries satisfy `0 ≤ current_run_at − date ≤ 30 days`, where `date` is read from the incident's frontmatter (not the filename), inclusive on both bounds, with timezone-aware timestamps. "Recent cluster" means an active pattern; absence means slow accumulation.

Propose a concrete action per surfaced pattern, grounded in common patterns across the matched entries' verbatim evidence (not pattern-matched prose). Present a chooser:

- **apply** — start the normal approved edit/build flow for the proposed action (skill edit → review → ship). Never silent mutation.
- **save for later** — record the proposal in the entries' "Proposed action" sections without executing.
- **ignore** — surface only; no further action this session.

## What to Return

```
RETRO REPORT

Captured: N new incident(s)
  - <YYYY-MM-DD>-<slug>.md — <classification> × <skill> — <one-line summary>
  - ...

Patterns surfaced (≥ 3):
  <bucket-key> — <count> entries (recent cluster: yes/no)
    Prior entries: [<link>] [<link>] [<link>]
    Proposed action: <concrete action>
    Choose: apply / save for later / ignore

(Or "No patterns surfaced — buckets remain below threshold." when nothing crosses 3.)
```

## Rules

- Facts before labels. The four-step order is non-negotiable.
- Verbatim evidence is the bias check — future retros (or the user) can reclassify by reading the unfiltered exchange.
- One file per incident. No global mutable index file.
- Path is always `${KB_ROOT}`-resolved. Never hardcoded.
- `unknown` requires `candidate_new_category` or `insufficient_evidence`. No exceptions.
- The `apply` chooser invokes the existing edit/build flow with user approval — `/retro` itself never modifies skill files, behavior rules, or other code.

## KB Integration

- **Reads:** the existing incident log at `${KB_ROOT}/learning/skill-incidents/`, the decision record this skill implements
- **Writes:** one new markdown file per incident at the same location
