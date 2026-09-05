---
name: debug
description: "Finds and proves a failure's root cause before changing code. Use when behavior is broken, flaky, slow, or unexpectedly failing."
---

# Debug

Build a feedback loop, prove the root cause, then fix only when authorized. Apply
`../../references/skills-kernel.md` once for root-task preflight, authority, optional delegation,
safety, and closeout.

## Enter / authority

- Enter for bugs, test/build failures, regressions, flakiness, and performance failures.
- `$ARGUMENTS` is the starting symptom when invoked directly.
- A diagnosis request authorizes investigation and reporting, not a code change.
- A fix request authorizes the smallest in-scope root-cause fix and proportionate verification.

## Iron laws

- No hypothesis without a feedback loop.
- No fix before root-cause evidence.
- Three failed attempts on the same hypothesis stop and reassess.

## 1. Feedback loop

Create the fastest deterministic signal at the seam nearest the symptom: failing test, CLI fixture,
request script, browser assertion, trace replay, differential run, fuzz loop, bisection harness, or
structured human loop.

Visual bugs need a visual feedback loop. A DOM test is not enough for alignment, overlap, clipping, animation, canvas/SVG coordinates, or layout fit; capture screenshot, video, screenshot assertion,
or pixel evidence.

Wrap managed failing commands when a failure dossier is useful:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/failure-dossier-runner.mjs" \
  --run-id <unique-run-id> -- <loop command>
```

If no useful loop can be built, return `BLOCKED` with what was tried and the exact missing artifact,
environment, or temporary-instrumentation permission. Do not guess beyond the evidence.

## 2. Root cause

1. Reproduce and read the complete error or visible symptom.
2. Check recent changes and trace the bad value or state backward to its origin.
3. Read relevant prior incidents, decisions, `CONTEXT.md`, and owning interfaces.
4. State one specific, falsifiable root-cause hypothesis.
5. Add the smallest diagnostic or controlled comparison that can disprove it, then rerun the loop.
6. Repeat with new evidence, not new speculation.

For large logs, use `context_handoff`: summary, source pointers, unresolved gaps, and next read
targets. Never place raw secrets, cookies, headers, HAR bodies, or private browser payloads into a
handoff.

For browser-extension bugs, apply `../../references/browser-control-policy.md`. Resolve
`logged_in_browser` and load its provider guidance; after one safe recovery attempt, resolve
`browser_ui_fallback` for any required UI action and preserve the exact browser/build identity.

## 3. Fix and prove

When fixes are authorized:

1. For testable behavior, add a public-interface regression test and confirm it fails for the
   proven reason. For non-testable operational, configuration, or visual changes, capture the
   before state and define the observable after-state check; do not manufacture a tautological test.
2. Make the smallest root-cause fix.
3. Rerun the feedback loop and the checks covering affected behavior. Run a broader suite when
   coupling, risk, failures, or repository requirements justify it. Once checks pass, repeat or
   broaden them only for new changes, failures, or unresolved concerns.
4. Remove temporary diagnostics and record the proof path.

Unavailable browser, simulator, sandbox, or session evidence returns `blocked_real_env`; weaker
evidence cannot substitute. Non-obvious root causes may become a durable memory/KB claim at closeout.

## Report

Return symptom, root cause, fix or diagnosis-only boundary, verification evidence, and status.
Apply `retro_open_loop_closeout` when proof was skipped, blocked, flaky, or repeatedly failed.

## References

- `references/root-cause-patterns.md`
- `../../references/skills-kernel.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
