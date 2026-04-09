---
name: deep-research
description: "Research-loop skill for hard problems. Decomposes, researches with multi-agent consensus, experiments, and produces buildable architectures. Manages context via subagent isolation and KB-backed external memory."
argument-hint: "[feasibility|decision|survey] [question]"
---

# Deep Research

Eight-phase research loop for problems that need more than a search engine.

Decomposes hard questions into sub-problems, researches each with parallel agents and
multi-source consensus, validates with experiments, and produces buildable architectures.
All state lives on disk. Agents communicate through the filesystem, not through context.

## Direct Invocation

Parse `$ARGUMENTS`:
1. First word is the **mode**: `feasibility`, `decision`, or `survey`.
2. Everything after the first word is the **question**.

If the mode word is missing or not one of the three valid modes, ask the user:
> "Which mode? feasibility (build an architecture), decision (compare options), or survey (map a landscape)."

Generate a **topic slug** from the question — kebab-case, 3-5 words, no stop words. Confirm
with the user before creating any directories:
> "Topic slug: `{slug}` — OK?"

| Mode | Phases | Output |
|------|--------|--------|
| `feasibility` | 0-1-2-3-4-5-6-7 (full loop) | Buildable architecture + experiment results |
| `decision` | 0-1-2-3-4-5-7d (skip Phase 6) | Decision record |
| `survey` | 0-1-2-3-7s (skip Phases 4-6) | Wiki pages + landscape overview |

## KB Root

Before creating any files, resolve the KB root using `PROTOCOL.md`:
1. `KB_ROOT`
2. project instructions
3. ask the user once

Use these logical paths throughout the workflow:
- `RESEARCH_ROOT = {KB_ROOT}/research`
- `TOPIC_ROOT = {RESEARCH_ROOT}/{topic}`

## Session Resumption

Before starting any work, check `TOPIC_ROOT/state.md`.

If it exists:
1. Read state.md.
2. Report: current phase, iteration, sub-problem statuses, what happened last.
3. Ask: "Resume from Phase {N}, or start fresh?"

If user says **resume**: continue from the phase recorded in state.md.

If user says **start fresh**:
1. Archive the existing directory to `RESEARCH_ROOT/{topic}-archived-YYYY-MM-DD/`.
2. Create a new empty topic directory.
3. Proceed as first run. The archived copy can be referenced manually.

**Concurrency:** Single-session per topic. Running two sessions on the same topic simultaneously is unsupported — agents would clobber each other's `raw/` and `world-model.md`. Different topics can run in parallel safely (separate directories).

## KB Scaffolding (First Run)

If `RESEARCH_ROOT` does not exist, create:
```
{KB_ROOT}/research/
  index.md    # Master catalog: "# Research KB Index\n\n| Topic | Mode | Status | Started |"
  log.md      # Append-only log: "# Research Log"
```

Create the topic directory:
```
{RESEARCH_ROOT}/{topic}/
  state.md          # From templates/state.md
  journal.md        # "# Research Journal: {Topic}"
  raw/
  raw/archived/
  wiki/
  experiments/
```

---

## Phase 0 — FRAME (Human-Gated)

**Goal:** Build the research frame. Do NOT start researching yet.

Steps:
1. **Restate the question** in precise technical terms. Remove ambiguity.
2. **Decompose into sub-problems.** Each sub-problem should be independently researchable.
3. **Tag each sub-problem** with an abstract mechanism from `references/abstract-mechanisms.md`.
   If no existing mechanism fits, propose a new one.
4. **Cross-domain hints** per sub-problem: "What other fields solve this same abstract problem?"
   List 2-3 adjacent fields with mature solutions.
5. **Assign source buckets** per sub-problem: arXiv, GitHub, official docs, forums, general web.
6. **Present the full frame** to the user for approval. Format:

```
## Research Frame: {question}

Sub-problems:
  1. {sub-problem}
     Abstract mechanism: {mechanism}
     Cross-domain: {field1} ({technique}), {field2} ({technique})
     Sources: {bucket1}, {bucket2}

  2. ...

Approve, modify, or reject this decomposition.
```

7. Wait for user approval. User may approve, modify, or reject entirely.

