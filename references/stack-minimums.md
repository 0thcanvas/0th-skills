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

1. **Playwright** — for explicitly hermetic automation that does not claim real-user browser fidelity.
2. **Browser Kit** — primary path for real Google Chrome proof, including extensions, authentication,
   anti-bot behavior, logged-in state, and shared-tab cases.
3. **Computer-use** — real-Chrome fallback when Browser Kit cannot perform a required UI action;
   target the Google Chrome app explicitly and follow Computer Use confirmation requirements.

If no chain tool is usable for the matched stack on the running agent, the verifier returns BLOCKED — never PASS.

## Matrix

| Stack id | Detection signals (any match) | Minimum behavior |
|---|---|---|
| `electron-desktop` | `package.json` has `electron` in `dependencies`/`devDependencies`, or `electron/main.*` file present | Launch the built binary; renderer invokes ≥1 method through the `contextBridge → preload → ipcRenderer → ipcMain` chain; assert the resolved value (not just no exception). Crossing the IPC bridge is the point — paper-level symmetry checks do not satisfy this row. |
| `chrome-mv3-extension` | `manifest.json` with `"manifest_version": 3` | Background service worker responds to a message dispatched from a content script or extension popup; assert response shape. Real-environment proof uses Browser Kit with `browser-kit session open --provider chrome --profile agent --ext <path>`. An explicitly hermetic Playwright-managed run may supplement this proof but cannot replace it. If programmatic loading fails, follow the Computer Use recovery in `references/browser-control-policy.md`. |
| `web-app` | `next.config.*`, `vite.config.*`, `astro.config.*`, or `app/` / `pages/` directory present, AND no `electron` dep | Loaded route fetches ≥1 backend response and renders without console errors. Exit criteria: backend hit count ≥ 1, console error count = 0. |
| `cli` | `package.json` has `bin` field and no UI/electron deps | Spawn binary with fixture input; diff stdout against a known-good snapshot; assert exit code. |
| `service` | `Dockerfile`, `fly.toml`, or a declared health endpoint, with no UI surface | Hit ≥1 endpoint of the running service (deployed or local docker); verify response shape and status; assert auth boundary if present. |
| `browser-kit-escape-hatch` | Brief explicitly names "real-session", "logged-in", "shared-tab", "user's Chrome", extension, anti-bot, or real-environment proof | Same evidence shape as `web-app`, but sourced through Browser Kit's managed `browser_*` MCP tools against real Google Chrome with the `agent` profile. Before relying on those tools, run `browser-kit mcp status`; start or attach with `browser-kit session open --provider chrome --profile agent`; if OpenCLI Browser Bridge or another tool owns `localhost:19825`, move Browser Kit with `--cdp-port <port> --daemon-port <port>` or `BROWSER_KIT_CDP_PORT` / `BROWSER_KIT_DAEMON_PORT`; call `browser_tab_list` before opening or navigating; pass a tab to `browser_open`; use `browser_tab_new` only for intentional fresh tabs. If a required action fails, follow `references/browser-control-policy.md`; do not silently switch browser identities. |

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

The gate also reads `${VERIFICATION_REPORT_DIR:-verification-report}/brief.txt` (written by `/build` when dispatching the verifier) so it can independently detect browser-kit-escape-hatch matches without trusting the verifier's claim. The env var `SHIP_GATE_BRIEF` overrides the file for ad-hoc runs.

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
- `browser-kit-escape-hatch`

Compatibility alias: `/ship` still accepts `bb-browser-escape-hatch` in older verifier reports, but new reports should use `browser-kit-escape-hatch`.
