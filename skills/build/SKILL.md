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

For visual/frontend work, verification starts by naming the visual invariant and what could be
wrong. If the claim is visual, the evidence must be visual. Use a DOM/e2e test for behavior and
routing; use screenshot inspection for layout, fit, overlap, and responsive presentation; use a
pixel assertion or screenshot assertion for overlays, canvas, SVG, animation, and coordinate-system
alignment.

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

For UI, canvas, SVG, animation, overlay, responsive layout, or game-scene work, include visual
evidence in the verifier brief. Name the visual invariant that could fail, then specify the
evidence method: DOM/e2e test for behavior, screenshot inspection for layout/fit/overlap, or pixel
assertion/screenshot assertion for overlays, canvas, animations, and coordinate alignment. Do not
let "tests passed" stand in for visual fit.

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

**Only PASS allows product acceptance and handoff to /ship.** Any other outcome requires user intervention.

If verification finds and fixes issues, the verifier commits fixes atomically (separate from slice commits) and produces a verification report with evidence.

See `references/verification-checklist.md` for the compact per-method loops.

### 6. Product Acceptance Loop

After verifier PASS, run product acceptance before human review or /ship. This is where `/build`
takes responsibility for "is this genuinely ready?" rather than leaving product polish for the
human to discover.

First decide whether product acceptance is required:
- Required for complex, multi-slice, UI, content-heavy, onboarding, learning, user-interaction, or product-surface work.
- Not required only for mechanical/internal changes with no user-facing behavior, such as narrow test fixes, docs-only cleanup, or private refactors.

Write `${VERIFICATION_REPORT_DIR:-verification-report}/product-acceptance.json` either way
(default path: `verification-report/product-acceptance.json`). For
non-required work, set `required: false`, `outcome: "NOT_REQUIRED"`, and include a concrete
`required_rationale`. For required work, the report must end with `required: true` and
`outcome: "PASS"` before /ship.

Judge against this hierarchy: decision record, plan acceptance criteria, explicit user brief, then repo standards.
If that source material is too vague to judge subjective quality, stop with `BLOCKED_BY_SPEC`
instead of inventing taste.

For required acceptance, dispatch the experience reviewer:
- On Claude-hosted runs, dispatch `0th:experience-reviewer`.
- On Codex-hosted runs, dispatch `0th_experience_reviewer`.

Provide:
- Decision record, plan, and relevant user brief
- Feature summary, slices, acceptance criteria, and current branch
- Verifier report, screenshots, browser notes, terminal output, or other user-flow evidence
- Known concerns and any intentionally deferred items

For UI/content-heavy work, do not accept a diff-only review. The Product Acceptance Loop must inspect
screenshots, verifier evidence, live-flow notes, or equivalent user-facing evidence before judging
layout, copy, pedagogy, or interaction quality.

Finding classes:
- `BLOCKER`: must fix before human review
- `POLISH`: in-scope product improvement; fix before human review
- `NIT`: fix if cheap and low risk
- `OUT_OF_SCOPE`: record as deferred; do not expand the feature
- `BLOCKED_BY_SPEC`: stop and ask the user to clarify the decision or plan

Max 3 product acceptance rounds. In each round:
1. Fix all `BLOCKER` and in-scope `POLISH` findings.
2. Fix `NIT` findings only when cheap and low risk.
3. Record `OUT_OF_SCOPE` findings in the report without implementing them.
4. Rerun the exact affected tests and verifier path after fixes.
5. Dispatch the experience reviewer again with updated evidence.

After product acceptance passes, run code/diff counterpart review using `ask-counterpart-review`.
Persist the result to `${VERIFICATION_REPORT_DIR:-verification-report}/counterpart-review.md`.
If counterpart review is unavailable (quota, auth, network), write the exact reason to
`${VERIFICATION_REPORT_DIR:-verification-report}/counterpart-review.skipped` instead — the ship
gate reads either file and fails closed if neither exists or the skipped file is empty. If blockers
exist, fix them, rerun the relevant tests, rerun product acceptance if product behavior changed,
and rerun counterpart review. Never call counterpart review clean when it did not run.

The product acceptance report should include:

```json
{
  "schema_version": 1,
  "feature": "<short feature name>",
  "required": true,
  "required_rationale": "<why acceptance was required or not required>",
  "source": {
    "decision": "docs/decisions/...",
    "plan": "docs/plans/...",
    "user_brief": "<short summary or null>"
  },
  "judgment_hierarchy": [
    "decision_record",
    "plan_acceptance_criteria",
    "explicit_user_brief",
    "repo_standards"
  ],
  "outcome": "PASS",
  "rounds": [],
  "fixed_issues": [],
  "deferred_items": [],
  "evidence_paths": ["verification-report/<evidence-path>"],
  "reviewed_at": "2026-05-10T00:00:00.000Z"
}
```

Allowed outcomes: `PASS`, `NEEDS_ITERATION`, `BLOCKED_BY_SPEC`, `NOT_REQUIRED`.

### 7. Completion

After verification, product acceptance, and counterpart evidence pass:

Report:
```
STATUS: DONE | DONE_WITH_CONCERNS | BLOCKED
Slices: N/N complete
Tests: X passing, 0 failing
Verification: PASS (N issues found and fixed)
Product acceptance: PASS | NOT_REQUIRED (rounds, issues fixed, deferred items)
Counterpart review: clean | N blockers fixed | skipped — <exact unavailable reason>
Visual invariants: [checked invariant + evidence method/path, if visual work]
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

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" preflight`. It fetches upstream, reconciles previously unseen HEAD drift, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" brief --scope global` and read the `output_file` path from its JSON result; if the global brief is missing or corrupt, warn visibly and continue with project memory. Then run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" brief` and read the project `output_file`. Memory v2 runtime is the canonical agent recall path. Read generated briefs before browsing indexes, raw notes, or legacy KB/Obsidian markdown manually. Treat markdown KB material as optional fallback, import/export source, or human-rendered evidence only. Do not load source packs at startup; recall or expand source packs on demand.

## Open Loop Brief

Run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" task-brief` and read the `output_file` path from its JSON result after the memory brief; use it to resume unfinished work before starting new scope.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Use `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" write-gate` when the scope is ambiguous so the event is classified as project, global, both, or nothing durable. For direct durable claims, write through `memory remember` (shorthand for the full `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" remember` command shown above); do not hand-edit runtime `claims.jsonl`.

## Open Loop Integration

When work remains unfinished, blocked, or intentionally dropped, update open loops through `memory open-loop` (shorthand for the full `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory.mjs" open-loop` command); do not store TODOs as memory claims. Use `add` for new unfinished work, `block` for waiting states, `close` when completed, `drop` when no longer worth doing, and `reopen` when deferred work becomes active again.

## KB Integration

- **Reads:** decision records, plan, domain knowledge, prior bugs in this area
- **Writes:** nothing (code is in git). But if a surprising pattern is discovered, write to KB.
