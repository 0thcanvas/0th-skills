---
name: ship
description: "Verifies and opens a reviewable pull request from completed work. Use when a branch is ready to push and present for landing."
argument-hint: "[branch or PR-ready change]"
---

# Ship

Ship through a PR and stop before merge unless the user approves that specific PR. Apply
`../../references/skills-kernel.md` once for root-task preflight, authority, safety, and closeout.

## Enter / authority

- Enter after `/build` or for an existing PR-ready branch.
- `$ARGUMENTS` identifies the branch, diff, or landing target when invoked directly.
- Shipping authorizes the normal branch push and PR creation workflow. It does not authorize merge,
  production deployment, unrelated external writes, or destructive cleanup.

## 1. Verify

Run the complete relevant test suite and inspect actual output. Then review branch status, full diff,
stat, and commits against the intended scope. Stop on failures, unexpected files, secrets, unsafe
secret access, debug residue, tracked verification artifacts, or workstation-local paths.

Read `verification-report/proof-contract.json` and `verification-report/proof-result.json`.
`proof_contract_required` means the proof result tier cannot be below the proof contract tier;
`minimum_tier_satisfied` must be true and evidence paths must exist.
`BLOCKED_REAL_ENV` stops shipping.

## 2. Evidence gate

Run:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/ship-gate.mjs"
```

The gate validates proof, stack minimums, the product acceptance report at
`verification-report/product-acceptance.json`,
specialist return receipts,
review evidence or an explicit no-review reason, freshness, tracked local evidence, and local-path
leaks. `/ship` does not re-judge product quality or start first-time substantive review. If the proof contract depends on specialist evidence, unresolved `adapter_unavailable` or incomplete receipts
must already produce an honest blocked outcome.

Any non-zero exit returns to `/build`; do not create the PR.

## 3. Create PR

Read `templates/pr-body.md` and fill that shape with scope, tests, proof tier, evidence paths,
product acceptance, review decision/yield, and unresolved concerns. Then push the feature branch and
create the PR. Never force-push main.

Present the PR URL, file list, evidence status, proof status, and concerns. Stop at **ready to merge**.
Merge approval is PR-specific; a previous “ship it” or general automation instruction does not
authorize the current PR.

After explicit approval for this PR, squash-merge and delete the branch using the project workflow.

## 4. Local evidence closeout

`verification-report/` is local gate evidence, not a submitted artifact. Keep it only while the PR
needs reruns or follow-up. After the PR is merged, closed, abandoned, or its worktree is removed,
delete `${VERIFICATION_REPORT_DIR:-verification-report}`. If it contains sensitive browser/session payloads,
private screenshots, HARs, cookies, tokens, or secret-adjacent data, preserve only a safe summary and
delete the raw files immediately.

Apply `retro_open_loop_closeout` before handoff so skipped proof, blocked environments, repeated
failures, and unfinished follow-up remain visible.

## References

- `templates/pr-body.md`
- `../../references/skills-kernel.md`
- `../../references/proof-tiers.md`
- `../../references/stack-minimums.md`
- `../../references/specialist-routing.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
