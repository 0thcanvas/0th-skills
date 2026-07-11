# 0th Skills

## Browser

- Browser names are exact identities. Apply `references/browser-control-policy.md`: Chrome means real
  Google Chrome with Browser Kit profile `agent`; Brave is explicit-request-only; managed test
  browsers never silently substitute for real Chrome.

## Safety

- Apply `references/secret-control-policy.md`. For recurring local development, explicitly sync
  project-scoped secrets through `0th secrets` into a generated gitignored file; projects configure the CLI.
- Run the consuming application without inspecting secret-file contents. Resolved secret values
  never enter agent context, prompts, argv, logs, screenshots, browser payloads, diffs, or commits.
  Normal commands use that file without contacting 1Password; sync only on setup or rotation.
- A missing variable in the current process is not proof that the credential is unavailable. Before
  credential-related `BLOCKED` or `BLOCKED_REAL_ENV`, complete the project-scoped safe-runner
  preflight in `references/secret-control-policy.md` and retry the consuming command inside it.
- Seed phrases, derived private keys, personal credentials, and production secrets never enter project env files.
