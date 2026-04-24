# Verification Reference

Use this file when you need the compact per-method verification loops, not as the default thing to read first.

## UI Features

1. Preflight: confirm dev server is ready, capture startup errors if any. If the session browser is down, `browser-kit session open`; if the `bb-browser` MCP is not registered for the current host, `browser-kit mcp install --host <host>`.
2. Navigate via browser automation, record the exact URL tested.
3. Visual: screenshot, check layout/spacing/alignment, resize to mobile/tablet.
4. Functional: fill forms, click buttons, navigate flows, verify success/error/loading states.
5. Accessibility: keyboard nav works, focus visible, form labels present, error messages associated.

## CLI Features

1. Run command with typical arguments.
2. Verify exit codes, output format, help text accuracy.
3. Error paths: missing required args, invalid input.
4. Edge cases: empty input, long input, special characters.

## API Features

1. Hit endpoints with curl/fetch.
2. Read: response shape (keys/structure) matches schema, status codes correct, error responses well-formed.
3. Write: successful mutation returns expected result, validation errors helpful, auth/permissions enforced.

## Component Library

1. Render in browser (Storybook or standalone).
2. Verify all documented variants plus representative prop combinations (not full combinatorics).
3. Check: default state, documented props, responsive behavior, accessibility.

## Background/System Features

1. Trigger the job/webhook/task.
2. Verify: job completes, expected side effects occurred, error/retry behavior works (only when safe, deterministic, non-destructive).
3. Check: idempotency, timeout/retry config, failure does not leave inconsistent state.

## Failure Classification

| Type | Action |
|---|---|
| Product bug | Fix (verify→fix loop) |
| Test bug | Fix the test, not product code |
| Environment failure | Report to user immediately — do not waste rounds |
| Transient/flaky | Retry once (no round consumed), then report |

## Severity Gate

| Severity | Fix | Regression test | Expand |
|---|---|---|---|
| Critical | Yes | Yes | Only if fix touched shared abstraction |
| Moderate | Yes | Yes | No |
| Minor | Yes | No | No |

Regression test matches the layer: UI → e2e, API → integration, CLI → command-level.
Test bugs: fix directly, no regression test needed.

## Outcome

BLOCKED > FAIL_UNRESOLVED > FAIL_FLAKY > PASS.
Only PASS allows /build to proceed to /ship.
