---
name: debug
description: "Systematic debugging with root cause investigation. Use when something is broken — bugs, test failures, unexpected behavior, build failures. Iron law: no fixes without root cause. 3-strike escalation."
argument-hint: "[symptom or failing test]"
---

# Debug

Find the root cause, then fix it. Not the other way around.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as the starting symptom report. If
`$ARGUMENTS` is empty, infer the symptom from the conversation.

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

## Reference Files

- See `references/root-cause-patterns.md` for common investigation patterns, diagnostic prompts, and escalation signals.

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
6. On Codex-hosted runs, explicitly use `0th_explorer` when the owning code path is unclear and `0th_test_runner` for condensed repro or verification runs.

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

If you hit the 3-strike boundary or start rationalizing a shortcut, read `references/root-cause-patterns.md` before proceeding.

## KB Integration

- **Reads:** prior bugs in this area, architectural notes, known pitfalls
- **Writes:** root cause findings if non-obvious, patterns discovered, architectural observations
