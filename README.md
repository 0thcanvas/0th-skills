# 0th Skills

Provider-neutral development workflow for coding agents. Skills define outcomes, evidence, and
stop conditions; host adapters own model names, orchestration commands, authentication, and tool
bindings.

## Skills

- `think` — turn unresolved requirements or tradeoffs into an explicit decision
- `plan` — break a decision into vertical slices
- `build` — implement with TDD on a feature branch
- `debug` — investigate root cause before fixing (includes a 10-way feedback-loop ladder)
- `ship` — review and land through a PR
- `research` — run source-aware research across docs, GitHub, papers, and the broader web
- `deep-research` — explicitly budgeted multi-phase research for file-backed world models, contradiction analysis, reusable surveys, and feasibility experiments
- `improve-architecture` — find deepening opportunities in a codebase using Module/Interface/Depth/Seam vocabulary plus the deletion test; run periodically, not per-feature
- `retro` — capture user corrections, agent misfires, and tool/skill issues into a persistent incident log; classify each, surface patterns when ≥ 3 entries cross a bucket, propose actions

`think / plan / build / debug / ship` remain the core workflow. `research` is the default external-evidence capability; `deep-research` is an expensive, explicitly budgeted escalation. `improve-architecture` is a periodic structural-quality skill.

## Project Vocabulary (`CONTEXT.md`)

When a project accumulates domain jargon, keep a `CONTEXT.md` at its root: a tight glossary of canonical terms, *avoid* aliases, key relationships, and flagged ambiguities. The implementer and reviewer subagents re-derive vocabulary every time they spawn — `CONTEXT.md` collapses that overhead and keeps naming consistent across files, tests, and current contracts.

- **Domain only.** Concepts unique to this project. General programming terms (timeouts, retries, error types) don't belong even if used heavily.
- **Lazy creation.** Writes happen only when domain language is actually resolved. `/think` and
  `/improve-architecture` may update it alongside the smallest durable decision record. Never
  mid-grill — design conversations don't silently mutate the repo.
- **Format.** Bold term, one-line definition, `_Avoid_:` line listing rejected aliases. Group with `## Language`, `## Relationships`, `## Flagged ambiguities`.
- **Multi-context repos.** Place `CONTEXT-MAP.md` at the root linking to per-context `CONTEXT.md` files inside each module. Most projects need only the single root file.

`/think`, `/build`, `/debug`, `/improve-architecture`, and the implementer/reviewer subagents all
read `CONTEXT.md` when present. `/think` and `/improve-architecture` are the only writers, and both
write only when the discussion resolves domain vocabulary.

## Knowledge Base

The `memory` runtime is a compact continuity index, not a second documentation system. Root tasks
retrieve active claims and open work through one task-keyed startup packet; historical states,
source packs, and full evidence expand only on demand.

A project may expose a markdown knowledge base as an optional evidence provider. Agents retrieve it
only when the task, project instructions, or a memory pointer names it. They do not read or maintain
a wiki merely because it exists. [PROTOCOL.md](PROTOCOL.md) defines this compatibility path.

The markdown KB protocol assumes:

- `KB_ROOT` is the canonical KB path contract
- agents resolve the KB root from `KB_ROOT`, then project instructions; ask only when a requested
  KB write has no configured root
- the KB is plain markdown on disk
- agents should not hardcode an Obsidian vault path or depend on Obsidian-only behavior

## Runtime Profiles

Skills do not embed personal providers or assume a coordinator/worker topology. An optional runtime
profile maps portable capability names to local providers and describes the host's topology and
state surfaces. It is configuration only: profile resolution never authorizes an effect and never
proves that a provider, worker, session, or credential is currently available. Live capability
evidence and normal authority rules still apply.

```bash
node scripts/0th.mjs profile validate --profile-json adapters/templates/runtime-profiles/minimal.json
node scripts/0th.mjs profile init --template pi --profile-id pi --config-dir ~/.config/0th-skills/profiles
node scripts/0th.mjs profile resolve --profile-json ~/.config/0th-skills/profiles/pi.json --capability logged_in_browser
```

The bundled `minimal`, `pi`, and `personal` templates demonstrate an empty single-agent host, Pi,
and local personal provider bindings. A portability smoke can verify that another harness discovers
the exact requested skills without invoking a model:

```bash
node scripts/skill-portability-smoke.mjs --harness pi \
  --skill skills/think/SKILL.md --skill skills/build/SKILL.md
```

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

