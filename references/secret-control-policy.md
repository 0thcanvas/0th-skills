# Secret Control Policy

1Password is the source of truth for credentials. Agents use secrets through the narrowest local
runtime boundary that works; they do not receive vault-wide access or resolved values in context.

## Local development precedence

1. Reuse a valid environment already loaded by the consuming application. Check only whether the
   required variable is present; never print its value.
2. Prefer a mounted 1Password Environment `.env`. It behaves like an environment file but is a
   named pipe, so plaintext is not stored on disk. After authorization, reuse it until 1Password locks;
   do not contact 1Password for each command.
3. If the mount is unavailable, use an existing project-scoped env file containing `op://`
   references through `op run --env-file <reference-env-file> -- <consuming command>`. Keep default
   masking enabled. The child process receives resolved values; the agent receives only its exit
   status and secret-safe application output.
4. If runtime injection is unavailable or incompatible, a conventional plaintext `.env` or
   `.env.local` is an allowed fallback only for project-scoped development secrets. Before creating
   or using it, verify `git check-ignore -q -- <path>` succeeds and restrict it with
   `chmod 600 <path>`.
5. Do not cache production secrets, personal credentials, shared human passwords, or broad vault
   access in a plaintext project file. Use runtime injection or an approved service identity.

Use an existing valid local environment before invoking a secret manager. Contact 1Password only
when the environment is missing, stale, or explicitly being rotated. A fallback file may be
populated by a non-revealing secret-manager operation that writes directly to that verified ignored
path; never route resolved output through the terminal or agent context.

## Credential-dependent preflight

A missing variable in the current process is not proof that the credential is unavailable. Before
returning `BLOCKED` or `BLOCKED_REAL_ENV` for a missing credential:

1. Try the consuming command with the valid local environment or normal application loader already
   configured for the current project.
2. Check only file existence, type, permissions, and project documentation for a mounted 1Password
   Environment or a project-scoped reference env file. Do not inspect env-file contents. Do not
   borrow an env file from another project.
3. When the local environment is missing or stale, contact 1Password through the narrowest relevant
   metadata or configured `op://` references. Titles and field labels may be selected; resolved
   values may not be read. A temporary reference file must contain references only, be gitignored,
   use mode `600`, and be deleted during teardown.
4. Run the actual consuming command through the mounted environment, `op run --env-file`, or the
   project's equivalent non-printing runner. A presence-only child check may precede the command,
   but it does not replace the real probe.
5. Retry the credential-dependent proof inside that runner. Only block when no project-scoped safe
   runner exists or every applicable runner was attempted and returned a concrete sanitized error.

The blocked report must name each attempted safe runner and its exact non-secret error. A locked
1Password session, denied authorization, invalid reference, or provider rejection can be a real
blocker after the attempt; an uninjected parent process cannot.

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
