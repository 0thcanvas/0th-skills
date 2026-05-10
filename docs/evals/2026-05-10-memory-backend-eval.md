# Memory Backend Eval

Questions: 11
Selected baseline: Thin 0th local layer (thin_0th_local_layer)

## Scores

| Baseline | Mode | Answered | Score |
|---|---|---:|---:|
| Current markdown lookup | manual_markdown | 2/11 | 0.18 |
| Thin 0th local layer | local_executable | 11/11 | 1 |
| MemPalace-style verbatim retrieval | research_pattern | 1/11 | 0.09 |
| agentmemory-style lifecycle/profile | research_pattern | 3/11 | 0.27 |

## Misses

- Current markdown lookup: q01-session-end-is-not-a-memory-boundary (event_capture, lifecycle_state); q02-when-should-a-skill-write-memory (event_capture, lifecycle_state); q03-clean-behind-upstream-startup (repo_preflight, repo_sync); q04-dirty-or-divergent-branch-startup (repo_preflight); q05-fast-forward-changes-claimed-files (repo_sync, lifecycle_state); q06-starting-brief-before-manual-browsing (generated_brief); q07-code-exploration-without-whole-kb-scan (read_set_reconciliation, lifecycle_state); q08-recurring-retro-misfire (incident_aggregation, event_capture); q10-which-backend-now (backend_decision)
- Thin 0th local layer: none
- MemPalace-style verbatim retrieval: q01-session-end-is-not-a-memory-boundary (lifecycle_state); q02-when-should-a-skill-write-memory (lifecycle_state); q03-clean-behind-upstream-startup (repo_preflight, repo_sync); q04-dirty-or-divergent-branch-startup (repo_preflight); q05-fast-forward-changes-claimed-files (repo_sync, lifecycle_state); q06-starting-brief-before-manual-browsing (generated_brief); q07-code-exploration-without-whole-kb-scan (read_set_reconciliation, lifecycle_state); q08-recurring-retro-misfire (incident_aggregation); q09-self-testing-failure-dossiers (failure_artifacts); q10-which-backend-now (backend_decision)
- agentmemory-style lifecycle/profile: q03-clean-behind-upstream-startup (repo_preflight, repo_sync); q04-dirty-or-divergent-branch-startup (repo_preflight); q05-fast-forward-changes-claimed-files (repo_sync); q07-code-exploration-without-whole-kb-scan (read_set_reconciliation); q08-recurring-retro-misfire (incident_aggregation); q09-self-testing-failure-dossiers (failure_artifacts); q10-which-backend-now (backend_decision); q11-exact-backend-decision-wording (verbatim_retrieval)

## Recommendation

Select the highest-scoring baseline for the current workflow, then revisit external backends only after an executable retrieval benchmark shows better recall without losing repo workflow integration.

