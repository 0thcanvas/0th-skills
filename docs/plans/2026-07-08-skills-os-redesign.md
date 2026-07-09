# 0th Skills Kernel Redesign — Evaluation-First Plan

**Decision:** `docs/decisions/2026-07-08-skills-os-redesign.md`
**Date:** 2026-07-08
**Status:** proposed — implementation must begin with the evaluation baseline
**Primary host:** Codex with GPT-5.6-class models
**Core slices:** 7; memory automation and factory mode are separate follow-ons

This plan replaces the original big-bang Skills OS proposal. It keeps the useful direction—thin portable skills, honest proof, durable state, and harness adapters—but removes unsupported fleet and review defaults. Behavioral evidence must precede broad migration.

---

## Part A — Evidence Boundary

### A.1 Supported direction

| Finding | Consequence |
|---|---|
| Frontier models perform better with outcome-first prompts and less repeated scaffolding | Slim skill bodies; keep outcomes, invariants, evidence, authority, and stopping rules |
| Agent Skills has a narrow portable standard | Keep `SKILL.md` plus optional resources portable; put runtime capabilities in adapters |
| Multi-agent value depends on decomposability, shared state, and verification | One root agent is the baseline; topology is selected, not assumed |
| Deterministic guarantees are stronger as executable controls | Keep proof tiers, ship gates, schemas, locks, permissions, and stack minimums |
| Durable state should live outside disposable agent context | Keep compact task/evidence ledgers and path-based handoffs |
| Existing 0th skills duplicate lifecycle prose and pin old routing policy | Remove duplication and fixed policy only through measured ablations |

### A.2 Not yet proven

- That simplified skills outperform the current workflow on 0th tasks.
- That any fleet beats one GPT-5.6 agent on repository work after tokens and latency.
- That inherited same-model workers are better than lower-effort, cheaper, or no workers.
- That fresh same-model or cross-model review catches enough unique blockers to justify routine use.
- That documented host model, effort, hook, resume, and isolation controls are available in every runtime.
- That automatic retro extraction can write durable memory without sediment or false positives.

These are experiment questions, not design principles.

### A.3 Preserve

- Proof tiers, stack minimums, real-environment evidence, and honest blocked outcomes.
- Secret, permission, destructive-action, and external-write boundaries.
- Memory v2 locking, evidence ownership, claims, briefs, and open-loop lifecycle.
- Ship-gate freshness and product-acceptance contracts where the product surface requires them.
- Isolated ownership for concurrent mutation and serialized integration.
- Decision records, `CONTEXT.md`, and repo artifacts as durable product truth.

### A.4 Remove or test

| Candidate | Treatment |
|---|---|
| Repeated lifecycle/memory prose | Remove in one pilot skill; compare identical tasks |
| GPT-5.4 role pins and fixed four-thread/depth-one policy | Replace with observed capability data and routing policy |
| Mandatory per-slice test-runner and reviewer | Ablate; retain only when evidence advantage justifies them |
| Universal counterpart review | Risk-trigger and measure unique blocker yield |
| Host identifiers inside shared skill bodies | Move to adapters |
| Lexical no-op ban as hard CI | Replace with advisory lint plus observable contract tests |
| Manual-only retro | Keep on-demand; design automatic structured events as a follow-on |

---

## Part B — Four-Layer Target Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. Portable skill contract                                  │
│    what + when, goal, authority, evidence, output, stop     │
├──────────────────────────────────────────────────────────────┤
│ 2. Harness capability adapter                               │
│    actual model/effort controls, agents, hooks, isolation   │
├──────────────────────────────────────────────────────────────┤
│ 3. Deterministic workflow controller                        │
│    TaskSpec, ledger, dependencies, gates, retries, proof    │
├──────────────────────────────────────────────────────────────┤
│ 4. Evaluation and routing policy                            │
│    task tier, effort, topology, verifier, budget, stop      │
└──────────────────────────────────────────────────────────────┘
```

Product identity, Memory v2, runtime state, and repo artifacts remain inputs or outputs around these layers. They are not additional prompt layers. Named roles are adapter aliases over capability packets, not part of the portable standard.

### B.1 Portable skill contract

Every portable skill follows the Agent Skills specification:

```yaml
---
name: build
description: Implements a known code change with proof-gated verification. Use when the user asks to build, add, change, or fix a known solution.
---
```

The description states both the capability and its trigger conditions. It does not summarize the internal workflow.

The activated body contains only behaviorally material fields:

```markdown
# Goal
# Enter / Skip
# Inputs and authority
# Success and stopping conditions
# Evidence and artifacts
# Decision rules
# Escalation statuses
# Side effects
```

Detailed checklists, examples, and runtime-specific instructions load from focused references only when required. Prefer fewer than 200 lines for hot skills; the formal compatibility ceiling remains under 500 lines. Size is a diagnostic, not a correctness gate.

### B.2 Harness capability adapter

Adapters must be machine-readable and backed by runtime evidence. Markdown documentation alone is insufficient.

Proposed files:

```text
adapters/
  codex.capabilities.json
  claude.capabilities.json
  grok.capabilities.json
  codex.md
  claude.md
  grok.md
