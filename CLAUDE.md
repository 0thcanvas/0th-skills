# 0th Skills

Lightweight development workflow for solo builders using Codex, Antigravity, and Claude Code where still needed.

## Skills

| Skill | Purpose | When |
|---|---|---|
| `/think` | Turn idea into decision | New features, design uncertainty |
| `/plan` | Break into vertical slices | Multi-session work, ordering matters (optional) |
| `/build` | Implement with TDD | Always — the default |
| `/debug` | Root cause then fix | Something is broken |
| `/ship` | PR and land | Code is ready |
| `/research` | Source-aware external research | Product, API, OSS, and paper research outside the repo |
| `/deep-research` | Budgeted research loop | Explicit world models, contradiction analysis, reusable surveys, or experiments |
| `/improve-architecture` | Find deepening opportunities | Periodic — codebase feels tangled, post-sprint cleanup |
| `/retro` | Capture user corrections + agent misfires | End of session, when the agent was corrected ≥ once |

## Principles

- **5-15 line decision records, not 300-line specs.** The human reviews code, not documents.
- **Branch per feature, PR to land.** Always. The PR is the inspection point.
- **TDD for testable work, before/after for everything else.** No code without verification.
- **Verification before shipping.** After all slices pass, the root exercises the required proof; a separate verifier is used only when it has an independent evidence advantage. Only PASS proceeds to /ship.
- **Review is risk-triggered.** Counterpart review runs only when a fresh context or distinct model has a named evidence advantage. The configured route remains in `~/.0th/reviewer-config.json` for those cases.
- **Scale to uncertainty.** Low uncertainty = /build. Medium = /think then /build. High = /think with divergent design exploration.
- **Write decisions, not specs.** Decision records always persist to docs/decisions/. Plans are optional.
- **Root cause before fixes.** 3 failed hypotheses = stop and escalate.
- **One root-task kernel.** Every skill applies `references/skills-kernel.md` once per root task for Memory v2 preflight, authority, capability gating, safety, and closeout. Nested phases reuse the receipt.
- **Research is source-aware.** Use official docs, GitHub, papers, and direct source search, not one generic web query.
- **Agent manifests are host-native.** Claude-side manifests live in `agents/*.md`, while Codex subagents use TOML under `.codex/agents/`.
- **Shared behavior changes must update both hosts.** If a mirrored agent's behavior changes, update both `agents/*.md` and `.codex/agents/*.toml` in the same slice unless the difference is intentionally host-specific.
- **Asymmetry must be explicit.** If an agent exists on only one host, document that in `README.md` and keep `tests/agent-parity.test.mjs` aligned with the intentional exception.
- **Codex runtime policy is part of the product.** If a change affects subagent orchestration or safety assumptions, update `.codex/config.toml` too rather than relying on user defaults.
- **Research stays single-root by default.** Independent source packets delegate only through a fresh capability record and a concrete evidence or latency advantage.
- **Do not duplicate Claude built-ins without a strong reason.** For read-only code mapping on Claude, prefer the built-in `Explore` agent instead of creating a custom 0th mirror.
- **Cross-model review is script-driven.** A single `counterpart-companion.mjs` auto-detects the host and loads the appropriate driver (`codex`, `claude`, or `agy`).
- **Cross-model review uses a generic helper.** `ask-counterpart-review` replaces the old `ask-codex-review` and `ask-claude-review` (deprecated shims, removed next release).
- **Cross-model review details live in `README.md`.** Use that as the authoritative reference for bridge-helper behavior and state handling.
- **KB behavior is editor-agnostic.** Memory v2 runtime is the canonical agent recall path. If a project uses a markdown knowledge base, follow its configured root and the compatibility protocol in `PROTOCOL.md`; do not assume Obsidian.
- **Secret values stay outside agents.** Agents may handle secret names, environment variable names, and secret-manager references, but not resolved secret values. Code should read secrets from environment variables or runtime bindings, while a human-owned secret runner injects values into the target process.
- **Browser identity is exact.** Apply `references/browser-control-policy.md`: Chrome means `/Applications/Google Chrome.app` with Browser Kit profile `agent`; Brave is personal and eligible only when the operator explicitly requests Brave. Chrome for Testing or managed Chromium may run only for explicitly hermetic automation and never substitute for real-environment proof.
- **Browser Kit manages real-browser sessions.** Browser Kit is the managed wrapper around `bb-browser`; use real Chrome with `browser-kit session open --provider chrome --profile agent` for logged-in, shared-tab, real-profile, extension, anti-bot, and user-environment proof. Before opening or navigating, check/list existing Chrome tabs and reuse a matching logged-in session when possible. `browser_open` requires an existing tab; use `browser_tab_new` only when intentionally creating a fresh tab. Run `browser-kit mcp status` before relying on `browser_*` tools. If OpenCLI Browser Bridge or another tool owns `localhost:19825`, move Browser Kit with `--cdp-port <port> --daemon-port <port>` or `BROWSER_KIT_CDP_PORT` / `BROWSER_KIT_DAEMON_PORT` instead of killing the other tool by default.
- **Session-backed source ladder.** For login-gated, anti-bot, or session-sensitive research and proof surfaces, prefer OpenCLI read adapters when one exists, then Browser Kit/BB Browser real Chrome, then computer-use only when a real UI path is required. A blocked generic fetch, challenge page, CAPTCHA, verification page, 403/429, login wall, or Browser Kit daemon/MCP startup failure is not negative source evidence. Attempt the documented Browser Kit status/install/session-open recovery once when safe, then retry or move to the next available session-backed path; if none works, record `challenge_or_session_blocked` or `adapter_unavailable` with the exact blocker.
- **Specialist routing stays under 0th.** 0th remains the workflow orchestrator. Specialist plugins and tools are capability adapters: route at the capability/workflow boundary, let plugin-owned workflows run internally, and validate returned evidence through `references/specialist-routing.md` before advancing proof, product acceptance, or ship gates.
- **Workflow Verification.** Use `references/workflow-verification.md` to keep long context bounded
  with `context_handoff`, require ship-bound proof artifacts with `proof_contract_required`, report
  unavailable real environments as `blocked_real_env`, and close skipped verification or unfinished
  work through `retro_open_loop_closeout`.

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
- Do not run commands that reveal secret values: `op read`, `op item get --reveal`, `op inject` to stdout, `op run --no-masking`, `printenv`, `env`, `set`, or shell tracing (`set -x`, `bash -x`) around secrets.
- Do not place secrets in argv, SQL strings passed on the command line, browser/CDP payloads, screenshots, logs, HARs, or counterpart-review prompts.
- Verify presence without disclosure. Use `[ -n "${SERVICE_API_KEY:-}" ] && echo "SERVICE_API_KEY: set" || echo "SERVICE_API_KEY: missing"`. Run only with shell tracing off — `set -x` / `bash -x` would expand the test and leak the value. Do not `echo "$SERVICE_API_KEY"` or `printenv SERVICE_API_KEY`.
- If no safe secret runner is configured, stop and ask the human to provide one or to run the secret-dependent command themselves. Do not fall back to printing or pasting the secret.
- Treat any secret that may have appeared in chat, tool output, shell history, command argv, browser/network traces, or logs as compromised and recommend rotation.

## Design Philosophy

Prefer deep modules (small interface, significant implementation) over shallow ones.
Prefer vertical slices (end-to-end through all layers) over horizontal (one layer at a time).
Prefer behavioral contracts over file-path references in specs and plans.

## Knowledge Base

Memory v2 runtime is the canonical agent recall path: read the global/project memory briefs, compact
recall results, and open-loop brief before browsing markdown notes. Some projects keep a markdown
knowledge base alongside code and docs; treat it as optional source material, import/export storage,
or human-rendered evidence rather than the primary memory interface. When a project mentions a KB:

- Resolve the KB root in this order: `KB_ROOT`, then project instructions, then a one-time human prompt
- Read the KB root `index.md` only after Memory v2 runtime recall does not answer, or when a skill explicitly needs the markdown source
- Read the repo's or project's KB instructions before writing
- Follow the editor-agnostic compatibility protocol in `PROTOCOL.md`
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
- Explicit multi-pass world model, contradiction analysis, reusable survey, or feasibility experiment → /deep-research
- "Codebase feels tangled", "where would refactoring pay off", post-sprint cleanup → /improve-architecture
- "Log a retro", "capture this session's misfires", "process the corrections from this session" → /retro
