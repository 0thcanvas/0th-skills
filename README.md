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

## Agents

- Claude-specific agent manifests live under `agents/*.md`
- Codex-native subagent manifests live under `.codex/agents/*.toml`
- The markdown files are the Claude-side manifests; the Codex TOML files are the native manifest format Codex actually loads
- The `.codex/` directory is intentionally hidden on macOS because it is native tool config, not product source
- Claude-side model policy is pinned in `agents/*.md` for now: `test-runner` and `web-researcher` use `sonnet`, while review and implementation helpers use `opus`
- Codex-side manifests currently leave model unspecified so Codex can inherit its configured default unless explicitly overridden
- Today, the Codex-native mirrors exist for `implementer`, `reviewer`, and `test-runner`
- `web-researcher` is Claude-only for now because Codex's web tooling does not map onto Claude's `WebSearch` + `WebFetch` subagent pattern; on Codex-hosted runs, `/research` runs searches inline
- Cross-model review remains script-driven through `scripts/claude-companion.mjs` and `scripts/codex-companion.mjs`
- The Claude-side review helpers are named by target for clarity: `ask-codex-review.md` and `ask-claude-review.md`

### Naming conventions

- Claude-side manifests use a colon-namespaced kebab name: `0th:implementer`, `0th:reviewer`, `0th:test-runner`, `0th:web-researcher`
- Codex-side manifests use underscored names without a namespace separator: `0th_implementer`, `0th_reviewer`, `0th_test_runner` — this matches Codex's TOML identifier rules (no colons, no hyphens)
- When adding a new subagent, create both manifests and keep the behavior sections in sync. If a subagent cannot be mirrored (e.g. web-researcher), note the asymmetry here

## Packaging

- Claude Code plugin metadata lives in `.claude-plugin/`
- Codex plugin metadata lives in `.codex-plugin/`

## Counterpart Review

Cross-model review is symmetric:

- Claude hosts the build and asks Codex to review
- Codex hosts the build and asks Claude to review

For Codex-hosted review loops, use `scripts/claude-companion.mjs`. It shells out to the local `claude` CLI, stores Claude `session_id` values under `.0th/reviews/`, and automatically resumes the same review thread when you reuse the same review key.

For Claude-hosted review loops, use `scripts/codex-companion.mjs`. It shells out to the local `codex` CLI, stores Codex `thread_id` values under `.0th/reviews/`, and automatically resumes the same review thread when you reuse the same review key.

Example:

```bash
node scripts/claude-companion.mjs task \
  --key ship-my-branch \
  "Review this diff. Respond with BLOCKER, SUGGESTION, and NIT sections."
```

The next call with the same `--key` resumes the prior Claude conversation instead of starting over.