**Writes:**
- `state.md` — populate with approved frame, set Phase to 0 complete, Next to Phase 1.
- `RESEARCH_ROOT/index.md` — append topic entry.
- `RESEARCH_ROOT/log.md` — `[date] frame | {topic} | Decomposed into N sub-problems (v1)`

---

## Phase 1 — SEARCH (Autonomous, Parallel)

**Goal:** Map the solution space. Two passes.

### Pass 1 — Broad search

For each sub-problem x source bucket combination, dispatch the host-native search agent in parallel:
- Claude-hosted runs: `0th:web-researcher`
- Codex-hosted runs: `0th_researcher`
- **Question:** the sub-problem, phrased for the source bucket.
- **Source bucket:** the assigned bucket.
- **Context:** which sub-problem this serves.

Each web-researcher returns <= 30 lines. Write each result to:
```
TOPIC_ROOT/raw/YYYY-MM-DD-{subproblem-slug}-{source-bucket}.md
```
Use the raw finding template (`templates/raw-finding.md`). Tag provenance as `original` or
`derivative`.

### Pass 2 — Vocabulary expansion + deep dives

1. Read all Pass 1 findings (by file path — do NOT load full content into orchestrator context,
   only agent summaries).
2. Extract new vocabulary: terms, names, techniques, model names, paper titles discovered.
3. Re-query with learned vocabulary. Dispatch additional host-native search agents with
   refined queries using the new terms.
4. For key arXiv papers surfaced in Pass 1 or Pass 2: dispatch the host-native deep extraction agent with:
   - Claude-hosted runs: `0th:deep-researcher`
   - Codex-hosted runs: `0th_deep_researcher`
   - **Source URL:** the paper/repo URL.
   - **Extraction questions:** architecture details, methods, quantitative results, limitations.
   - **Context:** which sub-problem and gap this fills.
5. Write additional raw notes to `raw/`.

**Update state.md:**
- Vocabulary section: add all new terms under current iteration.
- File counts.
- Set Phase to 1 complete, Next to Phase 2.

### Context Rule (Critical)

The orchestrator NEVER sees raw web pages. Only agent summaries (<=30 lines each) enter context.
After writing to KB, reference findings by file path, not by content.

---

## Phase 2 — BUILD WORLD MODEL (Autonomous)

**Goal:** Synthesize raw findings into a structured world model.

Dispatch the host-native synthesis agent with:
- Claude-hosted runs: `0th:synthesizer`
- Codex-hosted runs: `0th_synthesizer`
- **Raw note paths:** paths to NEW raw notes from the current iteration's Phase 1 only.
- **Existing world-model path:** `TOPIC_ROOT/world-model.md` (if iteration > 1).
- **World-model output path:** `TOPIC_ROOT/world-model.md`.
- **Sub-problems list:** the current decomposition from state.md.
- **Mode:** `build` (iteration 1) or `merge` (iteration 2+).

The synthesizer:
- Extracts nodes: Technique, Paper, Benchmark, Limitation.
- Builds typed edges: solves, evaluated_on, causes, analogous_to.
- Runs consensus check per sub-problem (verified requires >=2 agents from different source
  buckets with >=1 original provenance).
- Writes `TOPIC_ROOT/world-model.md`.
- Returns a ~10-line summary (version, node counts, consensus, gaps).

**Compaction step:** After the synthesizer finishes, move consumed SEARCH raw files to
`raw/archived/`. Experiment result files (`raw/*experiment*`) are exempt — they stay in
`raw/` because Phase 7 needs them.

**Writes:**
- `RESEARCH_ROOT/log.md` — `[date] world-model | {topic} | Built v{n}, T verified / U unverified findings`
- Update state.md: set Phase to 2 complete, Next to Phase 3.

---

## Phase 3 — PROBE GAPS (Human-Gated)

**Goal:** Present findings to the user and get direction.

Read `TOPIC_ROOT/world-model.md`. Present to user:

1. **Verified findings** — sub-problems with verified solutions (>=2 sources agree).
2. **Unverified findings** — single-source claims that need more evidence or should be discarded.
3. **Gaps** — sub-problems with no good solution found.
4. **Contradictions** — sources that disagree on the same claim.
5. **Decomposition threats** — evidence suggesting the problem frame is wrong.

Ask the user:
- Which gaps to investigate further?
- Which direction to take?
- Does the decomposition need revision?

