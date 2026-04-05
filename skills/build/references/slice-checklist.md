# Build Reference

Use this file when you need the compact execution loop, not as the default thing to read first.

## Per-Slice Checklist

### Testable work

1. Write one failing test through the public interface.
2. Confirm it fails for the reason you intend to fix.
3. Implement the smallest change that makes it pass.
4. Re-run the focused test, then relevant nearby tests.
5. Refactor only while staying green.
6. Dispatch `0th_test_runner` on Codex-hosted runs after meaningful code changes.
7. Dispatch `0th_reviewer` on Codex-hosted runs before moving to the next slice.

### Non-testable work

1. Capture the current state first.
2. Make one bounded change.
3. Capture the new state in the same format.
4. Compare before/after artifacts directly.
5. Commit only when the evidence matches the intended change.

## Boundary Check

If the slice adds heavy local runtimes, ML models, or machine-specific services:

1. State whether the intended production path is local-only, service-backed, or still undefined.
2. Call out what deployment boundary is missing if the path is still undefined.
3. Do not equate "pipeline completes on this machine" with "ready to ship."

## Common Traps

- "This is too small to test."
  Small regressions still regress. Write the test.
- "I'll clean up this adjacent thing while I'm here."
  Finish the slice first. Nearby refactors are how scope drifts.
- "The output probably passed."
  Read the actual command output before claiming success.
- "The failure is weird, but I can patch around it."
  Unexpected failures belong to `debug`, not to improvisation.
- "The local model/runtime works, so production is handled."
  Only if the serving and deployment boundary is defined. Otherwise report the gap explicitly.

## Escalate Early

Pause and reassess if:

- the failing test does not exercise the public behavior you care about
- you are on your third implementation attempt for the same slice
- you are adding speculative code "for later"
- you are skipping verification because the change feels obvious
