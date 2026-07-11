# Secret Control Policy

1Password is the centralized source of truth for credentials. Agents use secrets through the
narrowest project runtime boundary that works; they never receive resolved values or vault-wide access.

## Local development contract

1. Each project declares its environments in `.0th-secrets.json`, with a reference-only template
   and stable generated env path for each project-scoped development configuration.
2. The shared `0th secrets` CLI owns path resolution, validation, synchronization, metadata checks,
   and cleanup. Projects configure it; they do not reimplement secret-file mechanics.
3. `0th secrets sync` is the only normal operation that contacts 1Password. It must
   verify the target is ignored with `git check-ignore -q -- <path>`, resolve references directly to
   a temporary owner-only file with `op inject --in-file ... --out-file ... --file-mode 0600`, and
   atomically replace the stable generated file. Resolved output must never pass through stdout.
4. Normal starts, tests, probes, and agent commands use the generated file through the consuming
   application's env-file or dotenv loader. They do not contact 1Password and continue to work when
   1Password is locked. Sync only during initial setup, after an intentional rotation/change, or
   when the generated file is missing.
5. The generated env file is a plaintext local development cache. It must be a regular file owned
   by the current user, have mode `600`, remain gitignored, and be removable with a documented clean
   command. Do not copy it between projects, machines, worktrees, or deployment targets.
6. Production deployment reconstructs configuration through the deployment platform, a 1Password
   service identity, or another approved runtime secret manager. It never uploads the developer's
   generated local file.

Do not cache production secrets, seed phrases, derived wallet private keys, personal credentials,
shared human passwords, or broad vault access in a project env file. Wallet material is user data,
not project configuration; custody and signing use a separate approved device/runtime boundary.

## Credential-dependent preflight

A missing variable in the current process is not proof that the credential is unavailable. Before
returning `BLOCKED` or `BLOCKED_REAL_ENV` for a missing credential:

1. Try the consuming command with the generated local environment or normal application loader.
2. Check only the generated file's existence, regular-file type, ownership, mode, and ignored state.
   Do not inspect env-file contents or borrow another project's environment.
3. When the generated file is missing or explicitly stale after rotation, run `0th secrets sync`
   once through the project's documented wrapper. Do not invoke 1Password independently for every later command. A reference template
   contains only `op://` references; resolved values may not be read.
4. Run the actual consuming command through the generated file's normal loader. A presence-only
   child check may precede the command, but it does not replace the real probe.
5. Retry the credential-dependent proof inside that runner. Only block when no project-scoped safe
   runner exists or every applicable runner was attempted and returned a concrete sanitized error.

The blocked report must name each attempted safe runner and its exact non-secret error. A locked
1Password session, denied authorization, invalid reference, or provider rejection can block an
intentional sync; it does not invalidate an existing generated local environment. An uninjected
parent process cannot establish a blocker.

## Agent boundary

- Run the consuming application or its normal dotenv loader. Do not `cat`, `head`, `grep`, search,
  summarize, or otherwise inspect secret-file contents.
- Resolved values never enter prompts, chat, argv, logs, screenshots, browser payloads, diffs,
  commits, test evidence, or review artifacts.
- Verify secret presence through exit status, variable names, or a safe application health check,
  never by displaying the value. Do not dump environments or enable shell tracing around secrets.
- Website credentials stay in the selected browser profile or an approved autofill path. Do not
  export personal browser passwords into project environment files.
- If exposure may have occurred, identify only the affected category, stop reuse, and rotate.