protocol/schemas/
  host-capabilities.schema.json
  capability-packet.schema.json
```

Minimum capability record:

```json
{
  "schema_version": 1,
  "harness": "codex",
  "observed_at": "<timestamp>",
  "source": "session-metadata|runtime-probe|documented-only",
  "model": "<actual model or unknown>",
  "reasoning_effort": "<actual effort or unknown>",
  "model_override": false,
  "effort_override": false,
  "max_parallelism": 1,
  "max_depth": 0,
  "workspace_isolation": false,
  "resume": false,
  "hooks": [],
  "external_write_controls": []
}
```

Rules:

- `documented-only` capabilities cannot authorize a runtime topology without a live probe or explicit current-session surface.
- Unknown model or effort means routing cannot promise a cheaper or stronger child.
- If a child inherits a configuration disproportionate to the task, choose the root agent.
- Adapters translate semantic capability packets into host commands or tool calls.
- Shared skills never name `0th:verifier`, `0th_verifier`, `spawn_agent`, `ultra`, or `ultracode`.

Example capability packet:

```json
{
  "objective": "independently verify acceptance criteria",
  "mutation_scope": "read-only",
  "dependencies": ["verification-report/proof-result.json"],
  "evidence_advantage": "fresh context plus executable test access",
  "requested_effort": "proportionate",
  "budget": {"max_workers": 1, "max_rounds": 1},
  "output_schema": "review-findings.schema.json"
}
```

### B.3 Deterministic workflow controller

The controller owns what must survive model variation:

- `TaskSpec`: outcome, acceptance, non-goals, authority, proof tier, risk, and external-write permissions.
- Task/evidence ledger: current state, dependencies, attempts, evidence pointers, blockers, and next action.
- Proof contract/result, stack-minimum detection, ship gate, and product acceptance.
- Dependency-aware mutation ownership and serialized integration.
- Retry and escalation counters.
- Memory write-gate and open-loop lifecycle at meaningful boundaries.

Run repo and memory preflight once per root task, after meaningful repo drift, or after a freshness TTL. Nested skills and children receive paths to the current brief and ledger; they do not rerun the entire startup sequence automatically.

Allowed terminal or pause states:

```text
DONE
DONE_WITH_CONCERNS
BLOCKED
BLOCKED_REAL_ENV
BLOCKED_BY_SPEC
CONTRACT_INVALIDATED
SCOPE_EXPANSION_REQUIRED
FAIL_UNRESOLVED
FAIL_FLAKY
```

`CONTRACT_INVALIDATED` means new evidence falsified a locked assumption or acceptance criterion. `SCOPE_EXPANSION_REQUIRED` means completion requires materially broader authority. Neither may be converted into autonomous implementation.

External writes are explicit TaskSpec authority:

```json
{
  "authority": {
    "local_edits": true,
    "non_destructive_tests": true,
    "push_branch": false,
    "open_pr": false,
    "merge": false
  }
}
```

Repo instructions or an explicit user request may set `push_branch` or `open_pr`; merge remains false unless separately authorized.

### B.4 Evaluation and routing policy

The routing policy receives task facts and observed host capabilities. It does not use a fixed named-role matrix.

Task features:

- scope size and dependency depth;
- read-only versus mutable;
- decomposability and shared-state coupling;
- proof tier and consequence of failure;
- evidence advantage available to another context or model;
- latency and token budget;
- actual worker model, effort, isolation, and resume support.

Default:

1. Use one root agent.
2. Preserve explicit user/session model and effort pins.
3. If no pin exists, start at the host default or measured balanced setting.
4. Increase effort only after missing success, routing, dependency, or verification rules are ruled out.
5. Delegate only when the eligibility gate passes.

Delegation eligibility requires all of:

- a concrete independent work packet;
- no unsafe shared mutable state, or proven isolation;
- a useful evidence, context-isolation, or wall-clock advantage;
- observed host support for the requested topology;
- a bounded worker and round budget;
- an expected benefit worth the coordination and token cost.

No-spawn conditions include:

- routine lookup or inventory that fits the root context;
- ordered reasoning where each result determines the next step;
- one shared checkout with overlapping mutation ownership;
- unknown child model or effort when inheritance would be disproportionate;
- a reviewer with no independent evidence advantage;
- a task whose dominant latency is one nonparallelizable operation.

Supported topology classes:

| Topology | Eligibility |
|---|---|
| Single root | Default |
| Sequential handoff | Context replacement or specialist boundary with a typed receipt |
| Bounded map-reduce | Independent read-only branches plus root synthesis |
| Speculative trajectories | High-uncertainty reasoning with independently testable outputs |
| Isolated ticket DAG | Disjoint mutable slices, isolated workspaces, dependency-aware merge |

There is no portable “ultra fleet” setting.

---

## Part C — Operating Contracts

### C.1 Invocation and discovery

- Natural-language auto-routing is primary.
- Explicit skill invocation remains supported.
- Descriptions state what and when, with specific discovery keywords.
- Routing tests cover positive, negative, and ambiguous prompts.
- A missing or conflicting route falls back to the smallest applicable skill, not a mega-director.

### C.2 Autonomy

Before contract lock, clarify only requirements that cannot be recovered safely from code or evidence. After lock, execute local in-scope work without ceremonial pauses.

Pause only for a named state from B.3. Do not treat new evidence that invalidates the contract as ordinary implementation friction.

Inspection, review, diagnosis, and planning do not authorize implementation. Build/fix requests authorize scoped local edits and non-destructive validation. External writes require TaskSpec or repo-workflow authority.

### C.3 Proof and definition of done

DONE requires:

1. acceptance criteria satisfied;
2. required proof tier satisfied;
3. applicable stack minimums exercised;
4. surface-honest evidence for browser, UI, CLI, API, session-backed, or live behavior;
5. open loops closed or explicitly blocked;
6. required authority-respecting handoff completed;
7. compact evidence summary persisted.

Tests alone satisfy only T0. Unavailable required real environments produce `BLOCKED_REAL_ENV`, never a lower proof claim.

### C.4 Review and verification

Review is evidence-triggered, not role-triggered.

| Case | Default |
|---|---|
| Low-risk mechanical/docs change | Root check plus relevant deterministic tests |
| Testable logic change | Executable oracle; fresh reviewer only if risk or ambiguity warrants |
| Complex/high-risk change | Fresh verifier with explicit independent evidence advantage |
| Subjective product surface | Product acceptance using screenshots or live-flow evidence |
| Cross-model review | Only when historical or task-specific evidence predicts unique blocker value |

Record reviewer yield:

- unique blockers found;
- duplicates;
- false positives;
- fixes accepted;
- tokens and latency where available;
- added human review burden.

Generic disagreement is not proof. A verifier must own a distinct oracle, evidence surface, or clean-room acceptance path.

### C.5 Memory boundary

```text
Harness memory  -> ambient preferences and hints
0th Memory v2   -> workflow claims, incidents, open loops, briefs
Repo artifacts  -> decisions, vocabulary, code, tests, PR truth
```

Repo artifacts override Memory v2 for product and architecture decisions. Memory v2 overrides ambient host memory for workflow state. Do not dual-write the same decision.

Core migration keeps current Memory v2 behavior and shortens repeated startup prose. Scheduled maintenance, TTL classes, automatic incident extraction, and PR-driven loop closure belong to the separate memory-hygiene follow-on.

### C.6 Instruction quality

An instruction earns prompt space when it supplies at least one of:

- an observable invariant or forbidden action;
- a named command or artifact schema;
- a decision branch and outcomes;
- evidence, permission, output, or stopping criteria;
- a measured workaround for a current model failure.

Lexical phrases such as “ensure,” “carefully,” or “as needed” are not automatically invalid. A lint may report likely no-op language, but hard CI should assert observable contracts and formal skill validity rather than vocabulary.

---

## Part D — Evaluation Design

### D.1 Representative corpus

Create at least eight real or replayable tasks covering:

1. documentation or metadata-only edit;
2. tiny one-file implementation;
3. multi-file feature with ordered dependencies;
4. independently decomposable read-only research;
5. root-cause debugging;
6. refactor with broad test surface;
7. browser/UI or extension-like proof requirement;
8. architecture review or implementation plan.

Tag each task with size, dependency depth, decomposability, shared-state coupling, proof tier, evidence advantage, and risk.

### D.2 Baselines and variants

Run in this order:

| Variant | Purpose |
|---|---|
| A. Current workflow | Strongest existing baseline with current model and effort |
| B. Simplified root | Outcome-first skill, one agent, same model and effort |
| C. Adaptive effort | Same as B, one measured lower effort where host supports it |
| D. Adaptive delegation | Only tasks whose eligibility gate predicts benefit |
| E. Evidence-advantaged verifier | Only high-risk or independence-sensitive tasks |

Do not run every variant on every task when the topology is ineligible. Record the rejection reason.

Use both equal-resource and equal-wall-clock comparisons where feasible. Preserve task inputs, acceptance criteria, and proof requirements between variants.

### D.3 Metrics

- acceptance and proof PASS rate;
- critical and moderate defects escaping first pass;
- human rework minutes;
- unnecessary user stops;
- tool calls, tokens, latency, and worker count;
- duplicate exploration and conflicting edits;
- reviewer unique-blocker precision;
- blocked-state honesty;
- memory and open-loop side-effect correctness.

### D.4 Migration gate

Proceed beyond the pilot only when:

- correctness and proof honesty do not regress;
- unnecessary stops or context decrease materially;
- routing refuses ineligible fleets;
- capability records match actual runtime behavior;
- any added reviewer or worker demonstrates positive quality-adjusted value;
- no secret, authority, or external-write boundary regresses.

If the gate fails, keep the current workflow and retain only independently successful changes.

---

## Part E — Core Implementation Slices

### Slice 0 — Behavioral baseline and runtime capability inventory

**Goal:** Establish attribution before changing skill behavior.

- [ ] Create `docs/evals/2026-07-08-skills-kernel-baseline.md`.
- [ ] Define the tagged corpus from Part D.
- [ ] Record current skill size and duplicated-block inventory.
- [ ] Record actual root model and effort from runtime metadata where safely available.
- [ ] Probe whether child model/effort override, concurrency, nesting, isolation, resume, and hooks are actually exposed.
- [ ] Run Variant A on a representative subset and capture outcome metrics.
- [ ] Run the existing test suite.

**Acceptance:** Behavioral baseline, runtime capability evidence, and structural inventory exist before any skill migration.

### Slice 1 — Portable kernel and capability schema

**Goal:** Create the smallest shared contract without rewriting workflow behavior.

Add:

```text
protocol/
  README.md
  schemas/
    host-capabilities.schema.json
    capability-packet.schema.json
    task-spec.schema.json
    exit-status.schema.json
