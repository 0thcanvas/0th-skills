---
name: ship
description: "Use when implementation is complete and ready for tests, review, push, and PR creation. Always lands through a PR."
argument-hint: "[branch or PR-ready change]"
---

# Ship

Create a PR. Always. No exceptions.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as the branch, diff, or landing target.
If `$ARGUMENTS` is empty, infer the shipping scope from the conversation and current git state.

The PR is your inspection point — the one moment you see the full picture of what changed.

## When to Use

After /build completes. Or when you have changes on a branch ready to land.

## Template Files

- See `templates/pr-body.md` for the default PR structure so the review context stays consistent.

## Process

### 1. Verify

Run the full test suite. Paste output. No "should pass" — evidence first.

```bash
<test command>
git status
```

If tests fail, stop. Fix first (use /debug if needed).

### 2. Review the Diff

```bash
git diff main..HEAD --stat    # file list — scope check
git diff main..HEAD           # full diff
git log main..HEAD --oneline  # commit history
```

Self-review:
- Are there files that shouldn't have changed?
- Is the scope contained to what was intended?
- Any hardcoded local workstation paths left in? Flag macOS/Linux/Windows user-profile paths, or HOME-based fallbacks to a local 0th Canvas checkout.
- Any secrets, credentials, debug code left in?
- Any unsafe secret access patterns left in? Flag `op read`, `op item get --reveal`, `op inject` to stdout, `op run --no-masking`, `printenv`, `env`, `set`, shell tracing (`set -x`, `bash -x`), command-argv secrets, raw Authorization headers, cookies, HARs, or browser/CDP payloads.
- If the project does not use 1Password, confirm its equivalent secret path still keeps resolved values outside chat/logs and injects them only into the target runtime.

### 3. Create the PR

**Run the ship gate first.** It independently re-derives expected stack minimums from the repo (the matrix in `../../references/stack-minimums.md`) and refuses PR creation if the verifier did not exercise them. The gate is the only mechanical layer in 0th's flow that converts verifier discipline into a non-LLM gate; running `gh pr create` without it bypasses the architecture.

The gate also scans tracked files for hardcoded workstation-local paths before the stack check. This runs even when no app/runtime stack is detected, because portability leaks are still release blockers in docs-only or skills-only repos.

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/ship-gate.mjs"
```

If the gate exits non-zero, **stop**. Do not run `gh pr create`. The output names which expected stacks were not exercised; re-dispatch the verifier (return to /build's Verification step or invoke /verifier directly with a brief that names the missing rows) to exercise them, then re-run the gate. The gate reads `${VERIFICATION_REPORT_DIR:-verification-report}/report.json`; the detection logic mirrors `../../references/stack-minimums.md` so the matrix and the gate stay in sync via the lockstep workflow described in that file.

Only after the gate exits zero, read `templates/pr-body.md`, fill in its placeholders, and use that filled result as the PR body.
Do not invent a second PR-body shape in this skill. The template file is the source of truth.

```bash
git push -u origin <branch>
gh pr create --title "<title>" --body "<filled contents of templates/pr-body.md>"
```

PR title: short, imperative ("Add spaced repetition engine", not "Added some stuff for SR").

### 4. Counterpart Reviews the Diff

Send the branch diff to the counterpart reviewer using `ask-counterpart-review`.
The companion script auto-detects the host and routes to the configured counterpart.
Redact any secret-bearing context before sending it. Counterpart review gets names, references, and findings; never resolved values.
- The counterpart responds with:
- **Blockers:** must fix before merge
- **Suggestions:** worth considering, user decides
- **Nits:** style/minor, accept or skip

If blockers exist: fix on the branch, push, re-run counterpart review.
If the counterpart review times out, hangs, or the wrapper is interrupted, do not treat the wrapper status as the review result. First inspect the persisted session log / resume artifact for that counterpart run. If the counterpart answered there, summarize that answer and continue from it. If there is no answer, retry only after reporting that the log was checked.
If the counterpart review fails because quota is exhausted or the counterpart is unavailable for the session, report that exact condition and proceed with self-review only for this session unless the user asks to wait or retry. Make the final/user-inspection summary say `Counterpart review: skipped — quota exhausted` (or the observed unavailable reason), not `clean`.
If the counterpart review fails for any other reason, report the error and let the user decide: proceed without review, retry later, or explicitly authorize a same-model fallback (see `ask-counterpart-review`'s Error Handling section for the labeled-fallback shape).

### 5. User Inspects

Present to user:
- The PR URL
- The file list (so they can see scope at a glance)
- The counterpart review (blockers/suggestions/nits)
- Any concerns from the self-review

User decides: merge, request changes, or close. Merge approval is PR-specific: do not carry approval from an earlier PR, a prior "ship it", or a general shipping instruction into a newly opened PR. After checks and reviews pass, stop at "ready to merge" until the user explicitly approves merging that PR number or otherwise clearly approves that specific PR.

### 6. Merge

After user approves:

```bash
gh pr merge <pr-number> --squash --delete-branch
```

Squash keeps main history clean. Delete branch avoids clutter.

## Iron Laws

- **Always a PR.** Even for one-line changes. The PR is visibility, not ceremony.
- **Tests must pass before PR creation.** Not after. Before.
- **Never force-push to main.** If something went wrong, revert with a new commit.

## Completion

```
STATUS: DONE
PR: <url>
Tests: X passing, 0 failing
Counterpart review: [clean / N suggestions / N blockers resolved]
```

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/session-preflight.mjs"`. It fetches upstream, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Brief

When `.0th/memory/claims.jsonl` exists, run `node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/memory-brief.mjs"` and read `.0th/memory/brief.md`; read it before browsing indexes or raw notes manually.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Classify new knowledge as `decision`, `observation`, `root_cause`, `vocabulary`, `incident`, `repo_state`, `external_research`, or `nothing durable`. For durable outcomes, write through `memory-write.mjs`; do not hand-edit `.0th/memory/claims.jsonl`.

## KB Integration

- **Reads:** nothing (operates on the diff)
- **Writes:** nothing (the PR is the record)