To verify a secret is present without revealing its value, use `[ -n "${SERVICE_API_KEY:-}" ] && echo "SERVICE_API_KEY: set" || echo "SERVICE_API_KEY: missing"`. Run only with shell tracing off — `set -x` / `bash -x` would expand the test and leak the value. Never `echo "$SERVICE_API_KEY"` or `printenv SERVICE_API_KEY`.

Recurring project development secrets use the shared CLI, configured by a tracked
`.0th-secrets.json` manifest. `0th secrets sync` is the only normal command that contacts
1Password; `paths`, `check`, and `clean` are metadata-only lifecycle operations. Applications read
the generated ignored mode-600 files directly. Seed phrases and derived private keys are rejected.

### Direct invocation

When a skill is invoked directly, `$ARGUMENTS` means "the raw argument string passed to that
skill." For example, `$build add a /health endpoint` gives the `build` skill a starting brief of
`add a /health endpoint`, while `$research best TS TOML parser` gives the `research` skill the
question `best TS TOML parser`.

### Specialist Routing

0th remains the workflow orchestrator when specialist plugins or tools are available. Route at the
capability/workflow boundary, let plugin-owned workflows run their internal skill sequence, and use
[`references/specialist-routing.md`](references/specialist-routing.md) for the handoff envelope,
return receipt, fallback, and no-silent-downgrade rules.

Specialist plugins may provide visual design, frontend QA, iOS simulator proof, SwiftUI guidance,
logged-in browser access, session-backed reading, or framework guidance. Their evidence can satisfy
0th gates only when the required receipt comes back; otherwise native 0th fallback continues with an
explicit proof gap or blocker.

### Workflow Verification

Use [`references/workflow-verification.md`](references/workflow-verification.md) as the compact
contract for the second half of the loop: `context_handoff` keeps long work summarized with source
pointers, `proof_contract_required` keeps ship-bound work on the existing proof artifacts,
`blocked_real_env` prevents tests from standing in for unavailable browser/simulator/session/sandbox
proof, and `retro_open_loop_closeout` makes skipped verification, corrections, and unfinished work
visible.

## Agents

Portable skills do not require these profiles. They default to one root agent and route optional
packets through [`references/skills-kernel.md`](references/skills-kernel.md) only after a live
capability check. The manifests below remain available for explicit compatibility and specialist
use. Role manifests describe behavior and tools; local files under
`~/.0th/skills/config/model-routing/` own compute-class-to-model mapping, and runtime receipts prove
what a child actually received.

- Claude-specific agent manifests live under `agents/*.md`
- Codex-native subagent manifests live under `.codex/agents/*.toml`
- Codex project-level agent policy lives under `.codex/config.toml`
- The markdown files are the Claude-side manifests; the Codex TOML files are the native manifest format Codex actually loads
- The `.codex/` directory is intentionally hidden on macOS because it is native tool config, not product source
- Claude and Codex role manifests do not pin models or effort; explicit compatibility use inherits the session unless the harness adapter supplies a launch plan
- `adapters/templates/*.models.json` provides safe local configuration structure; bundled
  `adapters/*.models.json` disables economy/balanced routing and inherits frontier as a fail-closed fallback
- Active mappings live outside the plugin at `~/.0th/skills/config/model-routing/<harness>.json`;
  set `OTH_SKILLS_ROUTING_DIR` only when another local configuration root is required
- Initialize with `node scripts/0th.mjs routing init --harness <name>` and diagnose live controls
  with `routing doctor`; pass `--runtime-json <path>`, or use Codex's token-consuming opt-in
  `--live-probe` to populate a version- and routing-bound local cache
- `scripts/0th.mjs capabilities` emits the selected launch plan only when a live exact model/effort
  pair can honor it; concrete Codex plans run through `scripts/0th.mjs dispatch`, and
  `scripts/0th.mjs attest` verifies the resulting receipt
- `.codex/config.toml` currently caps Codex subagent orchestration at `max_threads = 4` and `max_depth = 1`
- `references/codex-dispatch-profiles.md` is a legacy compatibility note; shared skills must not use
  it as automatic routing policy