adapters/
  codex.capabilities.json
  claude.capabilities.json
  grok.capabilities.json
```

- [ ] Validate Agent Skills metadata with the formal validator.
- [ ] Add `0th capabilities --json` or an equivalent script entrypoint.
- [ ] Keep documented-only facts distinct from live observations.
- [ ] Add schema and fixture tests.
- [ ] Define one root-task preflight receipt and freshness rule.

**Acceptance:** The controller can read and validate actual capabilities; no shared skill body needs a host identifier.

### Slice 2 — Migrate `build` as the only pilot skill

**Goal:** Test the kernel on the highest-value path without a full rewrite.

- [ ] Rewrite the description to state what and when.
- [ ] Collapse repeated startup prose into the root-task preflight receipt.
- [ ] Keep proof, secret, authority, stack-minimum, and blocked-state invariants.
- [ ] Remove fixed model, thread, depth, and mandatory reviewer instructions from the portable body.
- [ ] Default to one root agent.
- [ ] Route optional capability packets through the adapter.
- [ ] Add `CONTRACT_INVALIDATED` and `SCOPE_EXPANSION_REQUIRED` behavior.
- [ ] Preserve current wrappers while they load the shared body and adapter.
- [ ] Add behavioral and contract tests before changing the skill text.

**Acceptance:** `build` is portable, capability-gated, and no less strict about proof or authority.

### Slice 3 — Controlled ablations and decision gate

**Goal:** Decide from evidence whether the pilot should expand.

Run identical pilot tasks after each isolated change:

1. simplified root prompt only;
2. root-task preflight receipt;
3. adaptive effort where supported;
4. adaptive delegation on eligible tasks only;
5. evidence-advantaged verifier on high-risk tasks only.

- [ ] Record rejected topology reasons.
- [ ] Record actual child model/effort, not requested profile names.
- [ ] Compare equal-resource and equal-wall-clock results where possible.
- [ ] Update the decision record with pass/fail evidence.

**Acceptance:** The migration gate in D.4 passes. Otherwise stop broad migration.

### Slice 4 — Migrate `think`, `debug`, and `ship`

**Goal:** Extend the proven contract to the remaining hot paths.

- [ ] `think`: remain read/design-only; lock a contract only after material ambiguity is resolved.
- [ ] `debug`: root-cause evidence before fixes; model chooses investigation path.
- [ ] `ship`: preserve proof freshness and external-write authority; merge stays human-default.
- [ ] Remove ceremonial pauses after contract lock.
- [ ] Preserve invalidation and scope-expansion stops.
- [ ] Make review risk/evidence-triggered rather than mandatory by role.
- [ ] Rerun the same ablation corpus after each skill migration.

**Acceptance:** Hot paths pass the migration gate independently; no grouped pass hides a regression.

### Slice 5 — Remaining skills, wrappers, and routing

**Goal:** Apply the proven kernel across the full set.

- [ ] Migrate `plan`, `research`, `deep-research`, `retro`, `improve-architecture`, and `zoom-out`.
- [ ] Keep research single-agent when retrieval and synthesis fit the root task.
- [ ] Use bounded parallel research only for independent source buckets that justify the cost.
- [ ] Remove fixed permanent roles from shared bodies; adapters map capability packets.
- [ ] Rewrite descriptions to what-plus-when and add positive/negative routing fixtures.
- [ ] Validate all skills against the formal Agent Skills format.
- [ ] Keep Codex and Claude wrappers thin; do not invent a shared plugin manifest.

**Acceptance:** All portable skill bodies are host-clean and routing behavior is proven, not inferred from descriptions alone.

### Slice 6 — Release proof and cleanup

**Goal:** Remove superseded machinery only after the new path proves itself.

- [ ] Run the complete corpus and repository suite.
- [ ] Delete duplicated lifecycle blocks only after receipt-based preflight passes.
- [ ] Retire redundant dispatch registries only after adapter parity is proven.
- [ ] Measure final skill sizes, routing, cost, latency, reviewer yield, and proof outcomes.
- [ ] Write `docs/evals/2026-07-08-skills-kernel-dogfood.md`.
- [ ] Update README and shared instructions.
- [ ] Refresh and smoke-test the installed plugin cache as part of the same deliverable.
- [ ] Mark the decision active and durable only if D.4 passes.

**Acceptance:** Final evidence supports the migration; source and installed plugin behavior match.

---

## Part F — Explicit Follow-On Programs

These do not block the core migration.

### F.1 Memory hygiene automation

Design separately after the kernel stabilizes:

- consume structured controller events, not free-form “user correction detected” guesses;
- stage candidate incidents before durable promotion;
- require evidence pointers, deduplication, and idempotent locks;
- never delete or rewrite durable decisions automatically;
- measure sediment, false positives, missed incidents, and startup noise;
- add scheduled maintenance only after dry-run evidence.

### F.2 Optional factory mode

Build only if eligible tasks show value beyond the root baseline:

- explicit or routing-approved activation;
- observed model and effort controls;
- bounded workers and rounds;
- isolated workspaces for mutation;
- typed findings and serialized integration;
- positive quality-adjusted cost in the eval corpus.

### F.3 Multi-host conformance

After Codex proves the kernel:

- run the same portable skill fixtures on Claude and Grok;
- preserve client-specific packaging and hooks in adapters;
- report unsupported capabilities instead of simulating equivalence;
- do not treat “loads successfully” as behavioral conformance.

---

## Part G — File-Level Map

| Current | Target action |
|---|---|
| `skills/*/SKILL.md` | Portable outcome and evidence contracts; what-plus-when descriptions |
| `codex-skills/*/SKILL.md` | Thin wrappers that load shared body and observed Codex adapter |
| `agents/*.md` | Host adapter aliases or generated role material; not portable truth |
| `.codex/agents/*.toml` | Codex adapter material; remove fixed policy only after evaluation |
| `references/codex-dispatch-profiles.md` | Supersede with capability records after parity proof |
| `references/skill-memory-block.md` | Replace with root-task preflight receipt after pilot proof |
| `references/workflow-verification.md` | Keep deterministic handoff and proof contracts |
| `references/proof-tiers.md`, `stack-minimums.md` | Keep as controller evidence policy |
| `scripts/memory*.mjs`, `ship-gate.mjs` | Keep; expose through short CLI only when behavior remains identical |
| `scripts/skill-block-sync.mjs` | Retire only after duplicated block removal is proven |
| `README.md`, `CLAUDE.md`, `AGENTS.md` | Point to the kernel and routing policy; avoid duplicating skill bodies |

---

## Part H — Testing Strategy

| Layer | Evidence |
|---|---|
| Formal format | Agent Skills validation, metadata and reference-link checks |
| Adapter | JSON schema, probe fixtures, stale/unknown capability rejection |
| Controller | TaskSpec authority, exit states, proof gates, dependency and retry tests |
| Routing | Positive, negative, ambiguous, and no-spawn fixtures |
| Behavioral | Part D corpus on identical inputs and acceptance criteria |
| Cost | Actual model/effort, workers, tokens, latency, and duplicate work |
| Review | Unique blocker precision and human re-review burden |
| Real environment | Existing proof tiers and stack minimums |

Lexical no-op lint is advisory. Hard CI validates formal structure and observable contracts.

---

## Part I — Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Simplification removes a load-bearing rule | One-variable ablations and identical task replay |
| Runtime cannot honor requested worker settings | Capability probe; root-agent fallback |
| Routing still overspawns | Explicit eligibility and no-spawn tests; cost metrics |
| Fresh review becomes ceremony | Require evidence advantage and measure unique blocker yield |
| Autonomy continues after assumptions fail | `CONTRACT_INVALIDATED` and `SCOPE_EXPANSION_REQUIRED` |
| Adapter docs drift from runtime | `observed_at`, source classification, and stale-capability rejection |
| Slim skills stop auto-triggering | What-plus-when descriptions and routing fixtures |
| Memory automation creates sediment | Separate follow-on with candidate staging and precision metrics |
| Broad migration obscures regressions | Pilot `build`, gate, then migrate one hot skill at a time |

---

## Part J — Program Success Criteria

1. The strongest single-agent baseline is recorded before redesign behavior changes.
2. Routine tasks do not spawn workers merely because a workflow phase says so.
3. Actual child model and effort are known before cost-sensitive delegation, or delegation is rejected.
4. Portable skills conform to the what-plus-when Agent Skills discovery contract.
5. No host identifiers or topology commands appear in shared skill bodies.
6. Hot skills use less context without regressing correctness, proof, secrets, or authority.
7. Fleets run only on eligible work and show positive quality-adjusted value.
8. Verifiers and counterpart reviews run only with an evidence or risk advantage and demonstrate useful yield.
9. Contract invalidation and scope expansion stop autonomous execution honestly.
10. The final source tree and installed plugin cache pass the same smoke checks.

---

## Part K — Open Questions and Defaults

| Question | Default until measured |
|---|---|
| Balanced root effort | Preserve current session pin; otherwise use host default |
| Lower-effort workers | Allowed only when host control is observed and evals preserve quality |
| Factory activation | Disabled during core migration |
| Cross-model review | Off for routine work; risk-triggered experiment only |
| Automatic PR creation | Only with TaskSpec or repo-workflow authority |
| Merge | Human approval required |
| Memory automation | Separate follow-on |
| Pi adapter | Do not create until a real host needs it |

**Next action:** execute Slice 0 only. Do not scaffold the protocol, rewrite skills, or build factory mode until the behavioral baseline and runtime capability inventory exist.
