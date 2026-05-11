# Working Artifacts Lifecycle Plan

**Decision:** [Working Artifacts Lifecycle](../decisions/2026-05-11-working-artifacts-lifecycle.md)
**Slices:** 4

## Architecture

- Artifact lanes: Memory v2 is compact agent record, repo docs are promoted durable evidence, and working artifacts are state-root temporary scaffolding.
- State root: temporary `work/` and `artifacts/` paths follow the existing 0th state-root resolution instead of hardcoding a home directory.
- Verification exception: gate-consumed evidence remains checkout-local under the verification report directory until a separate migration changes `/build`, `/ship`, and ship-gate together.
- Lifecycle actions: current, compact, supersede, and delete are report-first maintenance decisions; deletion of cited docs requires replacement evidence.

## Slices

### 1. Shared Contract
Define the working-artifact lifecycle as a shared reference that every skill can point to.
- [ ] Acceptance criterion: the reference names the three lanes, state-root placement, verification-report exception, and current/compact/supersede/delete choices.
- [ ] Acceptance criterion: the reference explicitly says drafts and HTML artifacts are not agent truth, while aligned decisions and gate evidence keep their current contracts.

### 2. Skill Prompt Wiring
Teach the affected skills when to use the shared contract without changing their existing hard requirements prematurely.
- [ ] Acceptance criterion: planning, research, deep research, build, debug, and ship prompts reference the shared contract where they create drafts, reports, explainers, or cleanup handoffs.
- [ ] Acceptance criterion: `/think` keeps writing aligned decision records to repo docs while distinguishing pre-alignment drafts from promoted decisions.

### 3. Maintenance Guidance
Add report-first cleanup guidance for stale docs and deleted or revamped features.
- [ ] Acceptance criterion: maintenance language tells agents to report stale repo-doc candidates before destructive cleanup.
- [ ] Acceptance criterion: docs for deleted/replaced features require compaction, supersession, or tombstone evidence before removing cited source files.

### 4. Guardrails
Add tests and generated wrapper updates so the policy does not drift across published skill surfaces.
- [ ] Acceptance criterion: tests fail if the shared reference is missing or core skill prompts lose required working-artifact lifecycle language.
- [ ] Acceptance criterion: Codex wrappers are regenerated if shared skill files change, and targeted metadata tests pass.
