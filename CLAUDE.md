# 0th Skills

Repository-wide instructions only. Skill behavior and routing live in each `SKILL.md`; `README.md`
owns the catalog and usage documentation.

## Repository

- Work on a feature branch and land through a PR.
- Shared agent behavior changes update both `agents/*.md` and `.codex/agents/*.toml`. Document and
  test intentional host asymmetry; update `.codex/config.toml` when Codex runtime policy changes.
- `CLAUDE.md` is canonical; keep `AGENTS.md` as its symlink.
- Plugin changes include source plus the installed cache, verified with the repository smoke check.
- Browser names are exact identities. Apply `references/browser-control-policy.md`; Chrome means real
  Google Chrome with Browser Kit profile `agent`, while Brave is explicit-request-only.

## Safety

- Resolved secret values never enter agent context, prompts, argv, logs, screenshots, browser
  payloads, or committed files. Code reads secrets from environment variables or runtime bindings.
- Keep only secret-manager references such as `op://...` in files. Inject values inside the target
  process, for example `op run --env-file .env.1password -- <command>`.
- Never use revealing secret-manager commands, environment dumps, or shell tracing around secrets.
  If safe injection is unavailable, stop. Treat possible exposure as compromise and rotate.
