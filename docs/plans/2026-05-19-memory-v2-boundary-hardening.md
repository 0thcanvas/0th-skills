# Memory v2 Boundary Hardening Plan

**Decision:** [Memory v2 Boundary Hardening](../decisions/2026-05-19-memory-v2-boundary-hardening.md)
**Slices:** 7

## Architecture

- Project identity: distinguish an actual repo root from a workspace folder, and make non-repo startup a structured advisory rather than a raw Git failure.
- Evidence ownership: every evidence pointer resolves against an explicit owner context (`owner_project_key` plus recorded project root/identity, evidence id, absolute path, or source-pack id), not the agent's current directory by accident.
- Evidence lifecycle: missing evidence reports can recognize normal source moves and propose source-backed repair without silently rewriting claims.
- Incident bridge: `/retro` remains the incident taxonomy owner; Memory v2 imports only aggregate patterns or selected durable lessons.
- Diagnostics: startup and maintenance report partial readiness by subsystem so agents know what is usable and what degraded.

## Slices

### 1. Workspace Preflight Advisory
Non-repo startup returns a structured advisory that names candidate child repos and the state path it would otherwise use.
- [x] Running preflight from a workspace folder no longer ends with only a raw `git rev-parse` failure.
- [x] The advisory distinguishes "not a repo" from dirty, divergent, missing-upstream, or fetch-failed repo states.
- [x] Runtime identity for existing real repos is unchanged.

### 2. Evidence Owner Resolution
Claims and evidence resolve relative pointers through explicit owner context before falling back to the current working directory.
- [x] Project-local relative evidence still resolves for existing project claims.
- [x] Global claims with project-owned relative evidence do not become missing merely because the current agent is in another repo.
- [x] New global/project claims can record the owner context needed to resolve relative evidence later.
- [x] Maintenance output shows the resolved owner context for missing or degraded evidence.

### 3. Evidence Relocation Repair
Maintenance recognizes source lifecycle moves and reports repair actions instead of treating archived evidence as lost.
- [x] A raw-note pointer moved into an archived/raw location is reported as relocatable using the owner context from Slice 2, not the current cwd.
- [x] Apply mode performs only source-backed lifecycle or pointer updates and records the repair action.
- [x] Missing evidence with no known relocation remains a visible `needs_review` condition.

### 4. Retro Incident Import
Memory v2 can import recurring `/retro` patterns into the generated brief without redefining incident capture.
- [x] Existing incident logs produce Memory v2 `incident` claims or brief entries when buckets cross the retro threshold.
- [x] Imported incident summaries cite incident files but do not copy correction-evidence bodies into runtime claims.
- [x] Import reads only frontmatter and aggregate bucket metadata; tests cover that correction-evidence bodies are not copied into claims or briefs.
- [x] Re-running the import is idempotent and does not inflate pattern counts.

### 5. Readiness And Drift Diagnostics
Doctor and maintenance report boundary health as separate subsystems instead of one ambiguous ready/not-ready bit.
- [x] Readiness distinguishes project claims, project tasks, global claims, evidence files, source packs, and repo state.
- [x] Missing source packs do not imply ordinary claim recall is unavailable.

### 6. Instruction And Local-Artifact Hygiene
Maintenance surfaces instruction drift and generated local log noise without treating them as ordinary repo dirt.
- [x] Instruction drift between workspace/project instructions and the shared Memory v2 block is reported with the conflicting files.
- [x] Generated local logs such as `error.log` are either routed to runtime state or reported with an ignore/move recommendation.
- [x] The check is advisory and does not block normal memory recall.

### 7. Boundary Runtime Eval
Executable fixtures cover the boundary-hardening behavior end to end.
- [x] Runtime eval covers non-repo advisory, cross-repo global evidence resolution, raw-to-archived relocation, incident import, partial readiness, and instruction/local-artifact hygiene.
- [x] The prior 11 Memory v2 runtime fixtures still pass.
- [x] A dogfood report can show whether startup recall needed legacy KB fallback after the boundary fixes.
