# Memory v2 Runtime Hardening Plan

**Decision:** [../decisions/2026-05-10-0th-memory-v2.md](../decisions/2026-05-10-0th-memory-v2.md)
**Research:** `${KB_ROOT}/research/agent-first-memory-design/world-model.md`
**Slices:** 9

## Architecture

- Runtime state remains local user state, outside product repos; product repos keep only contracts, scripts, docs, decisions, tests, and skill prompts.
- Agents use one memory surface: compact recall and briefs by default, expand-by-id for evidence, and explicit write/open-loop/maintain commands for mutation.
- Raw evidence is the floor; structured claims, lessons, decisions, repo state, and open loops are derived records with source pointers and lifecycle metadata.
- Workflow hooks are authoritative for non-negotiable events; model judgment chooses what to remember inside those boundaries.
- Maintenance is explicit and replayable: stale, superseded, duplicate, orphaned, drifted, and low-confidence records are reported before being rewritten or dropped.

## Slices

### 1. Unified Memory Entrypoint
Expose one agent-facing `memory` command that routes to write, recall, expand, brief, sync, maintain, eval, and open-loop behavior.
- [x] Existing direct scripts remain usable or become thin compatibility wrappers.
- [x] `memory --help` names the agent workflow, not only raw script flags.
- [x] Skill prompts refer to the single command for normal use.

### 2. Locked Runtime Writes
Make memory and open-loop mutation safe when multiple agents or hooks touch the same project runtime directory.
- [x] Concurrent writes cannot silently lose claims or open-loop updates.
- [x] Stale lock handling is deterministic and visible in command output.
- [x] Tests cover overlapping write/write and write/sync operations.

### 3. Evidence Floor
Add a local evidence record layer so durable claims can trace to the event that produced them without storing repo state in the product checkout.
- [x] Evidence records capture event type, scope, source pointers, timestamps, and redaction status.
- [x] Claims and open loops can cite evidence IDs as well as file paths.
- [x] Secret-bearing values are never written to evidence records.

### 4. Compact Recall and Expand
Give agents a fast search path that returns small, ranked records first and expands only selected evidence.
- [x] Recall supports type, scope, lifecycle, source, and text filters.
- [x] Recall output includes ids, snippets, lifecycle, confidence, timestamps, and source pointers.
- [x] Expand returns full selected records with provenance and abstains cleanly for missing ids.

### 5. Repo State Drift Tracking
Persist repo freshness state so manual pulls, merges, branch changes, and out-of-band PR merges are detected at the next workflow boundary.
- [x] Runtime state records last seen HEAD, branch, upstream relation, dirty state, and last memory sync.
- [x] Preflight reconciles HEAD changes even when the current agent did not perform the pull or merge.
- [x] Dirty or divergent local state remains warning-only unless the user explicitly chooses otherwise.

### 6. Maintenance Command
Create a first-class maintenance report for stale memory, supersession candidates, duplicates, orphan open loops, missing sources, and repo drift.
- [x] The command reports actions separately from automatic mutations.
- [x] Supersession and invalidation are source-backed lifecycle changes, not destructive deletes.
- [x] Briefs are refreshed after lifecycle changes.

### 7. Open-Loop Lifecycle
Make unfinished work usable across many projects without confusing it with durable knowledge.
- [x] Project, repo, and global open loops can be listed from one command.
- [x] Done, dropped, blocked, and reopened transitions keep audit history.
- [x] Session-start briefs show the next action, blocker, source, and project key.

### 8. Workflow Integration
Wire Memory v2 into the actual skill flow rather than leaving it as optional tooling.
- [x] Session preflight reads memory and open-loop briefs before manual KB browsing.
- [x] Build/debug/ship/research checkpoints call the write gate or record `nothing durable`.
- [x] After exploration, only the inspected read set can refresh related memory.

### 9. Executable Memory Evaluation
Upgrade the current capability matrix into executable fixtures that protect the runtime behavior.
- [x] Fixtures cover recall, expand, stale-claim sync, manual HEAD drift, open-loop resume, correction retention, and abstention.
- [x] Evaluation output compares current runtime behavior against the expected agent-facing answer.
- [x] A failing fixture points to the missing memory primitive rather than a vague score.