- Today, the mirrored 0th-managed agents are `implementer`, `reviewer`, `experience-reviewer`, `test-runner`, `verifier`, `synthesizer`, `deep-researcher`, and `experimenter`
- For explicit read-only helper use, Claude can use its built-in `Explore` agent while Codex retains the `0th_explorer` compatibility profile
- Claude retains `web-researcher` and Codex retains `0th_researcher` for explicit focused research packets; neither is a mandatory phase
- Codex optional agent settings such as `mcp_servers` and `skills.config` inherit from the parent session when omitted, so `0th_explorer` and `0th_researcher` stay lightweight by default
- Optional cross-model review is script-driven through `scripts/counterpart-companion.mjs` with pluggable drivers under `scripts/drivers/`
- Codex-hosted counterpart review defaults to the `grok` driver, which uses Grok Build headless JSON mode. If `grok` is not on `PATH`, set `GROK_BIN` before invoking the companion process.
- Grok Build can also be detected as the host. A configured `enabled_drivers` set prevents any
  no-credit driver from being selected, including explicit overrides.
- The review agent is `ask-counterpart-review.md`; `ask-codex-review.md` and `ask-claude-review.md` are deprecated shims
- Cross-model review details in this section are the authoritative reference for bridge-helper behavior and state handling
- Explicit driver requests still obey local availability; the companion fails before invocation
  when the selected driver is not enabled.

### Agent types

- **Skills** are the user-facing workflows under `skills/`: `think`, `plan`, `build`, `debug`, `ship`, `research`, `deep-research`, `improve-architecture`, `retro`
- **Work agents** are the task helpers that do implementation, review, testing, exploration, or research
- **Bridge review helper** is `ask-counterpart-review`: a prompt wrapper around the companion script
- **Companion script** is `scripts/counterpart-companion.mjs` with drivers under `scripts/drivers/`

### Host differences

| Area | Claude Code | Codex |
|---|---|---|
| Delegation model | Can auto-delegate from agent `description` | Spawns subagents only when explicitly asked |
| Agent file format | Markdown with YAML frontmatter under `agents/` | TOML under `.codex/agents/` |
| Current mirrored 0th agents | `implementer`, `reviewer`, `experience-reviewer`, `test-runner`, `verifier`, `synthesizer`, `deep-researcher`, `experimenter` | `implementer`, `reviewer`, `experience-reviewer`, `test-runner`, `verifier`, `synthesizer`, `deep-researcher`, `experimenter` |
| Read-only exploration | Built-in `Explore` agent | `0th_explorer` workflow profile over generic `explorer` |
| Claude-only agents | `web-researcher`, `ask-counterpart-review` (plus deprecated shims) | n/a |
| Codex-only profiles | n/a | `0th_explorer`, `0th_researcher` |
| Compute selection | Local harness mapping plus runtime receipt | Local harness mapping plus runtime receipt |

The goal is host-native parity, not identical files. When a behavior cannot be mirrored cleanly, document the asymmetry and keep the user-facing workflow explicit.

These are available host surfaces, not the portable workflow topology. `skills/*/SKILL.md` never
assumes a profile, model, effort level, thread count, or host-specific name.

### Naming conventions

- Claude-side `agents/*.md` frontmatter uses unprefixed kebab names (`implementer`, `reviewer`, etc.). The Claude plugin loader supplies the `0th:` namespace at invocation time, so callers use `0th:implementer`, `0th:reviewer`, `0th:web-researcher`, and so on.
- Codex-side manifests use underscored names without a namespace separator: `0th_implementer`, `0th_reviewer`, `0th_experience_reviewer`, `0th_test_runner`, `0th_explorer`, `0th_researcher`, `0th_verifier`, `0th_synthesizer`, `0th_deep_researcher`, `0th_experimenter` — this matches Codex's TOML identifier rules (no colons, no hyphens)
- `0th:verifier` (Claude) / `0th_verifier` (Codex) — exercises completed features as a real user before /ship
- `0th:experience-reviewer` (Claude) / `0th_experience_reviewer` (Codex) — optional fresh-context product review when it has a named evidence advantage
- When adding a new subagent, create both manifests and keep the behavior sections in sync when the agent is truly shared. If a subagent is intentionally host-specific, note the asymmetry here
- `tests/agent-parity.test.mjs` is the guardrail for the current mirror set and asymmetry list

## Packaging

- Claude Code plugin metadata lives in `.claude-plugin/`
- Codex plugin metadata lives in `.codex-plugin/`
- Shared workflow sources live in `skills/`
- Codex-facing skill entrypoints live in `codex-skills/`; generate them with `node scripts/build-codex-wrappers.mjs`
- Codex wrappers stay compact and point back to the shared workflow sources without Claude-only frontmatter such as `argument-hint`
- Do not inline full shared workflows into `codex-skills/`; `tests/plugin-smoke-check.test.mjs` guards the active Codex invoke budget

