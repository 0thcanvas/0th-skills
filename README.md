# 0th Skills

Lightweight development workflow for solo builders using Claude Code and Codex.

## Skills

- `think` — turn an idea into a short decision record
- `plan` — break a decision into vertical slices
- `build` — implement with TDD on a feature branch
- `debug` — investigate root cause before fixing
- `ship` — review and land through a PR

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
