# 0th Skills

Lightweight development workflow for solo builders using Claude Code and Codex.

## Skills

- `think` — turn an idea into a short decision record
- `plan` — break a decision into vertical slices
- `build` — implement with TDD on a feature branch
- `debug` — investigate root cause before fixing
- `ship` — review and land through a PR
- `research` — run source-aware research across docs, GitHub, papers, and the broader web

`think / plan / build / debug / ship` remain the core workflow. `research` is a supporting capability the core skills can invoke when the answer lives outside the repo.

## Knowledge Base

Projects using 0th skills may also maintain a markdown knowledge base. The skills repo now includes an editor-agnostic KB protocol in [PROTOCOL.md](PROTOCOL.md).

The protocol assumes:

- `KB_ROOT` is the canonical KB path contract
- agents resolve the KB root from `KB_ROOT`, then project instructions, then a one-time user prompt
- the KB is plain markdown on disk
- agents should not hardcode an Obsidian vault path or depend on Obsidian-only behavior

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
- Today, the mirrored 0th-managed agents are `implementer`, `reviewer`, and `test-runner`
- For read-only code mapping, Claude should use its built-in `Explore` agent while Codex uses the custom `0th_explorer`
- Claude keeps `web-researcher` for its `WebSearch` + `WebFetch` workflow, while Codex uses a native `researcher` agent for focused source-cited research cycles
- Codex optional agent settings such as `mcp_servers` and `skills.config` inherit from the parent session when omitted, so `0th_explorer` and `0th_researcher` stay lightweight by default
- Cross-model review remains script-driven through `scripts/claude-companion.mjs` and `scripts/codex-companion.mjs`
- The Claude-side review helpers are named by target for clarity: `ask-codex-review.md` and `ask-claude-review.md`
- Cross-model review details in this section are the authoritative reference for bridge-helper behavior and state handling
- On Codex-hosted runs, explicit requests for Claude review should use the `ask-claude-review` bridge helper or `scripts/claude-companion.mjs` directly rather than treating Claude as unavailable

### Agent types

- **Skills** are the user-facing workflows under `skills/`: `think`, `plan`, `build`, `debug`, `ship`, `research`
- **Work agents** are the task helpers that do implementation, review, testing, exploration, or research
- **Bridge review helpers** are `ask-codex-review` and `ask-claude-review`: they are not skills and not native Codex agents; they are prompt wrappers around the companion scripts
- **Companion scripts** are the actual cross-model bridge runtime: `scripts/claude-companion.mjs` and `scripts/codex-companion.mjs`

### Host differences

| Area | Claude Code | Codex |
|---|---|---|
| Delegation model | Can auto-delegate from agent `description` | Spawns subagents only when explicitly asked |
| Agent file format | Markdown with YAML frontmatter under `agents/` | TOML under `.codex/agents/` |
| Current mirrored 0th agents | `implementer`, `reviewer`, `test-runner` | `implementer`, `reviewer`, `test-runner` |
| Read-only exploration | Built-in `Explore` agent | Custom `0th_explorer` |
| Claude-only agents | `web-researcher`, `ask-codex-review`, `ask-claude-review` | n/a |
| Codex-only agents | n/a | `explorer`, `researcher` |
| Native policy pinning | Per-agent `model` in frontmatter | Per-agent `model`, `model_reasoning_effort`, `sandbox_mode`, plus `.codex/config.toml` |

The goal is host-native parity, not identical files. When a behavior cannot be mirrored cleanly, document the asymmetry and keep the user-facing workflow explicit.

### Naming conventions

- Claude-side manifests use a colon-namespaced kebab name: `0th:implementer`, `0th:reviewer`, `0th:test-runner`, `0th:web-researcher`
- Codex-side manifests use underscored names without a namespace separator: `0th_implementer`, `0th_reviewer`, `0th_test_runner`, `0th_explorer`, `0th_researcher` — this matches Codex's TOML identifier rules (no colons, no hyphens)
- When adding a new subagent, create both manifests and keep the behavior sections in sync when the agent is truly shared. If a subagent is intentionally host-specific, note the asymmetry here
- `tests/agent-parity.test.mjs` is the guardrail for the current mirror set and asymmetry list

## Packaging

- Claude Code plugin metadata lives in `.claude-plugin/`
- Codex plugin metadata lives in `.codex-plugin/`

## Install

### Codex

- Install the plugin from the repo in the Codex app or CLI plugin flow
- Confirm the plugin exposes the six skills under `skills/`
- Start a fresh thread after install so Codex reloads the plugin metadata

### Claude Code

- Use the repo as the Claude plugin directory so Claude can read `CLAUDE.md`, `agents/`, and `skills/`
- Start a fresh session after install so Claude picks up the latest skill and agent metadata

## Release notes

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

Cross-model review is symmetric:

- Claude hosts the build and asks Codex to review
- Codex hosts the build and asks Claude to review

For Codex-hosted review loops, use `scripts/claude-companion.mjs`. It shells out to the local `claude` CLI, stores Claude `session_id` values in the companion state directory, and automatically resumes the same review thread when you reuse the same review key.

For Claude-hosted review loops, use `scripts/codex-companion.mjs`. It shells out to the local `codex` CLI, stores Codex `thread_id` values in the companion state directory, and automatically resumes the same review thread when you reuse the same review key.

By default, both companion scripts now store durable review state outside the plugin repo:

- `$OTH_SKILLS_STATE_DIR` if set
- otherwise `$XDG_STATE_HOME/0th-skills/reviews` if `XDG_STATE_HOME` is set
- otherwise `~/.0th/reviews`

Use `--state-dir` when you want a one-off override for testing.

Example:

```bash
node scripts/claude-companion.mjs task \
  --key ship-my-branch \
  "Review this diff. Respond with BLOCKER, SUGGESTION, and NIT sections."
```

The next call with the same `--key` resumes the prior Claude conversation instead of starting over.

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
