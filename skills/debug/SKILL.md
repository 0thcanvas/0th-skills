---
name: debug
description: "Use when something is broken: bugs, test failures, unexpected behavior, or build failures. Investigates root cause before fixing."
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
- For MV3 Chrome-extension bugs (service worker state, storage, console), use `@0th/browser-kit` + `@0th/browser-kit/ext-debug` (via a `browser-kit session open --ext …` session) rather than ad-hoc CDP — see the browser-kit README for setup.

## Secret Handling

Debugging often touches logs, traces, HARs, shell output, env vars, and browser sessions. Treat those as leak surfaces.

- Use the project's safe secret runner when reproducing secret-dependent behavior: `op run --env-file ... -- <command>`, `doppler run -- <command>`, Vault/cloud/platform runtime injection, or a human-created ignored `.env.local` loaded by the app.
- When a `.env.local` is present, run the app's loader rather than reading the file directly. Do not `cat`, `head`, `grep`, or otherwise print its contents.
- Never dump full environments, raw request headers, cookies, Authorization values, session storage, local storage, HAR bodies, or browser/CDP payloads into chat or subagent prompts.
- Do not run `op read`, `op item get --reveal`, `op inject` to stdout, `op run --no-masking`, `printenv`, `env`, `set`, or shell tracing (`set -x`, `bash -x`) around secrets.
- Verify only whether a named secret is present. If the value may have appeared in a trace/log/chat, report the category and recommend rotation without repeating the value.

## Iron Laws

```
NO HYPOTHESES WITHOUT A FEEDBACK LOOP
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

Phase 0 (loop) before Phase 1 (investigate). Phase 1 before any proposed fix.

## Process

### Phase 0: Build a feedback loop

**The loop is the skill.** Everything else is mechanical. With a fast, deterministic, agent-runnable pass/fail signal, bisection and hypothesis-testing become consumption of that signal. Without one, no amount of code-reading saves you.

Spend disproportionate effort here. Be aggressive. Refuse to give up.

Try in roughly this order:

1. **Failing test** at the seam closest to the bug (unit / integration / e2e).
2. **curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diff stdout against a known-good snapshot.
4. **Headless browser script** (Playwright) — drive the UI, assert on DOM / console / network.
5. **Replay a captured trace** — save real payload / event log to disk, replay through the code path in isolation.
6. **Throwaway harness** — minimal subset of the system, mocked deps, single function call exercising the bug path.
7. **Property / fuzz loop** — for "sometimes wrong output" bugs, run 1000 random inputs and look for the failure mode.
8. **Bisection harness** — automate `boot at state X, check, repeat` so you can `git bisect run` it.
9. **Differential loop** — run the same input through old vs new (or two configs), diff outputs.
10. **HITL bash script** — last resort, drive a human through `scripts/hitl-loop.template.sh` so the loop is still structured.

Visual bugs need a visual feedback loop. A DOM test is not enough for alignment, overlap, clipping, animation, canvas/SVG coordinates, or layout fit; capture a screenshot, video, screenshot assertion, or pixel assertion that proves the visible symptom changed.

**Iterate on the loop itself.** Once you have one, ask: faster (cache setup, skip unrelated init, narrow scope)? sharper (assert the specific symptom, not "didn't crash")? more deterministic (pin time, seed RNG, isolate filesystem, freeze network)? A 30-second flaky loop is barely better than no loop. A 2-second deterministic loop is a debugging superpower.

When a loop is managed verification and its failure should be surfaced back through 0th hooks, wrap it with `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/failure-dossier-runner.mjs" --run-id <unique-run-id> -- <loop command>`; use a fresh `--run-id` per run.

**Non-deterministic bugs.** The goal is a higher reproduction rate, not a clean repro. Loop the trigger 100×, parallelise, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not — keep raising the rate until it is.

**If you genuinely can't build a loop**, stop and say so explicitly. List what you tried. Ask the user for: environment access, a captured artifact (HAR, log dump, screen recording with timestamps), or permission for temporary instrumentation. Do not proceed to hypothesise without a loop.

### Phase 1: Investigate

1. **Read the error.** Stack traces, error messages, logs. Don't skim — read completely.
2. **Reproduce.** Can you trigger it reliably? If not, gather more evidence. Don't guess.
3. **Check recent changes.** `git log --oneline -20 -- <affected files>`. What changed?
4. **Trace the data flow.** Where does the bad value originate? Keep tracing backward until you find the source.
5. **Read KB.** Check for prior bugs in this area, known pitfalls, architectural quirks.
6. **Read `CONTEXT.md`** at the project root if it exists — use its vocabulary to align your hypothesis and report with the project's domain terms.
7. On Codex-hosted runs, explicitly use `0th_explorer` when the owning code path is unclear and `0th_test_runner` for condensed repro or verification runs.

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

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/session-preflight.mjs"`. It fetches upstream, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

When `.0th/memory/claims.jsonl` exists, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory-brief.mjs"` and read `.0th/memory/brief.md`; read it before browsing indexes or raw notes manually.

## Open Loop Brief

When `.0th/tasks/open-loops.jsonl` exists, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/open-loop-brief.mjs"` and read `.0th/tasks/brief.md` after the memory brief; use it to resume unfinished work before starting new scope.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Classify new knowledge as `decision`, `observation`, `root_cause`, `vocabulary`, `incident`, `repo_state`, `external_research`, or `nothing durable`. For durable outcomes, write through `memory-write.mjs`; do not hand-edit `.0th/memory/claims.jsonl`.

## Open Loop Integration

When work remains unfinished, blocked, or intentionally dropped, update `.0th/tasks/open-loops.jsonl` through `open-loop.mjs`; do not store TODOs as memory claims. Use `add` for new unfinished work, `block` for waiting states, `close` when completed, and `drop` when no longer worth doing.

## KB Integration

- **Reads:** prior bugs in this area, architectural notes, known pitfalls
- **Writes:** root cause findings if non-obvious, patterns discovered, architectural observations
