---
name: build
description: "Implement features with TDD on a feature branch. Takes a direct instruction, decision record, or plan. Red-green-refactor per slice, with BDD-style tests that describe user-visible behavior. Always branches, always PRs."
argument-hint: "[instruction or plan path]"
---

# Build

Implement with TDD. Branch per feature, PR to land.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as the starting brief. If `$ARGUMENTS`
is empty, infer the brief from the conversation.

## When to Use

Always — this is the default skill for getting code written.

Takes input from:
- A direct instruction ("add a /health endpoint")
- A decision record from /think
- A plan with slices from /plan

## Triage Preamble

```
What: [one sentence]
Input: [direct instruction / decision record path / plan path]
Branch: <branch-name>
Verification: TDD / before-after (for non-testable work)
```

Create the branch immediately:
```bash
git checkout -b <branch-name>
```

## Session Resumption

If resuming ongoing work:
1. Read the decision record and/or plan
2. Check current branch and recent commits
3. Run the test suite to confirm baseline
4. Report: "On branch <name>. N of M slices complete. Tests: X passing. Next: [slice]."

## Reference Files

- See `references/slice-checklist.md` for the compact per-slice loop, non-testable work checklist, and common build traps.
- See `references/verification-checklist.md` for the compact per-method verification loops and failure/severity classification.

## Process

### 1. Read Context

- Read the decision record / plan / instruction
- Read relevant KB entries for this domain
- Understand the current codebase state
- On Codex-hosted runs, explicitly use `0th_explorer` first when the owning files, entry points, or data flow are not already obvious

### 2. Build Per Slice

For each slice (or the single task if no plan):

**If work is test-amenable (logic, APIs, data):**

```
RED:    Write one failing test — BDD style, from the user's perspective
        Describe externally visible behavior through the public interface
        Run it. Confirm it fails for the right reason.
GREEN:  Write minimal code to pass.
        Run it. Confirm it passes. Confirm no regressions.
REFACTOR: Clean up if needed. Stay green.
COMMIT: Atomic commit for this slice.
```

**If work is NOT test-amenable (CSS, config, infrastructure):**

```
BEFORE: Capture current state (screenshot, curl output, config dump)
CHANGE: Make the change.
AFTER:  Capture new state. Compare with before.
VERIFY: Confirm the change does what was intended.
COMMIT: Atomic commit.
```

Rules:
- One slice at a time. Don't batch.
- Test behavior through public interfaces, not implementation details.
- Write tests as behavior descriptions, not implementation checks.
- Prefer names and assertions that read like living documentation of what the user or caller experiences.
- Minimal code to pass — no speculative features.
- Run tests after every change. Paste output.
- When work introduces heavy local ML/runtime dependencies, explicitly call out the service or deployment boundary. "The local pipeline runs" is not enough evidence that a production path exists.
- On Codex-hosted runs, explicitly dispatch `0th_test_runner` after each meaningful code change so raw test output stays out of the main thread
- On Codex-hosted runs, explicitly dispatch `0th_reviewer` after each slice to verify acceptance criteria before moving on

### 3. Mid-Build Bugs

If a test fails for an unexpected reason (not the behavior you're testing):
- STOP building.
- Switch to /debug protocol: investigate root cause before fixing.
- Don't ad-hoc fix and move on.

### 4. Escalation

If a slice fails after 3 attempts:
- STOP.
- Report what was tried and what failed.
- Ask the user: continue with a different approach, or escalate?

### 5. Verification

After all slices pass, run the verification phase before handing off to /ship.

```bash
# Run full test suite first
<test command>

# Confirm clean
git status
```

Dispatch the verifier agent with:
- Feature summary: what was built, which slices, acceptance criteria
- Feature type(s): infer from build context — which verification methods apply
- Current branch and test output

On Claude-hosted runs, dispatch `0th:verifier`. On Codex-hosted runs, dispatch `0th_verifier` explicitly.

The verifier exercises the feature as a real user (browser for UI, terminal for CLI, curl for API) and reports one of four outcomes:

| Outcome | Meaning | Action |
|---------|---------|--------|
| **PASS** | All applicable checks ran and passed | Proceed to /ship |
| **FAIL_UNRESOLVED** | Issues remain after 3 rounds | Stop. Report to user. |
| **BLOCKED** | Applicable checks could not run | Stop. Report to user. |
| **FAIL_FLAKY** | Transient failure persisted after retry | Stop. Report to user. |

**Only PASS allows handoff to /ship.** Any other outcome requires user intervention.

If verification finds and fixes issues, the verifier commits fixes atomically (separate from slice commits) and produces a verification report with evidence.

See `references/verification-checklist.md` for the compact per-method loops.

### 6. Completion

After verification passes:

Report:
```
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
Slices: N/N complete
Tests: X passing, 0 failing
Verification: PASS (N issues found and fixed)
Concerns: [if any]
```

Then hand off to /ship.

If you're drifting into shortcut logic, read `references/slice-checklist.md` before continuing.

## Iron Laws

- **No code without a failing test first** (for test-amenable work)
- **No claims without verification evidence** — run the command, read the output, then assert
- **Always on a branch** — never commit directly to main
- **Atomic commits per slice** — each commit is a self-contained change
- **No "done" without verification** — the verifier must PASS before /ship

## KB Integration

- **Reads:** decision records, plan, domain knowledge, prior bugs in this area
- **Writes:** nothing (code is in git). But if a surprising pattern is discovered, write to KB.
