# 0th Skills

## Browser

- Configured browser names are exact identities. Apply `references/browser-control-policy.md`;
  hermetic test runtimes never silently substitute for required session-backed proof.

## Safety

- Apply `references/secret-control-policy.md`. Resolve `secret_runtime` through the runtime profile
  or project instructions; provider commands live in the returned guide.
- Run the consuming application without inspecting secret-file contents. Resolved secret values
  never enter agent context, prompts, argv, logs, screenshots, browser payloads, diffs, or commits.
- A missing variable in the current process is not proof that the credential is unavailable. Before
  credential-related `BLOCKED` or `BLOCKED_REAL_ENV`, complete the project-scoped safe-runner
  preflight in `references/secret-control-policy.md` and retry the consuming command inside it.
- Seed phrases, derived private keys, personal credentials, and production secrets never enter project env files.
