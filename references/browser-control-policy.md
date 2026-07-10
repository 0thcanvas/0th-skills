# Browser Control Policy

Browser names are exact application identities, not Chromium-family aliases.

## Identity

- **Chrome** means `/Applications/Google Chrome.app`. Agent-driven Chrome work uses the dedicated
  Browser Kit profile `agent`: `browser-kit session open --provider chrome --profile agent`.
- **Brave** means `/Applications/Brave Browser.app`. Brave is personal state and is out of scope
  unless the operator explicitly requests Brave or Brave-specific debugging.
- **Chrome for Testing** and managed Chromium are isolated test runtimes. They are not Chrome and
  must never silently substitute for an explicitly requested or proof-required real Chrome session.
- Session reuse stays inside the selected browser identity. A matching personal Brave tab is not a
  reusable Chrome session.

## Proof Lanes

- **Hermetic automation:** Playwright-managed Chromium or Chrome for Testing may run only when the
  check explicitly values isolated, deterministic state and does not claim real-user fidelity.
- **Real-environment proof:** Interactive browser work, unpacked extensions, authentication,
  anti-bot behavior, real-profile state, and user-environment acceptance use real Google Chrome
  with `--provider chrome --profile agent`.
- Chrome for Testing may support an explicitly isolated test, but it must not satisfy or replace
  real-environment proof.

## Recovery Ladder

1. Check Browser Kit status and existing tabs, then start or attach real Chrome with the `agent`
   profile. For an unpacked extension, add `--ext <path>`.
2. Attempt the documented Chrome/Browser Kit connection or extension-loading recovery once.
3. If programmatic loading still fails and Computer Use is available, target the **Google Chrome**
   app explicitly, open `chrome://extensions`, enable Developer mode, and use **Load unpacked**.
   Obtain the required Computer Use confirmation immediately before installing/loading the extension.
4. If the real-Chrome UI path also fails, report the exact blocker. Never silently substitute Brave,
   Chrome for Testing, managed Chromium, or the in-app browser.

