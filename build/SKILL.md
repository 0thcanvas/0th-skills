---
name: build
description: "Implement features with TDD on a feature branch. Takes a direct instruction, decision record, or plan. Red-green-refactor per slice, verification gates, Codex diff review. Always branches, always PRs."
---

# Build

Implement with TDD. Branch per feature, PR to land.

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

## Process

### 1. Read Context

- Read the decision record / plan / instruction
- Read relevant KB entries for this domain
- Understand the current codebase state

### 2. Build Per Slice

For each slice (or the single task if no plan):

**If work is test-amenable (logic, APIs, data):**

```
RED:    Write one failing test — describes behavior through public interface
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
- Minimal code to pass — no speculative features.
- Run tests after every change. Paste output.

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

### 5. Completion

After all slices pass:

```bash
# Run full test suite
<test command>

# Confirm clean
git status
```

Report:
```
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
Slices: N/N complete
Tests: X passing, 0 failing
Concerns: [if any]
```

Then hand off to /ship.

## Anti-Rationalization

| Thought | Do this instead |
|---|---|
| "Too simple to test" | Simple code breaks. Write the test. |
| "I'll test after" | Test first or it doesn't count. |
| "Just this once" | No exceptions without user permission. |
| "Let me refactor this nearby code" | Don't. Stay on the slice. |
| "Tests pass, I'm confident" | Run the command. Paste the output. Then say it. |

## Iron Laws

- **No code without a failing test first** (for test-amenable work)
- **No claims without verification evidence** — run the command, read the output, then assert
- **Always on a branch** — never commit directly to main
- **Atomic commits per slice** — each commit is a self-contained change

## KB Integration

- **Reads:** decision records, plan, domain knowledge, prior bugs in this area
- **Writes:** nothing (code is in git). But if a surprising pattern is discovered, write to KB.
