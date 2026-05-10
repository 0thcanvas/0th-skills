---
name: deep-research
description: "Use when a hard feasibility, decision, or survey question needs multi-phase research, experiments, and a buildable architecture."
argument-hint: "[feasibility|decision|survey] [question]"
---

# Deep Research

Eight-phase research loop for problems that need more than a search engine.

Use this skill to decompose hard questions, research sub-problems with host-native agents,
build a filesystem-backed world model, and produce one of three outputs:
- `feasibility`: buildable architecture plus experiment results.
- `decision`: evidence-backed decision record.
- `survey`: wiki pages plus landscape overview.

For the detailed phase mechanics, templates, and routing tables, read
`references/phase-guide.md` before executing a phase.

## Direct Invocation

Parse `$ARGUMENTS`:
1. First word is the **mode**: `feasibility`, `decision`, or `survey`.
2. Everything after the first word is the **question**.

If the mode is missing or invalid, ask:
> "Which mode? feasibility (build an architecture), decision (compare options), or survey (map a landscape)."

Generate a **topic slug** from the question: kebab-case, 3-5 words, no stop words. Confirm
with the user before creating directories:
> "Topic slug: `{slug}` — OK?"

| Mode | Phases | Output |
|------|--------|--------|
| `feasibility` | 0-1-2-3-4-5-6-7 | Buildable architecture + experiment results |
| `decision` | 0-1-2-3-4-5-7d | Decision record |
| `survey` | 0-1-2-3-7s | Wiki pages + landscape overview |

## Disk Contract

Resolve the KB root using `PROTOCOL.md`: `KB_ROOT`, then project instructions, then ask once.

Use these paths throughout:
- `RESEARCH_ROOT = {KB_ROOT}/research`
- `TOPIC_ROOT = {RESEARCH_ROOT}/{topic}`

On first run, create:
```
{KB_ROOT}/research/
  index.md
  log.md
{RESEARCH_ROOT}/{topic}/
  state.md
  journal.md
  raw/
  raw/archived/
  wiki/
  experiments/
```

Use `templates/state.md` for `state.md`. Write raw findings, world models, quality gates,
experiments, conclusions, and journal entries using this skill's templates.

## Session Resumption

Before starting work, check `TOPIC_ROOT/state.md`.

If it exists:
1. Read `state.md`.
2. Report current phase, iteration, sub-problem statuses, and what happened last.
3. Ask: "Resume from Phase {N}, or start fresh?"

If the user resumes, continue from the recorded phase. If the user starts fresh, archive the
existing directory to `RESEARCH_ROOT/{topic}-archived-YYYY-MM-DD/`, create a new topic
directory, and proceed as a first run.

Single-session per topic. Different topics can run in parallel; two sessions on the same topic
are unsupported because agents would clobber `raw/` and `world-model.md`.

## Phase Loop

Read the relevant section of `references/phase-guide.md` before each phase.

| Phase | Gate | Summary |
|---|---|---|
| 0 FRAME | Human | Restate the question, decompose sub-problems, tag mechanisms, assign source buckets, and get approval. |
| 1 SEARCH | Autonomous | Dispatch host-native research agents in broad and vocabulary-expanded passes; write raw notes. |
| 2 BUILD WORLD MODEL | Autonomous | Dispatch synthesizer to build or merge `world-model.md` from raw notes and consensus checks. |
| 3 PROBE GAPS | Human | Present verified findings, unverified claims, gaps, contradictions, and decomposition threats. |
| 4 REASSESS | Automatic | Decide whether decomposition still holds; return to Phase 0 if evidence threatens the frame. |
| 5 DEVELOP | Autonomous | Assemble a buildable architecture or decision evidence; run the 10-point quality gate. |
| 6 EXPERIMENT | Autonomous | Feasibility mode only: validate the highest-risk assumption with a proof-of-concept. |
| 7 CONCLUDE | Human | Present verdict and write final artifacts. Use 7d for decisions and 7s for surveys. |

## Agent Routing

Use host-native agents:

| Work | Claude | Codex |
|---|---|---|
| Search and condense | `0th:web-researcher` | `0th_researcher` |
| Deep extraction | `0th:deep-researcher` | `0th_deep_researcher` |
| World-model synthesis | `0th:synthesizer` | `0th_synthesizer` |
| Experiment | `0th:experimenter` | `0th_experimenter` |

Each agent writes results to disk and returns a short summary. Do not pull raw webpages,
full paper text, search listings, experiment logs, or previous phase outputs into the
orchestrator context.

## Context Rule

Agents communicate through files, not context accumulation.

The orchestrator may hold:
- this compact workflow
- `TOPIC_ROOT/state.md`, read fresh each phase
- current phase agent summaries, <=30 lines each
- user responses at human gates

Reference findings by file path after they are written. When a new phase starts, previous
summaries are gone from context; they live on disk.

## Termination

Terminate through Phase 7 when any condition is met:
- SUCCESS: quality gate passes and feasibility experiment validates.
- PARTIAL: some sub-problems are solved and others remain open.
- PIVOT: Phase 4 returns to Phase 0 three times.
- EXHAUSTED: Phase 1 finds no new vocabulary for two full iterations.
- USER_STOP: user stops at a human gate.
- MAX_ITERATIONS: five full loops for feasibility or decision.

Survey mode is single-pass: Phase 0-1-2-3-7s, or USER_STOP.

## Reference Documents

- `references/phase-guide.md` — detailed phase mechanics and routing tables.
- `references/quality-rubric.md` — 10-point quality gate criteria and loop-back targets.
- `references/failure-modes.md` — failure mode defenses and overexcitement detector.
- `references/abstract-mechanisms.md` — cross-domain translation vocabulary.

## Templates

- `templates/state.md`
- `templates/world-model.md`
- `templates/raw-finding.md`
- `templates/experiment-report.md`
- `templates/conclusion.md`
- `templates/journal-entry.md`
- `templates/quality-gate.md`

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/session-preflight.mjs"`. It fetches upstream, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

When `.0th/memory/claims.jsonl` exists, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory-brief.mjs"` and read `.0th/memory/brief.md`; read it before browsing indexes or raw notes manually.

## Open Loop Brief

When `.0th/tasks/open-loops.jsonl` exists, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/open-loop-brief.mjs"` and read `.0th/tasks/brief.md` after the memory brief; use it to resume unfinished work before starting new scope.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Classify new knowledge as `decision`, `observation`, `root_cause`, `vocabulary`, `incident`, `repo_state`, `external_research`, or `nothing durable`. For durable outcomes, write through `memory-write.mjs`; do not hand-edit `.0th/memory/claims.jsonl`.

## Open Loop Integration

When work remains unfinished, blocked, or intentionally dropped, update `.0th/tasks/open-loops.jsonl` through `open-loop.mjs`; do not store TODOs as memory claims. Use `add` for new unfinished work, `block` for waiting states, `close` when completed, and `drop` when no longer worth doing.
