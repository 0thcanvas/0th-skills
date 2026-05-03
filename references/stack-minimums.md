# Stack Minimums

Per-stack minimum exit criteria for verification. Read by `/build` (when constructing verifier briefs), the verifier (Step 0 stack detection), `/ship` (gate script), and `/debug` (when triaging).

## Why this exists

A verifier cannot return PASS by skipping the only check that exercises the seam where bugs in this stack live. `/build` may not write briefs that opt out of any applicable row. The verifier may not return PASS without exercising every applicable row. `/ship`'s gate script independently re-derives expected rows from this file's stack identifiers, parses the verifier's `stack_minimums_exercised` array, and refuses PR creation if any expected stack is missing.

## Detection is multi-match (root signals only, in v1)

A repo can match multiple rows when distinct *root-level* signals are present: e.g., `package.json` with `electron` dep AND `manifest.json` with `manifest_version: 3` matches both `electron-desktop` and `chrome-mv3-extension`. Every matched row is required.

**v1 limitation:** The gate script only inspects root-level files; nested workspaces (subdir packages with their own `package.json`, an extension with a separate `cli/` workspace) are not detected. Per-row signals also exclude themselves under conflict — `cli` requires "no UI deps," so a parent UI repo with a child CLI workspace will only match the UI row even though both should be exercised. When you have a true monorepo or hybrid with nested workspaces, name the additional rows manually in the verifier brief; the gate will still enforce them via `stack_minimums_exercised`. Revisit subdirectory walking for v2 when 0th has a real monorepo in production.

## Tool chain

Each row's minimum is a *behavior to exercise*, not a tool to use. The verifier walks this chain in order and picks the first usable tool:

1. **Playwright** (default) — runs in CI, deterministic, has `_electron.launch` for Electron and headless modes for web.
2. **bb-browser** (escape hatch) — real Chrome session for logged-in or shared-tab cases that Playwright can't reproduce.
3. **Computer-use** (last resort) — only on agents that have it granted (not all 0th sub-agents do).

If no chain tool is usable for the matched stack on the running agent, the verifier returns BLOCKED — never PASS.

## Matrix

| Stack id | Detection signals (any match) | Minimum behavior |
|---|---|---|
| `electron-desktop` | `package.json` has `electron` in `dependencies`/`devDependencies`, or `electron/main.*` file present | Launch the built binary; renderer invokes ≥1 method through the `contextBridge → preload → ipcRenderer → ipcMain` chain; assert the resolved value (not just no exception). Crossing the IPC bridge is the point — paper-level symmetry checks do not satisfy this row. |
| `chrome-mv3-extension` | `manifest.json` with `"manifest_version": 3` | Background service worker responds to a message dispatched from a content script or extension popup; assert response shape. Use Playwright + Chrome-for-Testing by default; bb-browser only when the extension must run in the user's real Chrome profile. |
| `web-app` | `next.config.*`, `vite.config.*`, `astro.config.*`, or `app/` / `pages/` directory present, AND no `electron` dep | Loaded route fetches ≥1 backend response and renders without console errors. Exit criteria: backend hit count ≥ 1, console error count = 0. |
| `cli` | `package.json` has `bin` field and no UI/electron deps | Spawn binary with fixture input; diff stdout against a known-good snapshot; assert exit code. |
| `service` | `Dockerfile`, `fly.toml`, or a declared health endpoint, with no UI surface | Hit ≥1 endpoint of the running service (deployed or local docker); verify response shape and status; assert auth boundary if present. |
| `bb-browser-escape-hatch` | Brief explicitly names "real-session", "logged-in", "shared-tab", or "user's Chrome" | Same evidence shape as `web-app`, but sourced from `browser_*` MCP tools against the user's Chrome session. Only this row uses bb-browser as the *primary* tool, not a chain fallback. |

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

`/ship`'s gate script reads this file, runs detection logic to compute the expected stack set for the repo, and refuses PR creation if any expected stack is absent from `stack_minimums_exercised` or if `outcome` ≠ `PASS`.

The gate also reads `${VERIFICATION_REPORT_DIR:-verification-report}/brief.txt` (written by `/build` when dispatching the verifier) so it can independently detect bb-browser-escape-hatch matches without trusting the verifier's claim. The env var `SHIP_GATE_BRIEF` overrides the file for ad-hoc runs.

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
- `bb-browser-escape-hatch`
