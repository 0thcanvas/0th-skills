# Proof Tiers

Use this reference when `/build`, the verifier, or `/ship` needs to decide whether tests are
enough or whether the feature must be exercised closer to its real runtime.

## Tier Ladder

| Tier | Meaning | Satisfying evidence |
|---|---|---|
| `T0` | Static or isolated proof. Appropriate for docs, narrow refactors, pure helpers, or metadata changes. | Lint/typecheck/unit tests or before/after diff evidence. |
| `T1` | Local runtime proof. Appropriate for CLIs, APIs, services, or logic whose real behavior is reachable without UI/session state. | Built artifact plus command, curl/fetch, local service, or integration proof through the public interface. |
| `T2` | User-facing runtime proof. Appropriate for UI, browser extensions, desktop apps, mobile/simulator flows, visual work, or anything users experience directly. | Browser/device/app exercise with screenshots, console/network notes, pixel/screenshot assertions, or real interaction logs. |
| `T3` | Session-backed or external-sandbox proof. Appropriate when behavior depends on login state, browser profile, broker/payment sandbox, third-party callback, extension worker, or another non-unit environment. | The T2/T1 proof plus authenticated/session-backed or sandbox evidence. If unavailable, return `BLOCKED_REAL_ENV`; do not downgrade to T0/T1. |
| `T4` | Live/prod/destructive proof. Appropriate for production changes, irreversible writes, real payments/trades/emails, or user-visible external side effects. | Explicit human approval for the live action plus captured result. Without approval, return blocked, not pass. |

## Proof Contract

Before coding, `/build` writes `${VERIFICATION_REPORT_DIR:-verification-report}/proof-contract.json`:

```json
{
  "schema_version": 1,
  "feature": "<short feature name>",
  "minimum_proof_tier": "T0|T1|T2|T3|T4",
  "selected_rationale": "<why this tier is the floor>",
  "required_evidence": ["<evidence item>", "<evidence item>"],
  "real_env_risks": ["<what could make tests insufficient>"],
  "created_at": "2026-05-10T20:00:00.000Z"
}
```

Do not choose a lower tier because the real environment is inconvenient. If the proper tier cannot
run, the result is blocked.

## Proof Result

After verification, the verifier writes `${VERIFICATION_REPORT_DIR:-verification-report}/proof-result.json`:

```json
{
  "schema_version": 1,
  "feature": "<short feature name>",
  "minimum_proof_tier": "T0|T1|T2|T3|T4",
  "selected_rationale": "<copied or sharpened from proof-contract.json>",
  "required_evidence": ["<evidence item>", "<evidence item>"],
  "outcome": "PASS|BLOCKED_REAL_ENV",
  "minimum_tier_satisfied": true,
  "verified_head": "<full commit id verified by this result>",
  "evidence_paths": ["verification-report/<evidence-path>"],
  "blocked_reason": null,
  "checked_at": "2026-05-10T20:30:00.000Z"
}
```

`/ship` fails closed when `proof-result.json` is missing, stale, malformed, bound to a different
commit, has `outcome != "PASS"`, `minimum_tier_satisfied != true`, or cites missing/empty evidence.
This is a local consistency guardrail. Fresh-checkout CI is the independent authority for objective
T0/T1 command execution when the repository provides it.

`verification-report/` is local gate evidence, not source. Evidence paths may point at ignored
local files; do not commit bulky raw outputs just to make those paths browsable in GitHub. Put the
human-readable summary in the PR body and promote only durable, compact conclusions to docs.

## Rule Of Thumb

- Tests can satisfy `T0`.
- Tests plus local executable/runtime proof can satisfy `T1`.
- Tests cannot satisfy `T2+` by themselves.
- Challenge pages, missing browser sessions, unavailable simulators, missing sandbox credentials, or blocked external services produce `BLOCKED_REAL_ENV`, not `PASS`.
