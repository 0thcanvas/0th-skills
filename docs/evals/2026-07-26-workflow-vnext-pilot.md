# Workflow vNext Pilot
**Date:** 2026-07-26
**Control:** `f8627faa40f597c273b40977dc37c5635be121e4`
**Runtime:** Codex CLI `0.146.0-alpha.3.1`, `gpt-5.6-sol`, low effort

## Result

All 18 coding runs passed. Direct execution used the fewest median tokens in every task. The
precommitted conservative rule selects direct for one bounded loop and an adaptive checkpoint for
ordered/debug work; it does not authorize a production-default change.

| Task | Formal plan | Adaptive checkpoint | Direct |
|---|---:|---:|---:|
| One-file feature | 2/2, 143,871 tokens | 2/2, 124,161 | 2/2, 74,105.5 |
| Ordered multi-file | 2/2, 178,388 | 2/2, 157,903 | 2/2, 120,017.5 |
| Root-cause debug | 2/2, 157,456.5 | 2/2, 140,090.5 | 2/2, 99,346.5 |

Structured fresh-context checkpoints retained every required claim, source, caveat, contradiction,
gap, and next-read id in 2/2 runs. Prose summaries retained the meaning but none of the audit ids in
0/2. The four-thread fan-out/synthesis case passed with all receipts and the unresolved
contradiction preserved.

Codex consumed the portable packet and passed the shared oracle. Claude Code `2.1.139` never reached
model output: after one pre-output adapter retry it returned `403 oauth_org_not_allowed`. Therefore
cross-harness contract transport is not established.

## Integrity and limits

- All scored Codex receipts attested to the frozen model/effort; protected fixtures were unchanged.
- The final content manifest recomputes every scored prompt against the run records; no prompt hash
  mismatched. Schema and adapter hashes were added after the runs, so that provenance is explicit
  but weaker than a pre-launch manifest.
- No scored event stream read an external skill; the stable temporary cwd had one trust entry.
- The fixtures are synthetic, the corpus has three task classes and two repetitions, and token
  counts include harness context.
- The recovery case demonstrates provenance retention, not actual host compaction quality.
- Fan-out workers used independent threads but were launched sequentially; no latency claim follows.
- Raw and invalid-run evidence remains ignored under `verification-report/workflow-vnext/`.

## Decision

Implement only the smallest evidence-adaptive slice: an outcome-level intent gate, direct/adaptive/
formal artifact selection, structured `ResultPacket` handoff, and receipt-bound synthesis. Keep
model routing and capability controls in adapters. Expand across the eight-task corpus before
considering a production default.
