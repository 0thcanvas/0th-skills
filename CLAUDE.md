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
| `/deep-research` | Research loop for hard problems | Impossible-seeming features, cross-domain research, feasibility analysis |

## Principles

- **5-15 line decision records, not 300-line specs.** The human reviews code, not documents.
- **Branch per feature, PR to land.** Always. The PR is the inspection point.
- **TDD for testable work, before/after for everything else.** No code without verification.
- **Verification before shipping.** After all slices pass, the verifier exercises the feature as a real user. Only PASS proceeds to /ship.
- **Cross-model review.** The host model writes; the counterpart model reviews (nit/suggestion/blocker). Counterpart is determined by `~/.0th/reviewer-config.json`. Default: Claude→Codex, Codex→Claude.
- **Scale to uncertainty.** Low uncertainty = /build. Medium = /think then /build. High = /think with divergent design exploration.
- **Write decisions, not specs.** Decision records always persist to docs/decisions/. Plans are optional.
- **Root cause before fixes.** 3 failed hypotheses = stop and escalate.
- **Session resumption is explicit.** Every skill checks KB + git log + open decisions when starting a new session.
- **Research is source-aware.** Use official docs, GitHub, papers, and direct source search, not one generic web query.
- **Agent manifests are host-native.** Claude-side manifests live in `agents/*.md`, while Codex subagents use TOML under `.codex/agents/`.
- **Shared behavior changes must update both hosts.** If a mirrored agent's behavior changes, update both `agents/*.md` and `.codex/agents/*.toml` in the same slice unless the difference is intentionally host-specific.
- **Asymmetry must be explicit.** If an agent exists on only one host, document that in `README.md` and keep `tests/agent-parity.test.mjs` aligned with the intentional exception.
- **Codex runtime policy is part of the product.** If a change affects subagent orchestration or safety assumptions, update `.codex/config.toml` too rather than relying on user defaults.
- **Use the host-native research agent.** Claude-hosted research uses `0th:web-researcher`; Codex-hosted research uses `0th_researcher`.
- **Do not duplicate Claude built-ins without a strong reason.** For read-only code mapping on Claude, prefer the built-in `Explore` agent instead of creating a custom 0th mirror.
- **Cross-model review is script-driven.** A single `counterpart-companion.mjs` auto-detects the host and loads the appropriate driver.
- **Cross-model review uses a generic helper.** `ask-counterpart-review` replaces the old `ask-codex-review` and `ask-claude-review` (deprecated shims, removed next release).
- **Cross-model review details live in `README.md`.** Use that as the authoritative reference for bridge-helper behavior and state handling.
- **KB behavior is editor-agnostic.** If a project uses a knowledge base, follow its configured root and the markdown-first protocol in `PROTOCOL.md`; do not assume Obsidian.

## Design Philosophy

Prefer deep modules (small interface, significant implementation) over shallow ones.
Prefer vertical slices (end-to-end through all layers) over horizontal (one layer at a time).
Prefer behavioral contracts over file-path references in specs and plans.

## Knowledge Base

Some projects keep a markdown knowledge base alongside code and docs. When a project mentions a KB:

- Resolve the KB root in this order: `KB_ROOT`, then project instructions, then a one-time human prompt
- Read the KB root `index.md` at session start
- Read the repo's or project's KB instructions before writing
- Follow the editor-agnostic KB protocol in `PROTOCOL.md`
- Do not assume the human is using Obsidian, even if their KB can be viewed there
- If you had to ask for the KB location, recommend persisting it via `KB_ROOT` or project instructions

## Skill Routing

When the user's request matches a skill, invoke it. Key mappings:
- New feature, "how should we build this", brainstorming → /think
- Break this down, implementation plan → /plan
- Build, implement, add, create, fix (known solution) → /build
- Bug, broken, error, "why is this", investigate → /debug
- Ship, PR, merge, land, deploy → /ship
- Research, compare tools, look up papers, evaluate APIs, "search the web" → /research
- Deep research, "is this possible", feasibility study, reverse-engineer feature, cross-domain → /deep-research
