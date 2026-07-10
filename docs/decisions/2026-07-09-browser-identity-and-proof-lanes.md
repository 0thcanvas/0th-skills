# Browser Identity And Proof Lanes

**Date:** 2026-07-09
**Status:** active
**Durable:** yes

## Decision
Treat browser names as exact app identities. Agent-driven interactive and real-environment proof uses
real Google Chrome with the Browser Kit `agent` profile; Brave is eligible only when explicitly named.
Keep managed Chromium/Chrome for Testing only for explicitly hermetic automation, never as fallback or
evidence of real-user browser behavior.

## Constraints
- Real Chrome is closer to the user environment and less likely to invalidate anti-bot observations.
- Programmatic unpacked-extension loading can fail, so Computer Use must remain a real-Chrome fallback.

## Not Doing
- Do not delete the dormant Chrome-for-Testing provider while isolated CI checks may still use it.
- Do not allow generic session reuse to cross from Chrome into personal Brave state.

## Depends On
- `references/browser-control-policy.md`
- Browser Kit real-Chrome `Extensions.loadUnpacked` support.
