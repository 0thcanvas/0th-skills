# 0th Skills

## Browser

- Browser names are exact identities. Apply `references/browser-control-policy.md`: Chrome means real
  Google Chrome with Browser Kit profile `agent`; Brave is explicit-request-only; managed test
  browsers never silently substitute for real Chrome.

## Safety

- Resolved secret values never enter agent context, prompts, argv, logs, screenshots, browser
  payloads, or committed files. Code reads secrets from environment variables or runtime bindings.
- Keep only secret-manager references such as `op://...` in files. Inject values inside the target
  process, for example `op run --env-file .env.1password -- <command>`.
- Never use revealing secret-manager commands, environment dumps, or shell tracing around secrets.
  If safe injection is unavailable, stop. Treat possible exposure as compromise and rotate.
