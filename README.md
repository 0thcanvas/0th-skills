# 0th Skills

Lightweight development workflow for solo builders using Claude Code and Codex.

## Skills

- `think` — turn an idea into a short decision record
- `plan` — break a decision into vertical slices
- `build` — implement with TDD on a feature branch
- `debug` — investigate root cause before fixing (includes a 10-way feedback-loop ladder)
- `ship` — review and land through a PR
- `research` — run source-aware research across docs, GitHub, papers, and the broader web
- `deep-research` — multi-phase research loop for hard or impossible-seeming problems: feasibility, decision, and survey modes; uses a `KB_ROOT`-backed research workspace as persistent external memory; orchestrates host-native research plus synthesis and experiment agents through 8 phases
- `improve-architecture` — find deepening opportunities in a codebase using Module/Interface/Depth/Seam vocabulary plus the deletion test; run periodically, not per-feature
- `zoom-out` — user-triggered micro-skill: ask the agent to step up a layer of abstraction and map an unfamiliar code area (not implicitly invoked)

`think / plan / build / debug / ship` remain the core workflow. `research` and `deep-research` are supporting capabilities the core skills can invoke when the answer lives outside the repo. `improve-architecture` is a periodic structural-quality skill; `zoom-out` is a user-driven utility.

## Project Vocabulary (`CONTEXT.md`)

When a project accumulates domain jargon, keep a `CONTEXT.md` at its root: a tight glossary of canonical terms, *avoid* aliases, key relationships, and flagged ambiguities. The implementer and reviewer subagents re-derive vocabulary every time they spawn — `CONTEXT.md` collapses that overhead and keeps naming consistent across files, tests, and decision records.

- **Domain only.** Concepts unique to this project. General programming terms (timeouts, retries, error types) don't belong even if used heavily.
- **Lazy creation.** Writes happen only at decision-capture time. `/think` writes in Step 4 (Decide) and `/improve-architecture` writes in Step 5 (Hand off), both alongside the decision record. Never mid-grill — design conversations don't silently mutate the repo.
- **Format.** Bold term, one-line definition, `_Avoid_:` line listing rejected aliases. Group with `## Language`, `## Relationships`, `## Flagged ambiguities`.
- **Multi-context repos.** Place `CONTEXT-MAP.md` at the root linking to per-context `CONTEXT.md` files inside each module. Most projects need only the single root file.

`/think`, `/build`, `/debug`, `/improve-architecture`, `/zoom-out`, and the implementer/reviewer subagents all read `CONTEXT.md` when present. `/think` and `/improve-architecture` are the only writers, and both write only at decision-capture time.

## Knowledge Base

Projects using 0th skills may also maintain a markdown knowledge base. The skills repo now includes an editor-agnostic KB protocol in [PROTOCOL.md](PROTOCOL.md).

The protocol assumes:

- `KB_ROOT` is the canonical KB path contract
- agents resolve the KB root from `KB_ROOT`, then project instructions, then a one-time user prompt
- the KB is plain markdown on disk
- agents should not hardcode an Obsidian vault path or depend on Obsidian-only behavior

## Secret Handling

0th skills use a provider-neutral secret contract: agents handle secret names and references, not resolved values. Application code should read secrets from environment variables or runtime bindings, and secret managers should inject values only into the target process.

Recommended local shape:

```env
SERVICE_API_KEY=op://vault-name/item-name/field-name
```

```bash
op run --env-file .env.1password -- <command>
```

1Password is only the default example. Equivalent non-printing runners are fine, including Doppler `doppler run -- <command>`, Vault Agent, cloud secret-manager runtime bindings, deployment-platform secrets, or a human-created ignored `.env.local` loaded by the app.

Hard rule: no agent should run `op read`, `op item get --reveal`, `op inject` to stdout, `op run --no-masking`, `printenv`, `env`, `set`, shell tracing (`set -x`, `bash -x`) around secrets, or any fallback that puts secrets into chat, logs, argv, browser automation payloads, HARs, screenshots, or counterpart-review prompts.

To verify a secret is present without revealing its value, use `[ -n "${SERVICE_API_KEY:-}" ] && echo "SERVICE_API_KEY: set" || echo "SERVICE_API_KEY: missing"`. Never `echo "$SERVICE_API_KEY"` or `printenv SERVICE_API_KEY`.

### Direct invocation

When a skill is invoked directly, `$ARGUMENTS` means "the raw argument string passed to that
skill." For example, `$build add a /health endpoint` gives the `build` skill a starting brief of
`add a /health endpoint`, while `$research best TS TOML parser` gives the `research` skill the
question `best TS TOML parser`.

## Agents

