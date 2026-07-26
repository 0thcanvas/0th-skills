# Secret Runtime Policy

Skills handle secret names and references, never resolved credential values. The runtime profile or
project instructions select the `secret_runtime` provider.

## Local development

1. Prefer an existing valid project-scoped environment consumed through the application's normal
   env-file, dotenv, keychain, workload-identity, or deployment loader.
2. Provider setup and rotation follow the guidance returned by `secret_runtime`; the portable
   workflow does not invent provider commands.
3. A plaintext development fallback is allowed only when the project documents it, the file is
   regular, owner-only, mode `600`, and gitignored. Never use this fallback for production secrets,
   personal credentials, seed phrases, derived private keys, or broad account access.
4. Production reconstructs configuration through its owning runtime or deployment secret boundary;
   it never uploads a developer's local cache.

## Credential-dependent preflight

A missing variable in the current process is not proof that a credential is unavailable. Before
returning `BLOCKED` or `BLOCKED_REAL_ENV`:

1. Run the consuming application through its configured project loader.
2. Check only the loader or cache path's existence, type, ownership, permissions, and ignored state.
   Never inspect its contents or borrow another project's environment.
3. When setup or intentional rotation is required, resolve `secret_runtime`, load its guidance, and
   attempt one provider sync or refresh through the documented project wrapper.
4. Retry the actual consuming command. A presence-only check does not replace the real probe.

The blocked receipt names each attempted safe runner and its sanitized error. Provider login,
authorization, or refresh failure does not invalidate an existing project environment.

## Output boundary

- Never read, print, search, summarize, snapshot, or trace secret-file contents.
- Never dump environments, cookies, authorization headers, browser storage, or reveal-capable
  provider output.
- Resolved values never enter chat, prompts, command arguments, logs, screenshots, browser payloads,
  diffs, commits, test evidence, memory, or review artifacts.
- If exposure may have occurred, identify only the affected category, stop reuse, and rotate through
  the owning provider.
