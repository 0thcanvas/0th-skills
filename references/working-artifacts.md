# Working Artifacts

<!-- lifecycle: current — durable shared contract for the three artifact lanes;
     supersede when the memory contract absorbs this lane or when the verification-report
     exception changes. -->

Working artifacts are temporary files that help a human or agent think through work before the
useful result is compacted, promoted, or discarded.

## Lanes

- **Memory v2** is the compact agent record. Durable lessons, decisions, tombstones,
  supersession links, and evidence pointers belong there.
- **repo docs** are promoted current evidence. They should describe live behavior, an active
  constraint, or a legally/user-required record.
- **working artifacts** are temporary scaffolding. Drafts, exploratory reports, human-facing
  comparisons, and similar scratch outputs are not agent truth by default; each skill names the
  specific artifact types it produces.

## Paths

Place temporary `work/` and `artifacts/` files under the existing 0th state root rather than
hardcoding a home path. Resolve the state root using the same order as Memory v2:
`$OTH_SKILLS_STATE_DIR`, then `$XDG_STATE_HOME`, then `~/.0th/skills/...`.

Use checkout-local `${VERIFICATION_REPORT_DIR:-verification-report}` for gate-consumed evidence.
This is an explicit local-state exception: `/build`, `/ship`, and `ship-gate` read proof contracts,
proof results, verifier briefs, structured reports, and product acceptance from
`verification-report`, but those files are normally ignored and not committed. Optional review
output may live there temporarily, but no review or skip artifact is required by the ship gate.

Do not commit raw command captures, large live JSON dumps, screenshots, HARs, browser/CDP payloads,
or test logs from `verification-report`. Summarize the result in the PR body, promote a compact
decision/doc when the evidence is durable, or keep the raw artifact local/CI-attached.

Keep `verification-report` only while it has active gate, debugging, or review-follow-up value. Once
the PR body contains the safe verification summary and the PR is merged, closed, abandoned, or the
worktree is being removed, delete `${VERIFICATION_REPORT_DIR:-verification-report}`. If the directory
contains sensitive browser/session payloads, private screenshots, HARs, cookies, tokens, or
secret-adjacent data, extract only a safe summary and delete the raw local copy immediately.

## Lifecycle Choices

Use lifecycle, not age:

- **current**: keep in repo docs when the file describes live behavior, an active constraint, or a
  required record and has a clear owner or caller.
- **compact**: extract the durable lesson into Memory v2, then discard or archive the working file.
- **supersede**: record the replacement and source pointer when a newer decision or feature
  replaces the old one.
- **delete**: remove pure scaffolding once it has no current value and no uncaptured lesson.

Before deleting repo docs that Memory v2 cites, leave a durable tombstone, evidence record, source
pack, or replacement source pointer so memory does not point at vanished proof.

Git history, merged PRs, and tags are the historical record. Do not keep a file in the current tree
only because it was once useful. Executable eval inputs belong with fixtures; raw run results belong
in local or CI artifacts; their reusable conclusion belongs in a current contract or Memory claim.

## Maintenance Reports

Artifact maintenance reports stale repo-doc candidates before any destructive change. The report
should classify each candidate as current, compact, supersede, or delete, and it should name the
evidence path or Memory v2 claim that justifies the recommendation.

For deleted or revamped features, remove or supersede docs that describe the old behavior in the
same lifecycle pass. If the old docs explain a durable lesson, compact that lesson into Memory v2
first. If Memory v2 cites the old doc, leave a tombstone, evidence record, source pack, or
replacement source pointer before removal. Always report before destructive cleanup; do not silently
delete repo docs just because they look old.

Internal plans default to the state root and are deleted after merge, abandonment, or replacement.
A committed plan is exceptional and requires lasting shared value. `/think` likewise chooses the
smallest durable record: update a current contract, write compact Memory, or create a dated decision
record only when its rationale must remain independently auditable.
