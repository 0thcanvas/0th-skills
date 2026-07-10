# Real Environment Recipes

Use this reference after choosing a proof tier from `proof-tiers.md`. These recipes name the
evidence that usually separates "tests passed" from "the feature actually works where users feel
it."

## Chrome MV3 Extension

Minimum tier: usually `T2`; use `T3` when login/session state or a real commerce/content site is
required.

Evidence:
- Production extension build completed.
- Unpacked extension loaded into real Google Chrome with Browser Kit profile `agent`; Brave requires
  an explicit operator request, and a managed test browser cannot satisfy real-environment proof.
- Target page or popup opened.
- Content script or popup exercised the changed behavior.
- Background service worker stayed alive long enough to respond, or was rediscovered after idle.
- Console/network/service-worker evidence captured.
- Screenshot or browser note proves the user-visible state when applicable.

Blocked states:
- CAPTCHA/challenge page prevents reaching the target state.
- Required logged-in browser profile is unavailable.
- Extension worker cannot be attached or messaged.

Return `BLOCKED_REAL_ENV` with the exact blocker and the strongest partial evidence; do not call
unit tests enough for MV3 runtime behavior.

## Web App Or Visual UI

Minimum tier: usually `T2`.

Evidence:
- Dev server or production preview started successfully.
- Real route loaded in browser automation.
- Console error count is checked.
- User flow is clicked/typed/navigated.
- Visual invariant is named before inspection.
- Screenshot, pixel assertion, or DOM/e2e evidence matches the claim.

## CLI Or Local API

Minimum tier: usually `T1`.

Evidence:
- Built command/server runs from the public entrypoint.
- Typical command/request succeeds.
- Error path is exercised.
- Output/status/schema matches expectations.
- Fixture or snapshot captures the public contract.

## External Sandbox

Minimum tier: usually `T3`.

Evidence:
- Auth/session/sandbox boundary is named.
- Safe test data is used.
- API/callback/payment/broker/email flow is exercised in sandbox or authenticated dev account.
- Side effects are idempotent or cleaned up when feasible.

Blocked states:
- Missing sandbox credentials or expired session.
- Provider outage or challenge page.
- Operation would cross into live/destructive behavior without approval.

## Live Or Destructive Surface

Minimum tier: `T4`.

Evidence:
- Human explicitly approves the exact live action.
- The action is performed once with bounded blast radius.
- Result and rollback/cleanup state are recorded.

Without explicit approval, stop before the live step and record the proof result as blocked.
