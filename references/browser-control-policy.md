# Browser Capability Policy

Browser identity and session ownership are proof inputs, not interchangeable implementation details.

## Identity

- Use the exact application, profile, account, extension build, and session named by the TaskSpec,
  project instructions, or active runtime profile.
- Reuse stays inside that identity. A matching tab from another application, profile, or account is
  not an equivalent session.
- Hermetic test runtimes never silently satisfy a real-user or authenticated proof contract.

## Proof lanes

- **Hermetic automation:** use an isolated browser runtime only when the check values deterministic
  state and does not claim real-user fidelity.
- **Session-backed proof:** resolve `logged_in_browser` from the runtime profile, load its returned
  guidance, and use the configured identity for extensions, authentication, anti-bot behavior,
  shared tabs, private state, and user-environment acceptance.

## Recovery

1. Resolve `logged_in_browser`; verify its current availability and inspect existing sessions before
   opening a new one.
2. Attempt one safe recovery described by the resolved provider guide.
3. If a required UI action remains unavailable, resolve `browser_ui_fallback` and follow its own
   authority and confirmation boundary.
4. If neither capability can satisfy the required identity, return the exact
   `adapter_unavailable` or `BLOCKED_REAL_ENV` receipt. Never substitute another browser identity.
