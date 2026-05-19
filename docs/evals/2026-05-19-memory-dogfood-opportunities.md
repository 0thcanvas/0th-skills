# Memory Dogfood Opportunities

Date: 2026-05-19
Scope: 0th Canvas workspace plus the 0th-skills Memory v2 runtime.

## Verified Signals

- `memory.mjs runtime-eval` from `/Users/mini/0thcanvas/skills` passed all 11 fixtures: recall/expand, stale sync, manual HEAD drift, open-loop resume, user correction retention, global recall, conflict surfacing, source-pack fidelity, stale global maintenance, no-Obsidian dependency, and abstention.
- The 0th-skills project memory brief is usable and small, but the open-loop brief still carries a P1 dogfood item: record cases where startup recall, repo preflight, open-loop tracking, stale-memory maintenance, or write-gate behavior is missing or noisy.
- Running Memory v2 from `/Users/mini/0thcanvas` fails repo preflight because the workspace root is not a git repo, while running from `/Users/mini/0thcanvas/skills` succeeds. The workspace-root case is common enough that Memory v2 should either explain the project/root mismatch better or help the agent choose an actual repo.
- The workspace `AGENTS.md` still instructs agents to read the markdown KB index at every session start, while the 0th-skills memory block says Memory v2 runtime is canonical and markdown is fallback/source evidence. That instruction drift can make agents do manual KB browsing before generated recall.
- `memory maintain` from the workspace found claims whose evidence paths point at raw KB files that were later moved to `raw/archived/`. Evidence pointers are currently brittle across KB compile/archive moves.
- `memory maintain` from the skills repo found a global claim with a relative evidence path that is missing when checked from the skills cwd. Global claims need either absolute evidence paths, owner project roots, or source-pack-backed pointers.
- The learning incident log contains recurring `verification-skipped` entries, but generated Memory v2 briefs still show "Recurring Incidents: None recorded." Retro incident aggregation is not yet feeding the runtime memory brief.
- `memory doctor` reports `global_source_index_file_exists: false` even when recall is otherwise ready. The readiness output could distinguish "source packs unavailable" from "recall unavailable."
- The skills repo is dirty only because of an untracked `error.log` containing backend/auth telemetry. Tool/runtime logs should live in the state root or be ignored so repo preflight noise stays meaningful.

## Candidate Iterations

1. Add a non-git workspace preflight path that reports child git repos and recommends the likely project cwd instead of stopping at raw `git rev-parse` failure.
2. Add a memory instruction drift check covering root `AGENTS.md`/`CLAUDE.md`, project instructions, and the shared `skill-memory-block.md`.
3. Add evidence relocation handling for KB raw-to-archived moves: tombstone, relocation index, or a maintenance action that rewrites source-backed pointers safely.
4. Give global memory records a stable source ownership model so relative evidence paths are resolved against the producing project, not the current cwd.
5. Promote `/retro` incident aggregation into Memory v2 recurring-incident claims or brief sections.
6. Split `doctor` readiness into project claims, tasks, global claims, source packs, and evidence so partial readiness is not reported as a single ambiguous boolean.
7. Move generated tool logs such as `error.log` to Memory v2 state, or add an ignore rule if they are expected local artifacts.

## Sources

- `docs/plans/2026-05-10-memory-v2-runtime-hardening.md`
- `docs/evals/2026-05-11-global-memory-v2-dogfood.md`
- `docs/evals/2026-05-10-memory-backend-eval.md`
- `references/memory-contract.md`
- Runtime commands run on 2026-05-19: `memory.mjs preflight`, `brief`, `task-brief`, `doctor`, `maintain`, `recall`, and `runtime-eval`.
