# Secret Control Policy

1Password is the source of truth for credentials. Agents use secrets through the narrowest local
runtime boundary that works; they do not receive vault-wide access or resolved values in context.

## Local development precedence

1. Prefer a mounted 1Password Environment `.env`. It behaves like an environment file but is a
   named pipe, so plaintext is not stored on disk. After authorization, reuse it until 1Password locks;
   do not contact 1Password for each command.
2. If the mount is unavailable or incompatible, a conventional plaintext `.env` or `.env.local` is
   an allowed fallback only for project-scoped development secrets. Before creating or using it,
   verify `git check-ignore -q -- <path>` succeeds and restrict it with `chmod 600 <path>`.
3. Do not cache production secrets, personal credentials, shared human passwords, or broad vault
   access in a plaintext project file. Use runtime injection or an approved service identity.

Use an existing valid local environment before invoking a secret manager. Contact 1Password only
when the environment is missing, stale, or explicitly being rotated. A fallback file may be
populated by a non-revealing secret-manager operation that writes directly to that verified ignored
path; never route resolved output through the terminal or agent context.

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
