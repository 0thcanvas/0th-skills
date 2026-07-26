# Browser Kit Provider Guide

Load this guide only when the active runtime profile resolves `logged_in_browser` to `browser-kit`.

- Chrome means `/Applications/Google Chrome.app`; use the dedicated `agent` profile.
- Check status and existing tabs before opening a new one.
- Start or attach with `browser-kit session open --provider chrome --profile agent`; add
  `--ext <path>` for an unpacked extension.
- When another CDP owner uses the default port, move this provider with `--cdp-port`,
  `--daemon-port`, `BROWSER_KIT_CDP_PORT`, or `BROWSER_KIT_DAEMON_PORT`.
- Reuse a matching logged-in tab. Open a new tab only when no suitable tab exists or isolation is
  required.
- For a required Chrome UI action that remains unavailable after one recovery attempt, resolve the
  separate `browser_ui_fallback` capability. In the personal environment it may use Computer Use
  against Google Chrome with confirmation at the required boundary.
- Never silently substitute Brave, Chrome for Testing, managed Chromium, or an in-app browser for a
  real-Chrome proof contract.
- Return the tested URL or surface, interaction/read evidence, session limitations, and any adapter
  failure without cookies, headers, storage, or private payloads.
