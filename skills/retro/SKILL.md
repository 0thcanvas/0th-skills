---
name: retro
description: "Use when closing a session with user corrections, agent misfires, or tool/skill issues to capture into the incident log."
argument-hint: "[optional: hint at which corrections to capture, e.g. 'today's PR mix-ups']"
---

# Retro

Capture this session's user corrections, agent misfires, and tool/skill issues into the persistent incident log so patterns become visible across sessions.

This skill implements the contract in [`docs/decisions/2026-05-03-skill-incident-log.md`](../../docs/decisions/2026-05-03-skill-incident-log.md). Read that decision before acting; it defines the schema, classification taxonomy, threshold rules, and privacy contract that this prompt enforces.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as a hint about which corrections to focus on. If `$ARGUMENTS` is empty, scan the entire current conversation for corrections worth logging.

## Step 0 — Check for FEEDBACK.md migration (one-time per upgrade)

Before authoring any new incident, check whether the user has un-migrated content in their committed `skills/FEEDBACK.md`. The decision moves user feedback from `skills/FEEDBACK.md` to `${KB_ROOT}/learning/feedback.md`; this step is the migration entry point that runs when /retro is invoked.

Run the migration script in dry-run mode first:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/feedback-migrator.mjs" \
  --feedback "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/FEEDBACK.md" \
  --example  "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/FEEDBACK.example.md" \
  --dest     "${KB_ROOT}/learning/feedback.md" \
  --dry-run
```

If `needed: true` (with `missingCount: <N>`), tell the user "you have N un-migrated feedback line(s); shall I migrate them now?" Do NOT echo the line contents to the user via this script's output — the CLI default reports counts only so feedback content doesn't leak through transcripts. If the user wants to inspect the lines first, read `skills/FEEDBACK.md` directly with the same redaction discipline that applies to incident `correction evidence`. To apply, re-run the script without `--dry-run`. If `needed: false`, skip silently. The migration is idempotent — re-runs converge to a no-op once the destination contains every non-template line.

The same script is also invoked from the "process the skill feedback" flow (see `skills/FEEDBACK.md`) so both entry points share one comparator.

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

### Pre-write checklist (verify before writing)

Before writing each incident file, verify each item explicitly. If any item fails, fix the entry first — don't write malformed incidents:

- [ ] `date` is an ISO 8601 timestamp with an explicit timezone (e.g. `2026-05-03T14:30-05:00` or `...Z`); the aggregator's recent-cluster check rejects timezone-less dates.
- [ ] `skill` is exactly one of: a slash-skill name, `none`, or `general-agent`. Never `multiple` (the schema requires a single primary skill).
- [ ] If `classification: unknown`, exactly one of `candidate_new_category:` or `insufficient_evidence:` is present in frontmatter. No free-form prose under `unknown`.
- [ ] `tags` contains no duplicate values within one incident (the aggregator dedupes per-incident, but a clean entry is the contract).
- [ ] No schema-block comments (the `# slash-skill name | none | general-agent` examples shown later in this prompt) appear in the generated file.
- [ ] All evidence sections have run through redaction (Step 2): no resolved secrets, tokens, secret-manager-resolved values, customer PII, or sensitive prompt bodies. `op://` references are allowed; the resolved values behind them are not.

### Schema

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

After writing the new entry, invoke the deterministic aggregator script to compute pattern surfacing:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/retro-aggregator.mjs" \
  --dir "${KB_ROOT}/learning/skill-incidents" \
  --now "$(date -Iseconds)" \
  --just-written "<path-to-the-entry-you-just-wrote>"
```

The aggregator walks the directory and grouped-counts *all* entries (including the just-written one) by:

- `(classification × skill)` — primary `skill` only; `related_skills` does NOT fan out into bucket counts
- `(classification)` alone
- one bucket per distinct value in `tags`

It returns a JSON object `{ patterns: [...] }` where each pattern that crossed **≥ 3 lifetime entries** carries `bucketType`, `bucketKey`, `count`, `priorEntries` (the just-written entry excluded — the report is retrospective), and `recentCluster` (true when ≥ 3 entries satisfy `0 ≤ current_run_at − date ≤ 30 days`, using the **frontmatter `date`**, not the filename, inclusive, timezone-aware). When multiple buckets cross at once, all are surfaced; the user picks where to act.

Why a script: walking the directory, parsing YAML frontmatter, computing date deltas, and counting buckets reliably is a deterministic computation. Reading the script's JSON output keeps the agent's job to interpretation, not arithmetic.

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

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" preflight`. It fetches upstream, reconciles previously unseen HEAD drift, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" brief --scope global` and read the `output_file` path from its JSON result; if the global brief is missing or corrupt, warn visibly and continue with project memory. Then run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" brief` and read the project `output_file`. Memory v2 runtime is the canonical agent recall path. Read generated briefs before browsing indexes, raw notes, or legacy KB/Obsidian markdown manually. Treat markdown KB material as optional fallback, import/export source, or human-rendered evidence only. Do not load source packs at startup; recall or expand source packs on demand.

## Open Loop Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" task-brief` and read the `output_file` path from its JSON result after the memory brief; use it to resume unfinished work before starting new scope.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Use `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" write-gate` when the scope is ambiguous so the event is classified as project, global, both, or nothing durable. For direct durable claims, write through `memory remember`; do not hand-edit runtime `claims.jsonl`.

## Open Loop Integration

When work remains unfinished, blocked, or intentionally dropped, update open loops through `memory open-loop`; do not store TODOs as memory claims. Use `add` for new unfinished work, `block` for waiting states, `close` when completed, `drop` when no longer worth doing, and `reopen` when deferred work becomes active again.

## KB Integration

- **Reads:** the existing incident log at `${KB_ROOT}/learning/skill-incidents/`, the decision record this skill implements
- **Writes:** one new markdown file per incident at the same location