Wait for user response. The user's direction shapes what happens next.

**Survey mode:** After Phase 3, skip to Phase 7s (no Phases 4-6).

---

## Phase 4 — REASSESS (Automatic, escalates to Phase 0 if threatened)

**Goal:** Check whether the decomposition still holds. Anti-drift mechanism.

For each sub-problem, evaluate:
1. Do verified findings actually solve it?
2. Do any limitations block the overall approach?
3. Does evidence suggest a fundamentally different decomposition?

### If decomposition holds:
- Continue to Phase 5.
- Write journal entry: "Reassessment: decomposition held. Evidence: {brief}."

### If decomposition is threatened:
- Flag to user: "Evidence suggests a different approach: {reasoning}."
- Return to Phase 0. The world model persists — we do NOT throw away what we learned.
- The human decides how to re-frame at Phase 0 (human-gated).

### Pivot tracking:
If REASSESS has triggered a return to Phase 0 three times total, the termination condition
is PIVOT. Go to Phase 7 instead.

**Writes:**
- `journal.md` — reassessment entry: what evidence triggered it, held/revised decision, reasoning.
- `RESEARCH_ROOT/log.md` — `[date] reassess | {topic} | Decomposition {held | revised to v{n+1}}`
- Update state.md: set Phase to 4 complete, Next to Phase 5 (or Phase 0 if threatened, or Phase 7 if PIVOT).

---

## Phase 5 — DEVELOP (Autonomous, feasibility + decision modes)

**Goal:** Design a buildable solution using verified findings. Fill remaining gaps with
cross-domain search.

### Steps:

1. **Root-cause decomposition** for each remaining gap: why hasn't this been solved? What's the
   actual blocker?

2. **Cross-domain search** for each gap:
   a. Look up the sub-problem's abstract mechanism in `references/abstract-mechanisms.md`.
   b. Identify 2+ non-obvious fields that solve the same abstract mechanism.
   c. Dispatch the host-native search agent (`0th:web-researcher` on Claude, `0th_researcher` on Codex) to search those fields for candidate techniques.
   d. Dispatch the host-native deep extraction agent (`0th:deep-researcher` on Claude, `0th_deep_researcher` on Codex) for promising cross-domain papers/techniques — extract
      architecture details, methods, and quantitative results.
   e. **Translation step** (mandatory): explicitly describe how the cross-domain technique maps
      back to the original problem. Record as `analogous_to` edges in world model.

3. **Solution assembly:** Combine verified techniques into an architecture. Write to
   `TOPIC_ROOT/wiki/architecture.md`.

4. **New mechanisms:** If cross-domain search discovered new abstract mechanisms, append them to
   `references/abstract-mechanisms.md`.

### Quality Gate

Run the 10-point rubric from `references/quality-rubric.md` against the architecture.
All 10 criteria must pass. Binary — no partial credit. Write evaluation to
`TOPIC_ROOT/quality-gate.md` using `templates/quality-gate.md`.

**If any criterion fails:**

| Failed Criteria | Loop-back Target | Reason |
|----------------|-----------------|--------|
| 1, 8 (decomposition/drift) | Phase 0 (human-gated) | Framing problem |
| 2, 3, 6 (evidence/verification/contradiction) | Phase 1 (re-search) | Need more/better evidence |
| 5 (cross-domain) | Phase 5 (expand search) | Need to search other fields |
| 4, 9, 10 (limitations/recency/specificity) | Phase 2 (rebuild world model) | Need updated queries |
| 7 (experiment targets risk) | Phase 6 (re-select experiment) | Need higher-risk target |

**Loop-back traversal rule:** After looping back to the target phase, resume the current mode's
normal phase sequence forward from that point. Examples:
- Feasibility, criterion 4 fails -> Phase 2 -> 2->3->4->5->gate->6->7
- Decision, criterion 6 fails -> Phase 1 -> 1->2->3->4->5->gate->7d
- Feasibility, criterion 1 fails -> Phase 0 (human gate) -> 0->1->2->3->4->5->gate->6->7

