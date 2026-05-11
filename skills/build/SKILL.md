---
name: build
description: "Use when implementing a known code change, feature, or fix. Runs TDD on a feature branch and verifies behavior before PR handoff."
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
- See `../../references/stack-minimums.md` (workspace-shared) for the per-stack minimum exit criteria the verifier brief must name.

## Secret Handling

When a build needs credentials, keep resolved values outside the agent. Prefer code that reads named env vars or runtime bindings, and run commands through the project's safe secret runner. Examples:
- 1Password: `op run --env-file .env.1password -- <command>`
- Doppler: `doppler run -- <command>`
- Vault/cloud/platform secrets: use the project-documented runtime injection path
- No manager: a human may create an ignored `.env.local`; the agent may use the app's loader but must not `cat`, `head`, `grep`, or otherwise print its contents

Do not use revealing fallbacks such as `op read`, `op item get --reveal`, `op inject` to stdout, `op run --no-masking`, `printenv`, `env`, `set`, or shell tracing (`set -x`, `bash -x`). Verify presence with `[ -n "${SERVICE_API_KEY:-}" ] && echo "SERVICE_API_KEY: set" || echo "SERVICE_API_KEY: missing"` (only with shell tracing off — `set -x` / `bash -x` would leak the value). Never `echo "$SERVICE_API_KEY"` or `printenv SERVICE_API_KEY`. If no safe runner exists, stop and ask the human to configure one or run the secret-dependent command.

## Process

### 1. Read Context

- Read the decision record / plan / instruction
- Read relevant KB entries for this domain
- Read `CONTEXT.md` at the project root if it exists — use its vocabulary for variable names, file names, and test descriptions
- Understand the current codebase state
- On Codex-hosted runs, explicitly use `0th_explorer` first when the owning files, entry points, or data flow are not already obvious. Capture the explorer's JSON-fenced `READ_SET` block (files, symbols, tests, plus any `verified_claims` it confirmed or contradicted) and pass it to `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/read-set-reconcile.mjs" --read-set <json-path>` so claims you actually verified get flipped to `active` (with a fresh `last_confirmed_at`) and contradictions get marked `needs_review` with evidence. On Claude-hosted runs, the built-in `Explore` agent does not emit the JSON contract — extract files/symbols/tests by hand and write the JSON yourself before running the reconciler, or skip reconciliation for that exploration.

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
- For managed verification commands whose failures should produce a dossier, wrap the command with `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/failure-dossier-runner.mjs" --run-id <unique-run-id> -- <test command>`; use a fresh `--run-id` per run.
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

**Brief-construction discipline.** Before dispatching the verifier, read the stack-minimums reference (linked above) and walk its Detection signals against the repo. For every matched row, name the row's stack id and Minimum behavior in the brief. Do not write "skip if not feasible," "if X is hard to run, mark blocked," "skip the live UI exercise," or any equivalent escape language for stack-minimum rows — those rows are the floor, and the verifier will run them anyway. Feature-specific checks (which the brief *can* mark optional) must be additive to the stack-minimums, never replacements for them.

**Persist the brief.** Write the verifier brief to `${VERIFICATION_REPORT_DIR:-verification-report}/brief.txt` in the project root before dispatching. `/ship`'s gate script reads this file to detect bb-browser-escape-hatch matches independently of the verifier; without it, escape-hatch rows would not be enforced.

Dispatch the verifier agent with:
- Feature summary: what was built, which slices, acceptance criteria
- Stack-minimums: list of matched stack ids and the Minimum behavior the verifier must exercise per row
- Feature type(s): infer from build context — which feature-specific verification methods apply, additive to the stack-minimums
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

## Surgical Changes

Every changed line must trace to the slice spec. While building:

- Don't reformat, restyle, or add type hints to adjacent code that isn't part of your change.
- Don't refactor things that aren't broken or part of the slice.
- Match existing style even if you'd write it differently.
- If you spot unrelated dead code, a bug outside scope, or a refactor opportunity, note it in your handoff — don't fix it. (Worth its own `/improve-architecture` pass later.)
- Remove imports/symbols that *your* changes orphaned. Don't sweep pre-existing dead code.

## Iron Laws

- **No code without a failing test first** (for test-amenable work)
- **No claims without verification evidence** — run the command, read the output, then assert
- **Always on a branch** — never commit directly to main
- **Atomic commits per slice** — each commit is a self-contained change
- **Surgical changes only** — every changed line traces to the slice spec
- **No "done" without verification** — the verifier must PASS before /ship

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

- **Reads:** decision records, plan, domain knowledge, prior bugs in this area
- **Writes:** nothing (code is in git). But if a surprising pattern is discovered, write to KB.