## Install

### Codex

- Install the plugin from the repo in the Codex app or CLI plugin flow
- Confirm the plugin exposes the nine skills under `codex-skills/`
- Start a fresh thread after install so Codex reloads the plugin metadata

### Grok Build

- Install Grok Build so `grok` is on `PATH`, or set `GROK_BIN=/absolute/path/to/grok`
- The driver uses `grok -p … --output-format json` and resumes multi-round reviews by session id
- Authenticate through the normal Grok login flow; never place credentials in prompts or arguments
- Existing `~/.0th/reviewer-config.json` mappings remain explicit overrides and are not rewritten

### Antigravity CLI (optional)

- Use `--driver agy`, config, or `COUNTERPART_REVIEWER=agy` to opt in. Once `agy` is available on `PATH`, run `agy install`, or set `AGY_BIN=/absolute/path/to/agy`
- The `agy` driver is intentionally single-shot for now: Antigravity supports `--conversation`, but print-mode resume currently emits prior assistant transcript text along with the new response

### Claude Code

- Use the repo as the Claude plugin directory so Claude can read `CLAUDE.md`, `agents/`, and `skills/`
- Start a fresh session after install so Claude picks up the latest skill and agent metadata

### Failure dossier hooks

Managed verification commands can be wrapped with:

```bash
node scripts/failure-dossier-runner.mjs --run-id <unique-run-id> -- <test-or-verification-command>
```

On failure, the runner writes `${VERIFICATION_REPORT_DIR:-verification-report}/runs/<unique-run-id>/dossier.json`. Host hooks surface that dossier into the next agent turn:

- Codex: `node scripts/codex-failure-hook.mjs`
- Claude Code: `node scripts/claude-failure-hook.mjs`

Hook installation is user-scope because repo-local Codex hooks are not the validated path yet. The repo ships hook scripts and tests, but it does not auto-install or mutate `~/.codex/config.toml`, `~/.claude/settings.json`, or any user config.

## Release notes

### 0.4.0

- Made planning mechanics agent-owned: direct execution for one bounded loop, adaptive checkpoints
  when evidence changes the next action, and formal plans only when prospective slices reduce
  coordination risk. External effects keep separate authority and effect-contract checks.
- Made review fully optional and advisory. Reviewer findings are hypotheses; no plan, build, or ship
  gate requires review output or a skip explanation.
- Removed mandatory counterpart-review artifacts from `ship-gate` while retaining executable proof
  and product-acceptance evidence.
- Fixed the Codex live-probe schema by declaring the explicit string type required by Structured
  Outputs.
- Separated production deployment from `/ship`; deployment follows the owning project's runbook and
  requires its own authority and evidence.
- Routed durable note requests to Memory or the project KB unless a concrete incident makes `/retro`
  appropriate.
- Added a no-code operational lane for building, signing, installing, launching, restarting, or
  verifying an existing revision without manufacturing branch, TDD, PR, or ship-gate artifacts.
- Added private local plugin releases with immutable SemVer artifacts, a local release ledger,
  integrity verification, explicit activation, and rollback without publishing to the universal
  Plugin Directory.