**Per-criterion retry cap: 2.** If a criterion fails twice on loop-back, it downgrades to
ADVISORY — recorded in `quality-gate.md` with a note ("criterion {N} downgraded to advisory
after 2 failures") but does not block progression. Track retry counts in state.md under
`Quality Gate Retries`.

**If gate passes:** Continue to Phase 6 (feasibility) or Phase 7d (decision).

---

## Phase 6 — EXPERIMENT (Autonomous, feasibility mode only)

**Goal:** Validate the highest-risk assumption in the architecture with a proof-of-concept.

Steps:
1. Read `wiki/architecture.md`.
2. Identify the **highest-risk assumption** — the thing most likely to be wrong. Quality gate
   criterion #7 enforces risk-first selection: test the weakest link, not the easiest thing.
3. Dispatch the host-native experiment agent with:
   - Claude-hosted runs: `0th:experimenter`
   - Codex-hosted runs: `0th_experimenter`
   - **Architecture doc path:** `TOPIC_ROOT/wiki/architecture.md`
   - **Hypothesis:** the specific claim to test.
   - **Success criteria:** measurable threshold that defines pass/fail.
   - **Experiment type:** `model-probe` (30 min), `integration-spike` (15 min),
     `feasibility-spike` (15 min), or `scale-test` (30 min).
   - **Topic path:** `TOPIC_ROOT/`
   - **Experiment number:** sequential ID.
4. Experimenter writes results to `TOPIC_ROOT/raw/YYYY-MM-DD-experiment-{n}.md`
   and creates reproducible experiment directory under `experiments/`.

### Routing on Failure

| Failure Type | Route | Action |
|---|---|---|
| FAIL_TECHNIQUE | Phase 5 | Technique doesn't work — find alternative |
| FAIL_INTEGRATION | Phase 5 | Components don't connect — redesign interface |
| FAIL_ASSUMPTION | Phase 4 | Understanding of problem was wrong — REASSESS |
| FAIL_ENVIRONMENT | Retry (max 2) | Setup issue — fix and retry |

On PASS: continue to Phase 7.

---

## Phase 7 / 7d / 7s — CONCLUDE (Human-Gated)

**Goal:** Present verdict and deliver final artifacts.

### Before Writing Any Verdict — Overexcitement Detector

Reference `references/failure-modes.md`. Answer these questions honestly:

1. What is the WEAKEST link in this architecture?
2. If a senior engineer reviewed this, what would they call bullshit on?
3. (Feasibility only) Did any experiment actually FAIL? If not, were we testing hard enough?
4. Am I excited because the evidence is strong, or because I WANT this to work?

If question 4 gives pause, flag it to the user as a concern. Decision mode skips question 3.
Survey mode skips the entire detector.

---

### Phase 7 — Feasibility Conclude

**Quality gate re-check:** Run criteria #4 (limitations), #7 (experiment targets risk), and
#10 (buildable specificity) only — since only Phase 6 ran between the Phase 5 gate and now.
If any fail, loop back per the same targets above.

Present to user:
1. **Verdict:** FEASIBLE / PARTIALLY_FEASIBLE / NOT_FEASIBLE / PIVOT
2. **Architecture:** link to `wiki/architecture.md`
3. **Experiment results:** what was tested, PASS/FAIL, evidence
4. **Remaining risks:** unverified assumptions, known limitations
5. **Recommended next steps**

Write `wiki/conclusion.md` using `templates/conclusion.md`.

---

### Phase 7d — Decision Conclude

**Quality gate:** Run criteria #1-6 and #8-10 (skip #7, no experiments). If any fail, loop
back per targets.

Write `wiki/decision.md`:
- Options identified
- Evidence for/against each (citing verified findings from world model)
- Recommendation
- Remaining uncertainties

Write `wiki/conclusion.md` using `templates/conclusion.md`.

Present to user for approval.

---

### Phase 7s — Survey Conclude

No quality gate. No overexcitement detector.

Write:
- `wiki/{subtopic}.md` — one per decomposition branch, compiled from verified world model nodes.
- `wiki/landscape.md` — overview: what exists, maturity levels, open problems, key players.

Write `wiki/conclusion.md` using `templates/conclusion.md`.

Present to user for approval.

---

### Phase 7 Common Writes (all modes)

- `journal.md` — iteration summary: frame version used, per-sub-problem status
  (SOLVED/PARTIAL/OPEN), what didn't work, what triggered termination.
  For survey mode (Phase 7s): include coverage assessment and open questions identified.
- `RESEARCH_ROOT/log.md` — `[date] conclude | {topic} | Verdict: {verdict}, N experiments`
- `references/abstract-mechanisms.md` — confirm any new mechanisms appended during Phase 5. Remove any that proved incorrect during experimentation; keep those validated by evidence.
- Update state.md: set Phase to 7 complete.

### Handoff Recommendations

| Verdict | Handoff |
|---|---|
| FEASIBLE | `/build` with `wiki/architecture.md` as input |
| PARTIALLY_FEASIBLE | `/think` — decide: build partial, or research more? |
| NOT_FEASIBLE | `/think` — decide: pivot, reduce scope, or abandon? |
| PIVOT | `/deep-research` again with revised question + accumulated KB |

---

## Loop Termination

| Condition | Trigger | Action |
|---|---|---|
| SUCCESS | Quality gate passes + experiment validates (feasibility) | Phase 7: present verdict |
| PARTIAL | Some sub-problems solved, others have no verified approach | Phase 7: present what's feasible |
| PIVOT | REASSESS (Phase 4) triggers return to Phase 0 three times | Phase 7: what we learned + why framing doesn't hold |
| EXHAUSTED | Phase 1 vocabulary expansion produces no new terms for 2 consecutive full iterations | Phase 7: mapped the frontier of public knowledge |
| USER_STOP | User says stop at any human gate | Phase 7: compile what we have |
| MAX_ITERATIONS | 5 full loops (feasibility: Phases 1-6; decision: Phases 1-5; survey: Phases 1-3) | Phase 7: hard stop, present best result |

**Per-mode applicability:** PIVOT and EXHAUSTED apply to feasibility and decision (both iterate).
Survey is single-pass — it terminates after Phase 3 + 7s, or via USER_STOP. MAX_ITERATIONS
applies only to modes with iterative loops.

---

## Context Management Rules

These rules are architectural. They apply to every phase.

### What the Orchestrator Holds

**Always present:**
- This system prompt / skill workflow.
- `TOPIC_ROOT/state.md` (read fresh from disk each phase).

**Per-phase (temporary, replaced each phase):**
- Agent return summaries (<=30 lines each).
- User responses at human gates.

### What NEVER Enters the Orchestrator

- Raw web pages.
- Full paper text.
- Search result listings.
- Experiment stdout/stderr.
- Previous phase agent outputs (they are on disk, not in memory).

### The Critical Rule

Agents communicate through the filesystem, not through context accumulation.

```
Phase 1: Dispatch research agents -> they write to raw/
Phase 2: Tell synthesizer "read raw/*.md" -> it writes world-model.md
Phase 3: Read world-model.md -> present to user
Phase 5: Dispatch research agents + deep-researchers -> they write to raw/
Phase 6: Tell experimenter "read wiki/architecture.md" -> it writes results to raw/
```

Each phase reads the KB, dispatches agents, agents write back to KB. When a new phase starts,
previous summaries are gone from context — they live on disk.

---

## Reference Documents

- `references/quality-rubric.md` — 10-point quality gate criteria and loop-back targets.
- `references/failure-modes.md` — 6 failure mode defenses and overexcitement detector.
- `references/abstract-mechanisms.md` — cross-domain translation vocabulary (grows over time).

## Templates

- `templates/state.md` — state file format.
- `templates/world-model.md` — world model format (nodes, edges, consensus).
- `templates/raw-finding.md` — raw note format with provenance tag.
- `templates/experiment-report.md` — experiment output format.
- `templates/conclusion.md` — conclusion document format.
- `templates/journal-entry.md` — journal entry format.
- `templates/quality-gate.md` — quality gate evaluation format.

## Agents

| Agent | Dispatched In | Purpose |
|---|---|---|
| `0th:web-researcher` / `0th_researcher` | Phase 1, Phase 5 | Search + condense (<=30 lines). One question per dispatch. |
| `0th:deep-researcher` / `0th_deep_researcher` | Phase 1 Pass 2, Phase 5 | Deep extraction from papers/repos. Structured findings. |
| `0th:synthesizer` / `0th_synthesizer` | Phase 2 | Build/merge world model from raw notes. Consensus check. |
| `0th:experimenter` / `0th_experimenter` | Phase 6 | Run proof-of-concept experiments. Pass/fail verdict. |
