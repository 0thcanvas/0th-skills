# Debug Reference

Use this file when the main protocol is clear but you need sharper investigation moves.

## Investigation Patterns

- Trace the bad value backward, not the error forward.
- Compare "working" and "broken" paths at the closest shared boundary.
- Reduce the repro before adding more logs.
- Prefer one diagnostic that proves or disproves the current hypothesis over broad noisy logging.

## Diagnostic Prompts

- "What changed most recently in the failing path?"
- "Where was this value last known to be correct?"
- "What invariant should hold here, and how can I assert it?"
- "Is the bug in data shape, timing, environment, or stale assumptions?"

## 3-Strike Boundary

If three hypotheses fail:

1. Stop trying variants of the same idea.
2. Summarize what has been ruled out.
3. Name what evidence is still missing.
4. Change the investigation angle before continuing.

If each attempted fix reveals a different failure in a different layer, call out the architectural smell directly instead of treating it as one isolated bug.

## Shortcut Warnings

- "I can hotfix this first and investigate later."
  No. A patch without a cause model is how bugs come back.
- "It is probably X."
  Convert "probably" into a diagnostic step or drop it.
- "One more quick try."
  After two misses, the third should already be a different approach.
