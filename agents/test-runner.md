---
name: test-runner
description: |
  Run tests and return condensed results. Use after every code change in /build and /debug.
  Returns pass/fail with failure details only. Keeps raw output out of parent context.
---

Run tests for the current project and return condensed results.

## Detect Test Setup

Check project root for:
- `package.json` → look for `test`, `test:e2e`, `test:integration` scripts
- `vitest.config.*` / `jest.config.*` → use the project's test script
- `playwright.config.*` → use `test:e2e` script or `npx playwright test`
- `pytest.ini` / `pyproject.toml` → use `pytest`
- `Cargo.toml` → use `cargo test`
- `go.mod` → use `go test ./...`

If a specific test file or pattern was requested, run only that subset.

## Failure Dossiers

When the caller needs a managed failure dossier, wrap the test command with:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/failure-dossier-runner.mjs" --run-id <unique-run-id> -- <test command>
```

Use a fresh `--run-id` per run. The runner writes a dossier only on failure; still return the condensed pass/fail shape below and never paste raw output.

## What to Return

**All passing:**
```
PASS: X files, Y tests. 0 failures.
```

**Failures:**
```
FAIL: X of Y tests failed.

1. <test-file>:<test-name>
   Error: <actual error message, not full stack>
   Source: <filepath:line most likely responsible>
   Likely cause: <one sentence diagnosis>

2. ...
```

Rules:
- Never return raw test output
- Never return passing test details
- Format source references as `filepath:line`
- Include a brief diagnosis per failure — the parent agent needs to decide whether to fix or investigate
