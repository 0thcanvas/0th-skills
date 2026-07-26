# 1Password Provider Guide

Load this guide only when the active runtime profile resolves `secret_runtime` to `onepassword`.

- Treat 1Password as the provider for the configured environment, not as a portable workflow
  requirement.
- Prefer an existing project-scoped generated environment. Contact the provider only for initial
  setup or intentional rotation.
- Store only reference templates such as `op://vault/item/field`; never print resolved values.
- Use `0th secrets sync` for the configured project environment. It resolves references directly to
  an owner-only, gitignored mode-600 file and never sends resolved output through stdout.
- Applications consume the generated file through their normal env-file or dotenv loader.
- Never run reveal commands, environment dumps, or shell tracing around credentials.
- A failed provider session does not invalidate an existing generated environment. Report only the
  sanitized provider error after the project loader and one intentional sync have both failed.
