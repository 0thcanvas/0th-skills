# Workflow Verification

Use this reference when a 0th workflow needs to keep context compact, choose proof honestly, or
close out unfinished or corrected work.

## Contract Keys

### `context_handoff`

Long-running workflows, research passes, and multi-agent work should hand off compact state instead
of raw context accumulation.

Required fields:
- `summary`: what is known now, in the fewest useful sentences.
- `source pointers`: files, URLs, artifacts, screenshots, reports, or record ids that support the summary.
- `unresolved gaps`: what is unknown, disputed, blocked, or intentionally deferred.
- `next read targets`: the specific files, artifacts, pages, or commands the next step should inspect first.

Rules:
- Start from memory briefs, context maps, plans, and targeted reads before loading raw artifacts.
- Keep raw source material on disk when a workflow already has a source-pack, `raw/`, report, log,
  screenshot, or verification artifact lane.
- Bring bounded summaries into the orchestrator context. Do not paste whole transcripts, logs,
  pages, or broad file dumps when a pointer plus summary is enough.

### `proof_contract_required`

Ship-bound implementation work requires the existing proof artifacts from `proof-tiers.md`; `/ship`
enforces these through `scripts/ship-gate.mjs`:

- `verification-report/proof-contract.json` before implementation.
- `verification-report/proof-result.json` after verification.

Required closeout fields from the proof result:
- `minimum_proof_tier`
- `minimum_tier_satisfied`
- `verified_head`
- `outcome`
- `evidence_paths`
- `blocked_reason` when outcome is not `PASS`

Docs-only or metadata-only changes still use a `T0` contract when they are ship-bound. Do not add a
separate waiver or not-applicable proof schema.

The local gate checks internal consistency, evidence-file existence, and commit freshness. It does
not independently prove an agent executed a command. Fresh-checkout CI owns objective T0/T1 command
proof when available, and `/ship` must inspect those PR checks before claiming ready-to-merge.

### `blocked_real_env`

If the selected tier needs browser, simulator, session-backed, sandbox, or live evidence and that
environment cannot run, the honest result is `BLOCKED_REAL_ENV` with the exact blocker and strongest
partial evidence.

Do not downgrade the proof tier because a real environment is inconvenient. Tests alone do not
satisfy `T2`, `T3`, or `T4`.

Credential-dependent proof is unavailable only after the credential-dependent preflight in
`secret-control-policy.md`. Missing variables in the current process alone never establish a real
environment blocker. Retry the proof through the project's generated local env file and normal
application loader. If the file is missing or intentionally stale, run the documented sync once. The blocked report must
name each attempted safe runner and its sanitized error; otherwise `BLOCKED` or `BLOCKED_REAL_ENV`
is premature.

For recurring credential-dependent work, the generated gitignored owner-only env file is the
steady-state runner. Normal commands read it directly and do not contact 1Password. Only explicit
setup or rotation syncs may contact 1Password.

### `retro_open_loop_closeout`

At workflow boundaries, explicitly consider whether the session created durable memory, an open
loop, or a retro incident.

Trigger retro/open-loop consideration when:
- the user corrected the agent's behavior or interpretation,
- verification was skipped, blocked, or weaker than the selected proof contract,
- a tool failed repeatedly or returned unusable evidence,
- work remains unfinished, blocked, intentionally dropped, or deferred.

Durable lessons go through the Memory Write Gate. Unfinished tasks go through `memory open-loop`.
User corrections, agent misfires, and skipped-verification incidents go through `/retro`.
