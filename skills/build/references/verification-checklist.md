# Verification Reference

Use the methods relevant to affected behavior and the proof contract. Apply `../../../references/stack-minimums.md` for required stacks; docs-only static proof may skip unrelated runtime rows, while T2+ requirements remain mandatory. Verification-only returns findings and evidence without product/test edits; fixes require delegated implementation authority. External writes and test-data creation must stay within authorized effects.

## UI Features

1. Preflight: confirm the dev server is ready and capture startup errors. Select the proof lane through `../../../references/browser-control-policy.md`. Use hermetic automation only when no real-user fidelity is claimed. For extensions, authentication, anti-bot behavior, logged-in/shared-tab/private-state checks, or other real-environment proof, resolve `logged_in_browser`, verify its availability, and load its provider guidance.
2. Navigate through the resolved capability and record the exact URL or surface. Inspect existing sessions first, reuse a matching one, and open a new session only when no suitable session exists or isolation is required.
3. After one provider-guided recovery attempt, resolve `browser_ui_fallback` for a required UI action. Never silently substitute a browser identity that does not satisfy the TaskSpec.
4. Visual: before checking, state the Visual invariant that could fail. Use DOM/e2e tests for behavior/routing, screenshot inspection for layout/fit/overlap/responsive presentation, and pixel assertion or screenshot assertion for overlays, canvas, SVG, animations, and coordinate-system alignment.
5. Functional: fill forms, click buttons, navigate flows, verify success/error/loading states.
6. Accessibility: keyboard nav works, focus visible, form labels present, error messages associated.

For visual/frontend claims, separate verified by tests from visually inspected in the final report.
Include the screenshot path or pixel evidence path when fit, overlap, alignment, or motion matters.

## CLI Features

1. Run command with typical arguments.
2. Verify exit codes, output format, help text accuracy.
3. Error paths: missing required args, invalid input.
4. Edge cases: empty input, long input, special characters.

## API Features

1. Hit endpoints with curl/fetch.
2. Read: response shape (keys/structure) matches schema, status codes correct, error responses well-formed.
3. For authorized write tests, verify mutation results, validation, and auth/permissions in the permitted environment; tag and clean up created test data. If a required write probe lacks authority, return that blocked requirement without executing it.

## Component Library

1. Render in browser (Storybook or standalone).
2. Verify all documented variants plus representative prop combinations (not full combinatorics).
3. Check: default state, documented props, responsive behavior, accessibility.

## Background/System Features

1. Trigger the job/webhook/task.
2. Verify: job completes, expected side effects occurred, error/retry behavior works (only when safe, deterministic, non-destructive).
3. Check: idempotency, timeout/retry config, failure does not leave inconsistent state.

## Findings and Rechecks

Classify product/test failures separately from environment failures and transient errors. In verification-only work, return product/test findings without fixing files. With implementation authority, fix within scope and rerun the failed path plus directly affected checks. Retry a transient error once when safe; report unresolved flakiness. After three failed attempts on the same bug, return the evidence and next investigation needed rather than continuing speculative fixes.

Add public-interface regression coverage for testable behavior changes. Use existing validation and before/after evidence for non-testable or non-behavioral changes; avoid tests that merely restate the edit. Run required project checks and broaden testing only when changed behavior, shared abstractions, failures, or unresolved risks justify it.

Apply `../../../references/secret-control-policy.md` before credential-related blocking. Missing environment variables alone do not prove unavailable credentials. Keep secrets and PII out of output and evidence. Stop resources and remove fixtures you created, preserve preexisting resources, and report any cleanup failures.

## Outcome

BLOCKED_REAL_ENV > BLOCKED > FAIL_UNRESOLVED > FAIL_FLAKY > PASS. Keep all findings visible even when a blocked outcome takes precedence. Only PASS permits the verification gate to proceed.

Use the canonical `proof-result.json` contract in `../../../references/proof-tiers.md`, including the final verified commit's `verified_head`. Do not claim commit-bound proof while product/test edits remain uncommitted or required evidence is missing.
