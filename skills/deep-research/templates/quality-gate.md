# Quality Gate Evaluation: {Topic}
## Phase: {5|7}
## Iteration: {N}
## Date: YYYY-MM-DD

| # | Criterion | Result | Evidence | Retry Count |
|---|-----------|--------|----------|-------------|
| 1 | Decomposition grounded | PASS/FAIL/ADVISORY | {every sub-problem traces to original question} | 0/2 |
| 2 | Evidence, not assumption | PASS/FAIL/ADVISORY | {every technique has source URL} | 0/2 |
| 3 | Verified > unverified | PASS/FAIL/ADVISORY | {solution relies on verified findings} | 0/2 |
| 4 | Limitations acknowledged | PASS/FAIL/ADVISORY | {failure modes listed} | 0/2 |
| 5 | Cross-domain attempted | PASS/FAIL/ADVISORY | {>=1 sub-problem searched outside obvious field} | 0/2 |
| 6 | Contradiction resolved | PASS/FAIL/ADVISORY | {no unresolved disagreements} | 0/2 |
| 7 | Experiment targets risk | PASS/FAIL/ADVISORY/N/A | {tests most uncertain assumption} | 0/2 |
| 8 | No implementation drift | PASS/FAIL/ADVISORY | {still addresses original question} | 0/2 |
| 9 | Recency check | PASS/FAIL/ADVISORY | {key sources from last 2 years} | 0/2 |
| 10 | Buildable specificity | PASS/FAIL/ADVISORY | {names specific models/libs/APIs} | 0/2 |

## Overall: PASS / FAIL (criteria {N} failed)

## Loop-back Action
{If FAIL: which criterion, target phase, what to investigate}
{If ADVISORY: which criteria downgraded, recorded reason}
