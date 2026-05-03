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
| `/improve-architecture` | Find deepening opportunities | Periodic — codebase feels tangled, post-sprint cleanup |
| `/zoom-out` | Higher-level map of unfamiliar code | User-triggered only — invoke explicitly when lost in a code area |

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
- **Secret values stay outside agents.** Agents may handle secret names, environment variable names, and secret-manager references, but not resolved secret values. Code should read secrets from environment variables or runtime bindings, while a human-owned secret runner injects values into the target process.

## Secret Handling Contract

The default local pattern is a secret-reference env file plus a runner that resolves values only inside the child process:

```env
SERVICE_API_KEY=op://vault-name/item-name/field-name
```

```bash
op run --env-file .env.1password -- <command>
```

This is an example, not a hard dependency on 1Password. If a project uses another manager, use the equivalent non-printing runner or runtime injection path: Doppler `doppler run -- <command>`, Vault Agent or platform-injected env, AWS/GCP/Azure secret-to-runtime bindings, deployment-platform secrets, or a human-created ignored `.env.local` loaded by the app. The invariant is the same: the agent sees names/references only; the target process receives values.

Rules:
- Do not run commands that reveal secret values: `op read`, `op item get --reveal`, `op inject` to stdout, `op run --no-masking`, `printenv`, `env`, `set`, or shell tracing around secrets.
- Do not place secrets in argv, SQL strings passed on the command line, browser/CDP payloads, screenshots, logs, HARs, or counterpart-review prompts.
- Verify presence without disclosure, for example by checking that a named env var is set and reporting only set/missing.
- If no safe secret runner is configured, stop and ask the human to provide one or to run the secret-dependent command themselves. Do not fall back to printing or pasting the secret.
- Treat any secret that may have appeared in chat, tool output, shell history, command argv, browser/network traces, or logs as compromised and recommend rotation.

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
- "Codebase feels tangled", "where would refactoring pay off", post-sprint cleanup → /improve-architecture
- /zoom-out is user-triggered only (not implicitly invoked)
