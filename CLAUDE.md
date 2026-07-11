# 0th Skills

## Browser

- Browser names are exact identities. Apply `references/browser-control-policy.md`: Chrome means real
  Google Chrome with Browser Kit profile `agent`; Brave is explicit-request-only; managed test
  browsers never silently substitute for real Chrome.

## Safety

- Apply `references/secret-control-policy.md`. Prefer a mounted 1Password Environment `.env`; reuse
  an existing valid environment instead of prompting for every command. A verified gitignored,
  `chmod 600` plaintext `.env` is allowed only for project-scoped development secrets.
- Run the consuming application without inspecting secret-file contents. Resolved secret values
  never enter agent context, prompts, argv, logs, screenshots, browser payloads, diffs, or commits.
  Contact 1Password only when the local environment is missing, stale, or being rotated.
- A missing variable in the current process is not proof that the credential is unavailable. Before
  credential-related `BLOCKED` or `BLOCKED_REAL_ENV`, complete the project-scoped safe-runner
  preflight in `references/secret-control-policy.md` and retry the consuming command inside it.
