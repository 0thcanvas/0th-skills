---
name: ship
description: "Review and land code via PR. Always creates a PR — no direct merges to main. Runs tests, sends the diff to the counterpart reviewer, and lets the user inspect the file list and changes. Use when implementation is complete and ready to land."
---

# Ship

Create a PR. Always. No exceptions.

The PR is your inspection point — the one moment you see the full picture of what changed.

## When to Use

After /build completes. Or when you have changes on a branch ready to land.

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
- Any secrets, credentials, debug code left in?

### 3. Create the PR

```bash
git push -u origin <branch>

gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
- <what changed and why, 2-3 bullets>

## Decision
<link to decision record if one exists>

## Test Evidence
- <test suite output summary: X passing, 0 failing>

## Review Notes
- <anything the reviewer should pay attention to>
EOF
)"
```

PR title: short, imperative ("Add spaced repetition engine", not "Added some stuff for SR").

### 4. Counterpart Reviews the Diff

Send the branch diff to the counterpart reviewer:
- In Claude-hosted runs, use Codex
- In Codex-hosted runs, use Claude
- The counterpart responds with:
- **Blockers:** must fix before merge
- **Suggestions:** worth considering, user decides
- **Nits:** style/minor, accept or skip

If blockers exist: fix on the branch, push, re-run counterpart review.

### 5. User Inspects

Present to user:
- The PR URL
- The file list (so they can see scope at a glance)
- The counterpart review (blockers/suggestions/nits)
- Any concerns from the self-review

User decides: merge, request changes, or close.

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

## KB Integration

- **Reads:** nothing (operates on the diff)
- **Writes:** nothing (the PR is the record)
