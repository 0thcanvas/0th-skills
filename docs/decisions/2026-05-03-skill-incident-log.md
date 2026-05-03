# Skill Incident Log + /retro Process

**Date:** 2026-05-03
**Status:** active
**Durable:** yes — design choices (`verification-skipped` as its own bucket, `unknown` over `other`, manual-only over hooks, atomic-note structure, facts-first authoring) read as arbitrary without context, and the manual-vs-auto-vs-hybrid fork was a real trade-off captured in Not Doing.

## Decision

Capture user corrections, agent misfires, and tool/skill issues as **one file per incident** at `${KB_ROOT}/learning/skill-incidents/<YYYY-MM-DD>-<short-slug>.md`. KB root resolves via the 0th KB protocol (`KB_ROOT` env → project instructions → one-time prompt; never hardcoded). On slug collision (same date + slug already exists), append `-2`, `-3`, etc. Manual capture only — a new `/retro` skill, invoked at end of session, reviews the conversation and writes structured entries; no auto-hook.

**Per-file structure**:

```markdown
---
date: 2026-05-03T14:30-05:00
skill: /think          # slash-skill name | none | general-agent — exactly one
related_skills: []     # optional cross-cuts when an incident touched several skills
classification: verification-skipped
severity: trivial | moderate | high   # subjective in v1; tighten if drift appears
tags: [confabulation, scope-creep]
# When classification = unknown, the entry MUST include exactly one of:
#   candidate_new_category: <name>
#   insufficient_evidence: <what's missing>
---

## What user wanted
## What agent did
## Correction evidence
## Root cause
## Proposed action
```

Generated incident files contain just the headings and body content; the inline comments elsewhere in the schema block are annotations for this decision record only.

The conditional `unknown` fields above are mandatory — if `classification: unknown`, the entry is malformed without exactly one of `candidate_new_category` or `insufficient_evidence`.

Classification is a single primary value drawn from `user-ambiguity | skill-issue | context-rot | tool-failure | model-limitation | verification-skipped | unknown`. The `/retro` skill prompt **MUST implement the staged authoring workflow in this exact order**: extract evidence → redact → classify → aggregate. The `unknown` discipline is also prompt-enforced (entries with `classification: unknown` and missing both conditional fields are rejected). A future schema validator could harden these from prompt-shape to write-time-rejected; for v1 the binding is prose-to-prompt.

When `/retro` writes a new entry it walks the directory and grouped-counts existing entries by (classification × `skill`), (classification alone), and (tags). The aggregation key is the single primary `skill`; `related_skills` is informational only and does not fan out. If any bucket reaches **≥ 3 lifetime**, `/retro` surfaces the pattern with links to prior entries, **annotates whether ≥ 3 fall within the last 30 days as a "recent cluster"** (computed: `0 ≤ current_run_at − incident_date ≤ 30 days`, inclusive on both bounds; both values are timezone-aware timestamps), and proposes a concrete action. When multiple buckets cross threshold at once, all are surfaced; the user chooses **apply / save for later / ignore**.

The existing `skills/FEEDBACK.md` pattern (one-liner skill-shape notes) **stays useful**, but the user's actual file moves to `${KB_ROOT}/learning/feedback.md` — same KB-protected path family as the incident log. The skills repo ships `FEEDBACK.example.md` as the seed template; "process the skill feedback" reads the local KB copy.

**Migration owners and order**: both the first `/retro` run AND the "process the skill feedback" flow check for an existing `skills/FEEDBACK.md`, compare its content against `FEEDBACK.example.md` to identify *non-template* entries (any non-empty line whose trimmed content is not present in `FEEDBACK.example.md`), and offer to copy them into `${KB_ROOT}/learning/feedback.md`. Two entry points reduces the risk of a user being in a window where they've upgraded but never invoked the migrating path. The committed `skills/FEEDBACK.md` is **kept in the skills repo for one release** alongside `FEEDBACK.example.md` so the migration check has something to find; it is removed only in the *next* release after a one-version overlap.

## Constraints

- **Privacy: redact secrets and PII in `correction evidence`.** Per the 0th secret-handling contract, do not paste resolved API keys, tokens, session cookies, secret-manager-resolved values (e.g., the value behind an `op://` reference), customer PII, or sensitive prompt bodies. Summarize the shape: "user pasted JWT-shaped token (omitted)", "API key referenced via env var", "customer email (redacted)". `op://` *references* themselves are fine — the resolved values are what must not appear. Treat verbatim quotes as the same disclosure surface as a counterpart-review prompt; KBs sometimes get synced or backed up.
- **Same agent that misfired writes the entry.** Verbatim/redacted evidence mitigates; provisional labels (classification, root cause) can be reclassified by future retros. The `/retro` prompt enforces facts-first authoring so evidence is captured before labels are committed.
- **Local KB/vault path required.** `${KB_ROOT}` resolves per the 0th KB protocol; the location must be ungitted. The skills repo ships configuration and templates, never user logs or feedback.
- **`/retro` is manual.** Coverage depends on user discipline. **Accepted failure mode for v1: zero coverage if forgotten.** A passive Stop nudge was rejected because hook noise on every session is not worth the marginal coverage gain.
- **Threshold = 3 (rule-of-three).** 1 is anecdote, 2 might be coincidence, 3 is a pattern. The 30-day cluster annotation distinguishes active patterns from slow accumulation. Both threshold and window are tunable later by editing the skill.
- **`/retro` implementation is gated on prompt review.** When the skill is built, its prompt must explicitly implement the four staged steps (extract evidence → redact → classify → aggregate) in that order, and the prompt review must verify the sequence is present and unconditional. Prose-to-prompt drift is the main failure mode this gate prevents.

## Not Doing

- **Stop-hook auto-capture.** Hook noise is not worth the marginal coverage gain; same-agent self-grading is independently unreliable.
- **Separate `/skills-health` skill.** `/retro` does both capture and pattern surfacing.
- **2D classification matrix.** Premature; flat 7-bucket taxonomy + tags is enough until 20+ entries exist.
- **Inline self-flagging during conversation.** The agent that just misfired is the worst judge of having misfired.
- **Time-windowed primary threshold.** Lifetime count + cluster annotation gives the same signal more cheaply, and avoids dropping legitimate slow-burning patterns.
- **Monthly multi-entry file.** Per-file frontmatter is the natural carrier for `date`, `skill`, `classification`; one file per incident makes aggregation a directory walk and plays naturally with Obsidian's atomic-note pattern.
- **Schema validator at write time (v1).** `/retro` prompt enforces the `unknown` discipline. A future hardening can add a JSON-schema validator if drift appears.

## Depends On

- The 0th KB protocol described in `skills/CLAUDE.md`'s "Knowledge Base" section (KB_ROOT resolution order, editor-agnostic markdown layout). `skills/AGENTS.md` is a symlink to `skills/CLAUDE.md`, so the Codex host reads the same canonical contract.
- The 0th secret-handling contract, also in `skills/CLAUDE.md` (and via the same symlink, `skills/AGENTS.md`) — the redaction rule above is its application to retrospective notes.
- Adjacent: `skills/FEEDBACK.md` is moved to `${KB_ROOT}/learning/feedback.md` and replaced in the repo with `FEEDBACK.example.md` (after the one-version overlap described in the Decision section) as part of this rollout.