- Claude-specific agent manifests live under `agents/*.md`
- Codex-native subagent manifests live under `.codex/agents/*.toml`
- Codex project-level agent policy lives under `.codex/config.toml`
- The markdown files are the Claude-side manifests; the Codex TOML files are the native manifest format Codex actually loads
- The `.codex/` directory is intentionally hidden on macOS because it is native tool config, not product source
- Claude-side model policy is pinned in `agents/*.md` for now: `test-runner` and `web-researcher` use `sonnet`, while review and implementation helpers use `opus`
- Codex-side manifests pin `model`, `model_reasoning_effort`, and `sandbox_mode` so the published behavior does not depend on a user's defaults
- `.codex/config.toml` currently caps Codex subagent orchestration at `max_threads = 4` and `max_depth = 1`
- Today, the mirrored 0th-managed agents are `implementer`, `reviewer`, `test-runner`, `verifier`, `synthesizer`, `deep-researcher`, and `experimenter`
- For read-only code mapping, Claude should use its built-in `Explore` agent while Codex uses the custom `0th_explorer`
- Claude keeps `web-researcher` for its `WebSearch` + `WebFetch` workflow, while Codex uses a native `researcher` agent for focused source-cited research cycles
- Codex optional agent settings such as `mcp_servers` and `skills.config` inherit from the parent session when omitted, so `0th_explorer` and `0th_researcher` stay lightweight by default
- Cross-model review is script-driven through `scripts/counterpart-companion.mjs` with pluggable drivers under `scripts/drivers/`
- The review agent is `ask-counterpart-review.md`; `ask-codex-review.md` and `ask-claude-review.md` are deprecated shims
- Cross-model review details in this section are the authoritative reference for bridge-helper behavior and state handling
- On Codex-hosted runs, explicit requests for Claude review should use the `ask-claude-review` bridge helper or `scripts/counterpart-companion.mjs --driver claude` rather than treating Claude as unavailable

### Agent types

- **Skills** are the user-facing workflows under `skills/`: `think`, `plan`, `build`, `debug`, `ship`, `research`, `deep-research`, `improve-architecture`, `zoom-out`
- **Work agents** are the task helpers that do implementation, review, testing, exploration, or research
- **Bridge review helper** is `ask-counterpart-review`: a prompt wrapper around the companion script
- **Companion script** is `scripts/counterpart-companion.mjs` with drivers under `scripts/drivers/`

### Host differences

| Area | Claude Code | Codex |
|---|---|---|
| Delegation model | Can auto-delegate from agent `description` | Spawns subagents only when explicitly asked |
| Agent file format | Markdown with YAML frontmatter under `agents/` | TOML under `.codex/agents/` |
| Current mirrored 0th agents | `implementer`, `reviewer`, `test-runner`, `verifier`, `synthesizer`, `deep-researcher`, `experimenter` | `implementer`, `reviewer`, `test-runner`, `verifier`, `synthesizer`, `deep-researcher`, `experimenter` |
| Read-only exploration | Built-in `Explore` agent | Custom `0th_explorer` |
| Claude-only agents | `web-researcher`, `ask-counterpart-review` (plus deprecated shims) | n/a |
| Codex-only agents | n/a | `explorer`, `researcher` |
| Native policy pinning | Per-agent `model` in frontmatter | Per-agent `model`, `model_reasoning_effort`, `sandbox_mode`, plus `.codex/config.toml` |

The goal is host-native parity, not identical files. When a behavior cannot be mirrored cleanly, document the asymmetry and keep the user-facing workflow explicit.

### Naming conventions

- Claude-side manifests use a colon-namespaced kebab name: `0th:implementer`, `0th:reviewer`, `0th:test-runner`, `0th:web-researcher`, `0th:verifier`, `0th:synthesizer`, `0th:deep-researcher`, `0th:experimenter`
- Codex-side manifests use underscored names without a namespace separator: `0th_implementer`, `0th_reviewer`, `0th_test_runner`, `0th_explorer`, `0th_researcher`, `0th_verifier`, `0th_synthesizer`, `0th_deep_researcher`, `0th_experimenter` — this matches Codex's TOML identifier rules (no colons, no hyphens)
- `0th:verifier` (Claude) / `0th_verifier` (Codex) — exercises completed features as a real user before /ship
- When adding a new subagent, create both manifests and keep the behavior sections in sync when the agent is truly shared. If a subagent is intentionally host-specific, note the asymmetry here
- `tests/agent-parity.test.mjs` is the guardrail for the current mirror set and asymmetry list

## Packaging

- Claude Code plugin metadata lives in `.claude-plugin/`
- Codex plugin metadata lives in `.codex-plugin/`

## Install

### Codex

- Install the plugin from the repo in the Codex app or CLI plugin flow
- Confirm the plugin exposes the nine skills under `skills/`
- Start a fresh thread after install so Codex reloads the plugin metadata

### Claude Code

- Use the repo as the Claude plugin directory so Claude can read `CLAUDE.md`, `agents/`, and `skills/`
- Start a fresh session after install so Claude picks up the latest skill and agent metadata

## Release notes

### 0.2.0

