---
name: debug
description: "Systematic debugging with root cause investigation. Use when something is broken — bugs, test failures, unexpected behavior, build failures. Iron law: no fixes without root cause. 3-strike escalation."
---

# Debug

Find the root cause, then fix it. Not the other way around.

## When to Use

- Bug reports
- Test failures
- Unexpected behavior
- Build failures
- Performance problems
- "It was working yesterday"

Also invoked by /build when a mid-build test fails unexpectedly.

## Triage Preamble

```
Symptom: [what's broken, in one sentence]
Severity: blocking / degraded / cosmetic
First seen: [when, or "unknown"]
```

## Session Resumption

If resuming a debug session:
1. Read any prior debug notes in KB
2. Read recent commits in the affected area
3. Report: "Last session investigated X. Hypothesis was Y. Status: [confirmed/disproved/untested]."

## Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## Process

### Phase 1: Investigate

1. **Read the error.** Stack traces, error messages, logs. Don't skim — read completely.
2. **Reproduce.** Can you trigger it reliably? If not, gather more evidence. Don't guess.
3. **Check recent changes.** `git log --oneline -20 -- <affected files>`. What changed?
4. **Trace the data flow.** Where does the bad value originate? Keep tracing backward until you find the source.
5. **Read KB.** Check for prior bugs in this area, known pitfalls, architectural quirks.

Output: "Root cause hypothesis: [specific, testable claim about what is wrong and why]."

### Phase 2: Test the Hypothesis

1. Add a diagnostic (log, assertion, debug output) at the suspected root cause.
2. Reproduce. Does the evidence match?
3. If wrong: form new hypothesis. Return to Phase 1 with new information.

### Phase 3: Fix

1. **Write a failing test** that reproduces the bug through the public interface.
2. **Run it.** Confirm it fails for the right reason.
3. **Fix the root cause.** Smallest change that eliminates the actual problem.
4. **Run it.** Confirm it passes. Confirm no regressions.
5. **Run full test suite.** Paste output.

### Phase 4: Report

```
SYMPTOM:    [what the user observed]
ROOT CAUSE: [what was actually wrong]
FIX:        [what changed, with file:line references]
EVIDENCE:   [test output showing fix works]
TEST:       [regression test location]
STATUS:     DONE | DONE_WITH_CONCERNS | BLOCKED
```

Write findings to KB if the root cause was non-obvious.

## Escalation (3-Strike Rule)

If 3 hypotheses fail:
- STOP.
- Do not attempt hypothesis #4 without a fundamentally different approach.
- Report: what was tried, what was ruled out, what remains unclear.
- Ask: continue with different approach, or escalate to user?

If each fix reveals a new problem in a different place — that's not a bug, it's an architectural problem. Say so.

## Anti-Rationalization

| Thought | Do this instead |
|---|---|
| "Quick fix for now" | There is no "for now." Fix the root cause. |
| "I think I see it, let me just fix..." | Investigate first. Seeing symptoms != understanding cause. |
| "One more try" (after 2 failures) | That's #3. Stop and reassess. |
| "It's probably X" | Probably isn't evidence. Verify. |

## KB Integration

- **Reads:** prior bugs in this area, architectural notes, known pitfalls
- **Writes:** root cause findings if non-obvious, patterns discovered, architectural observations