- Isolated counterpart failure-contract tests from the user's reviewer availability configuration.

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
    "codex": "grok",
    "grok": "codex"
  }
}
```

The defaults above are written only when the config file does not exist. Existing mappings remain
operator-owned overrides.

Current availability can be restricted without changing the portable skill:

```json
{
  "version": 1,
  "enabled_drivers": ["grok"],
  "counterparts": {
    "claude": "grok",
    "codex": "grok"
  }
}
```

When a selected route or explicit `--driver` is outside `enabled_drivers`, the companion exits
before launching it. It does not spend credit or manufacture a fallback reviewer.

Override per-call with `--driver <name>` or per-session with `COUNTERPART_REVIEWER=<name>`.

Available drivers: `codex`, `claude`, `grok`, and optional `agy`. To add a new driver, create `scripts/drivers/<name>.mjs` implementing the driver contract (see spec) and add it to the allowlist in `counterpart-companion.mjs`.

Review state is stored at:
- `$OTH_SKILLS_STATE_DIR` if set
- `$XDG_STATE_HOME/0th-skills/reviews` if `XDG_STATE_HOME` is set
- `~/.0th/reviews` otherwise

Use `--state-dir` for a one-off override.

Memory v2 runtime state is also local user state, not project-repo content. Normal agents should
use the unified command surface:

```bash
node scripts/memory.mjs startup --query "repo preflight memory optimization"
node scripts/memory.mjs preflight --verbose # diagnostics only
node scripts/memory.mjs brief                # explicit broad-state audit only
node scripts/memory.mjs task-brief           # explicit open-loop audit only
node scripts/memory.mjs write-gate --event-type research --claim "..." --source-id memory-systems-world-model --evidence-path sources/memory/source-pack.jsonl --confidence high
node scripts/memory.mjs recall --query "repo preflight" --limit 5
node scripts/memory.mjs recall --global-only --source-id memory-systems-world-model --limit 5
node scripts/memory.mjs source-pack ingest --json /path/to/source-pack.json
node scripts/memory.mjs source-pack expand --id memory-systems-world-model
node scripts/memory.mjs doctor
node scripts/memory.mjs runtime-eval
```

`startup` combines compact preflight state with at most three relevant claims and two relevant open
loops. It omits verbose drift arrays and does not load generated briefs. Use returned ids and source
pointers with targeted `recall` or `expand` only when they affect the task.

By default project-scoped memory, evidence, repo-state, and open-loop commands store generated
JSONL/brief files at:

- `$OTH_SKILLS_STATE_DIR/projects/<project-key>/...` if set
- `$XDG_STATE_HOME/0th-skills/projects/<project-key>/...` if `XDG_STATE_HOME` is set
- `~/.0th/skills/projects/<project-key>/...` otherwise

The `<project-key>` is derived from the Git `origin` URL when available, so multiple checkouts of
the same repo share one local Memory v2 state directory. Each command prints the concrete file path
it read or wrote in its JSON result.

Global cross-project memory and evidence route to the shared global brain when written with
`scope: global`:

- `$OTH_SKILLS_STATE_DIR/global/...` if set
- `$XDG_STATE_HOME/0th-skills/global/...` if `XDG_STATE_HOME` is set
- `~/.0th/skills/global/...` otherwise

Global durable claims require an explicit `source_id`. Source-pack ingestion stores compact
metadata at `global/sources/index.jsonl` and verbatim redacted chunks under
`global/sources/packs/`, deduplicating chunks by content hash. `memory expand --id <source-pack>`
returns only the requested source pack instead of dumping unrelated global material into context.
Default recall searches project memory first and then appends a bounded global result set; use
`--project-only`, `--global-only`, `--source-id`, or `--all-project-tasks` to make routing explicit.

`memory doctor` reports the resolved project paths, global paths, routing rules, and plugin/cache
versions. `memory.mjs` is the unified entrypoint; the per-command
scripts (`memory-write.mjs`, `source-pack.mjs`, `open-loop.mjs`, `memory-recall.mjs`, etc.) hold the canonical
implementation. Direct invocation is supported for tests and migration work; explicit path flags
only matter when you need to override the default project-keyed runtime location.

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

Build the installable runtime staging directory outside the checkout before a local release:

```bash
RUNTIME_PLUGIN_DIR="${RUNTIME_PLUGIN_DIR:?Set a fresh absolute staging path}"
node scripts/package-runtime-plugin.mjs --source . --output "$RUNTIME_PLUGIN_DIR" --register-current
node "${RUNTIME_PLUGIN_DIR}/scripts/install-smoke-check.mjs" --repo-root "$RUNTIME_PLUGIN_DIR"
```

The runtime package keeps skills, agents, scripts, schemas, adapters, and required decision evidence.
It excludes tests, verification artifacts, eval/plan history, feedback files, and repository-only
documentation. `--register-current` atomically points the user-state runtime link at this staging
directory so shell consumers can find the shared CLI without a versioned cache path. Point the local
marketplace symlink at the same staging directory before reinstalling. Each registered release uses
a fresh staging directory; the packager refuses to overwrite the currently registered runtime.

### Private local releases

The plugin is released to a private marketplace on the current machine. This flow does not submit
the plugin to the public Plugin Directory. See
[`references/local-plugin-releases.md`](references/local-plugin-releases.md) for the current
versioning, publish, activation, and rollback contract.

The routing fixture for manual/host checks lives at `tests/fixtures/skill-routing.fixture.json`.