- Added the `improve-architecture` skill — find deepening opportunities using Module/Interface/Depth/Seam vocabulary and the deletion test; first-class core skill with full Codex parity (`agents/openai.yaml`, fixture entry, smoke-check coverage)
- Added the `zoom-out` micro-skill — user-triggered map of an unfamiliar code area (intentionally `disable-model-invocation: true`, excluded from core-skill test enforcement)
- Added the per-project `CONTEXT.md` vocabulary convention; wired reads into `/think`, `/build`, `/debug`, `/improve-architecture`, `/zoom-out`, and the implementer/reviewer subagents on both Claude and Codex sides; writes happen only at decision-capture time — `/think` Step 4 (Decide) and `/improve-architecture` Step 5 (Hand off), both alongside the decision record
- Added Phase 0 (Build a feedback loop) to `/debug` with a 10-way ranked ladder (failing test → curl → CLI → headless browser → trace replay → throwaway harness → fuzz → bisection → differential → HITL) plus iterate-on-the-loop guidance; new Iron Law: no hypotheses without a feedback loop
- Added a Surgical Changes rail to `/build` and the implementer agents on both hosts — every changed line traces to the slice spec; reviewer flags drive-by edits as scope creep
- Added a `Durable: yes` durability tag to decision records in `/think` Step 4 (criteria: hard to reverse, surprising without context, real trade-off) so `/improve-architecture` doesn't re-litigate settled choices
- Added `/think` guidance to dispatch `/research` when evidence for a recommendation is thin, rather than reasoning from pattern-matching
- Surfaces PRs #4 (companion process-title fix) and #5 (bb-browser as preferred verifier on both hosts)

### 0.1.9

- Added the `deep-research` skill with feasibility, decision, and survey loops backed by `KB_ROOT`
- Added mirrored Codex manifests for `synthesizer`, `deep-researcher`, and `experimenter`
- Added deep-research templates, references, routing coverage, and packaging metadata

### 0.1.8

- Replaced the separate Claude and Codex companion scripts with a single `scripts/counterpart-companion.mjs` runtime plus dedicated `claude` and `codex` drivers
- Added the generic `ask-counterpart-review` agent while keeping `ask-claude-review` and `ask-codex-review` as deprecated compatibility shims
- Reduced counterpart review support to the shipped Claude/Codex pairing and removed unsupported reviewer paths from the runtime, docs, and tests

### 0.1.7

- Added a repo-local knowledge base protocol in `PROTOCOL.md` so KB-aware skills can follow a markdown-first workflow without assuming Obsidian
- Documented KB behavior in `CLAUDE.md` and `README.md`
- Made `KB_ROOT` the canonical KB path contract, with a one-time prompt only when no KB root is configured

### 0.1.6

- Added `references/` support files for `build`, `debug`, and `research` so the skill entrypoints can stay focused while deeper checklists and patterns remain available on demand
- Moved companion review state defaults to a stable user state location instead of the plugin repo, with `OTH_SKILLS_STATE_DIR` and `--state-dir` overrides
- Added workflow templates for decision records, KB raw findings, and PR bodies
- Added skill-routing eval fixtures plus metadata tests for reference links
- Added `scripts/install-smoke-check.mjs` for repo/install verification during release and reinstall checks
- Added explicit build/plan guidance plus slice-checklist callouts for missing service or deployment boundaries when heavy local ML/runtime dependencies are introduced

### 0.1.5

- Added explicit Codex native agent config and project-level `.codex/config.toml`
- Added host-native Codex `explorer` and `researcher` agents
- Clarified that Claude uses built-in `Explore` and that `ask-claude-review` / `ask-codex-review` are bridge helpers
- Hardened `claude-companion.mjs` with timeout handling and explicit plugin-dir control
- Added cross-host skill metadata: Claude `argument-hint` plus Codex `agents/openai.yaml`
- Added parity and metadata tests so agent and skill configuration drift is caught automatically

## Counterpart Review

Cross-model review uses a single companion script with pluggable drivers:

```bash
node scripts/counterpart-companion.mjs <task|review> --key <review-key> "<prompt>"
```

The script auto-detects the host and loads the counterpart from `~/.0th/reviewer-config.json`:

```json
{
  "version": 1,
  "counterparts": {
    "claude": "codex",
    "codex": "claude"
  }
}
```

Override per-call with `--driver <name>` or per-session with `COUNTERPART_REVIEWER=<name>`.

Available drivers: `codex`, `claude`. To add a new driver, create `scripts/drivers/<name>.mjs` implementing the driver contract (see spec) and add it to the allowlist in `counterpart-companion.mjs`.

Review state is stored at:
- `$OTH_SKILLS_STATE_DIR` if set
- `$XDG_STATE_HOME/0th-skills/reviews` if `XDG_STATE_HOME` is set
- `~/.0th/reviews` otherwise

Use `--state-dir` for a one-off override.

## Verification

Run the local test suite with:

```bash
node --test tests/*.test.mjs
```

Smoke-check the repo or an installed plugin copy with:

```bash
node scripts/install-smoke-check.mjs --repo-root .
node scripts/install-smoke-check.mjs --repo-root . --cache-root ~/.codex/plugins/cache/mini-local/0th-skills/local
```

The routing fixture for manual/host checks lives at `tests/fixtures/skill-routing.fixture.json`.
