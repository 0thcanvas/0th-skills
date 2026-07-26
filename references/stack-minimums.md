# Stack Minimums

Per-stack minimum exit criteria for verification. Read by `/build` (when constructing verifier briefs), the verifier (Step 0 stack detection), `/ship` (gate script), and `/debug` (when triaging).

## Why this exists

A verifier cannot return PASS by skipping the only check that exercises the seam where bugs in this stack live. `/build` may not write briefs that opt out of any applicable row. The verifier may not return PASS without exercising every applicable row. `/ship`'s gate script independently re-derives expected rows from this file's stack identifiers, parses the verifier's `stack_minimums_exercised` array, and refuses PR creation if any expected stack is missing.

## Detection is multi-match (root signals only, in v1)

A repo can match multiple rows when distinct *root-level* signals are present: e.g., `package.json` with `electron` dep AND `manifest.json` with `manifest_version: 3` matches both `electron-desktop` and `chrome-mv3-extension`. Every matched row is required.

**v1 limitation:** The gate script only inspects root-level files; nested workspaces (subdir packages with their own `package.json`, an extension with a separate `cli/` workspace) are not detected. Per-row signals also exclude themselves under conflict — `cli` requires "no UI deps," so a parent UI repo with a child CLI workspace will only match the UI row at the gate level even though both should be exercised. When you have a true monorepo or hybrid with nested workspaces, name the additional rows in the verifier brief so the verifier still exercises them — **but note that the v1 gate only validates rows its own detection logic finds at the root**, not stack ids mentioned in `brief.txt`. Nested-row enforcement is verifier-side (LLM-enforced) only in v1; for gate-level enforcement of nested rows, extend per-row signals here or wait for v2's subdirectory walker. Revisit when 0th has a real monorepo in production.

## Tool chain

Each row's minimum is a *behavior to exercise*, not a tool to use. The verifier selects the proof
lane before choosing a compatible tool:

Select the proof lane through `references/browser-control-policy.md` before choosing a tool:

1. **Hermetic browser runtime** — for isolated automation that does not claim real-user fidelity.
2. **`logged_in_browser`** — resolved from the runtime profile for extensions, authentication,
   anti-bot behavior, private state, and shared-tab cases.
3. **`browser_ui_fallback`** — resolved separately when the session-backed provider cannot perform a
   required UI action; it keeps the same required browser identity and authority boundary.

If no chain tool is usable for the matched stack on the running agent, the verifier returns BLOCKED — never PASS.

## Matrix

| Stack id | Detection signals (any match) | Minimum behavior |
|---|---|---|
| `electron-desktop` | `package.json` has `electron` in `dependencies`/`devDependencies`, or `electron/main.*` file present | Launch the built binary; renderer invokes ≥1 method through the `contextBridge → preload → ipcRenderer → ipcMain` chain; assert the resolved value (not just no exception). Crossing the IPC bridge is the point — paper-level symmetry checks do not satisfy this row. |
| `chrome-mv3-extension` | `manifest.json` with `"manifest_version": 3` | Background service worker responds to a message dispatched from a content script or extension popup; assert response shape. Real-environment proof resolves `logged_in_browser` and uses the exact configured application, profile, and extension build. Hermetic automation may supplement but cannot replace it. If programmatic loading fails, follow the capability recovery in `references/browser-control-policy.md`. |
| `web-app` | `next.config.*`, `vite.config.*`, `astro.config.*`, or `app/` / `pages/` directory present, AND no `electron` dep | Loaded route fetches ≥1 backend response and renders without console errors. Exit criteria: backend hit count ≥ 1, console error count = 0. |
| `cli` | `package.json` has `bin` field and no UI/electron deps | Spawn binary with fixture input; diff stdout against a known-good snapshot; assert exit code. |
| `service` | `Dockerfile`, `fly.toml`, or a declared health endpoint, with no UI surface | Hit ≥1 endpoint of the running service (deployed or local docker); verify response shape and status; assert auth boundary if present. |
| `session-backed-browser` | Brief explicitly names real-session, logged-in, shared-tab, user's browser, extension, anti-bot, or real-environment proof | Same evidence shape as `web-app`, sourced through the resolved `logged_in_browser` capability and exact configured identity. Check provider availability and existing sessions, load its guidance, reuse a matching session, and resolve `browser_ui_fallback` only when a required UI action remains unavailable. |

## Evidence contract — `stack_minimums_exercised`

The verifier's structured report at `${VERIFICATION_REPORT_DIR:-verification-report}/report.json` includes:

```json
{
  "outcome": "PASS|FAIL_UNRESOLVED|BLOCKED|FAIL_FLAKY",
  "stack_minimums_exercised": [
    {
      "stack": "electron-desktop",
      "criterion": "renderer invokes window.api.<method> through contextBridge",
      "tool": "playwright-electron",
      "evidence_path": "verification-report/dossier.json or screenshot path or test output ref",
      "exercised_at": "2026-05-03T12:34:56Z"
    }
  ]
}
```

`/ship`'s gate script reads this file, runs detection logic to compute the expected stack set for the repo, and refuses PR creation if any expected stack is absent from `stack_minimums_exercised` or if `outcome` ≠ `PASS`. `/ship` also requires `${VERIFICATION_REPORT_DIR:-verification-report}/proof-contract.json` and `${VERIFICATION_REPORT_DIR:-verification-report}/proof-result.json` to show that the chosen proof tier was actually satisfied; a green test run is not enough when the contract requires a real runtime, logged-in browser, external sandbox, or live surface. The result tier may be higher than the contract, but not lower.

The gate also reads `${VERIFICATION_REPORT_DIR:-verification-report}/brief.txt` (written by `/build` when dispatching the verifier) so it can independently detect `session-backed-browser` matches without trusting the verifier's claim. The env var `SHIP_GATE_BRIEF` overrides the file for ad-hoc runs.

Stack detection runs from the git toplevel (resolved via `git rev-parse --show-toplevel`) so `/ship` works from any subdirectory of the project. If the script is invoked outside a git repo, it falls back to the current working directory.

## Adding a row

When a new stack appears (Tauri desktop, mobile native, RAG service with vector DB, etc.), add a row here in a `/think` decision and update the gate script's detection logic in lockstep. Don't extend ad-hoc per project.

## Stack identifiers (machine-readable index)

Used by `/ship`'s gate script to reconcile expected vs exercised stacks. Keep this list in sync with the matrix above:

- `electron-desktop`
- `chrome-mv3-extension`
- `web-app`
- `cli`
- `service`
- `session-backed-browser`
