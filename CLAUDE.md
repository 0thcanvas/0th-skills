# 0th Skills

Lightweight development workflow for solo builders using Claude Code + Codex.

## Skills

| Skill | Purpose | When |
|---|---|---|
| `/think` | Turn idea into decision | New features, design uncertainty |
| `/plan` | Break into vertical slices | Multi-session work, ordering matters (optional) |
| `/build` | Implement with TDD | Always — the default |
| `/debug` | Root cause then fix | Something is broken |
| `/ship` | PR and land | Code is ready |
| `/research` | Source-aware external research | Product, API, OSS, and paper research outside the repo |

## Principles

- **5-15 line decision records, not 300-line specs.** The human reviews code, not documents.
- **Branch per feature, PR to land.** Always. The PR is the inspection point.
- **TDD for testable work, before/after for everything else.** No code without verification.
- **Cross-model review.** The host model writes; the counterpart model reviews (nit/suggestion/blocker). Claude-hosted runs use Codex review. Codex-hosted runs use Claude review.
- **Scale to uncertainty.** Low uncertainty = /build. Medium = /think then /build. High = /think with divergent design exploration.
- **Write decisions, not specs.** Decision records always persist to docs/decisions/. Plans are optional.
- **Root cause before fixes.** 3 failed hypotheses = stop and escalate.
- **Session resumption is explicit.** Every skill checks KB + git log + open decisions when starting a new session.
- **Research is source-aware.** Use official docs, GitHub, papers, and direct source search, not one generic web query.
- **Agent manifests are host-native.** Claude-side manifests live in `agents/*.md`, while Codex subagents use TOML under `.codex/agents/`.
- **Cross-model review is script-driven.** The counterpart review helpers invoke the other CLI directly instead of relying on shared subagent manifests.
- **Cross-model review helpers are named by target.** `ask-codex-review` means "ask Codex to review", not "Codex-native manifest".

## Design Philosophy

Prefer deep modules (small interface, significant implementation) over shallow ones.
Prefer vertical slices (end-to-end through all layers) over horizontal (one layer at a time).
Prefer behavioral contracts over file-path references in specs and plans.

## Skill Routing

When the user's request matches a skill, invoke it. Key mappings:
- New feature, "how should we build this", brainstorming → /think
- Break this down, implementation plan → /plan
- Build, implement, add, create, fix (known solution) → /build
- Bug, broken, error, "why is this", investigate → /debug
- Ship, PR, merge, land, deploy → /ship
- Research, compare tools, look up papers, evaluate APIs, "search the web" → /research
