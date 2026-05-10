# Memory Backend Eval

Questions: 13
Selected baseline: Thin 0th local layer (thin_0th_local_layer)

## Scores

| Baseline | Mode | Answered | Score |
|---|---|---:|---:|
| Current markdown lookup | manual_markdown | 2/13 | 0.15 |
| Thin 0th local layer | local_executable | 13/13 | 1 |
| GBrain-style task manager | research_pattern | 1/13 | 0.08 |
| MemPalace-style verbatim retrieval | research_pattern | 1/13 | 0.08 |
| agentmemory-style lifecycle/profile | research_pattern | 4/13 | 0.31 |

## Misses

- Current markdown lookup: q01-session-end-is-not-a-memory-boundary (event_capture, lifecycle_state); q02-when-should-a-skill-write-memory (event_capture, lifecycle_state); q03-clean-behind-upstream-startup (repo_preflight, repo_sync); q04-dirty-or-divergent-branch-startup (repo_preflight); q05-fast-forward-changes-claimed-files (repo_sync, lifecycle_state); q06-starting-brief-before-manual-browsing (generated_brief); q07-code-exploration-without-whole-kb-scan (read_set_reconciliation, lifecycle_state); q08-recurring-retro-misfire (incident_aggregation, event_capture); q10-which-backend-now (backend_decision); q12-canonical-durable-memory-writer (canonical_writer, generated_brief); q13-what-open-loops-remain (open_loop_tracking)
- Thin 0th local layer: none
- GBrain-style task manager: q01-session-end-is-not-a-memory-boundary (lifecycle_state); q02-when-should-a-skill-write-memory (lifecycle_state); q03-clean-behind-upstream-startup (repo_preflight, repo_sync); q04-dirty-or-divergent-branch-startup (repo_preflight); q05-fast-forward-changes-claimed-files (repo_sync, lifecycle_state); q06-starting-brief-before-manual-browsing (generated_brief); q07-code-exploration-without-whole-kb-scan (read_set_reconciliation, lifecycle_state); q08-recurring-retro-misfire (incident_aggregation); q09-self-testing-failure-dossiers (failure_artifacts); q10-which-backend-now (backend_decision); q11-exact-backend-decision-wording (verbatim_retrieval); q12-canonical-durable-memory-writer (canonical_writer, generated_brief)
- MemPalace-style verbatim retrieval: q01-session-end-is-not-a-memory-boundary (lifecycle_state); q02-when-should-a-skill-write-memory (lifecycle_state); q03-clean-behind-upstream-startup (repo_preflight, repo_sync); q04-dirty-or-divergent-branch-startup (repo_preflight); q05-fast-forward-changes-claimed-files (repo_sync, lifecycle_state); q06-starting-brief-before-manual-browsing (generated_brief); q07-code-exploration-without-whole-kb-scan (read_set_reconciliation, lifecycle_state); q08-recurring-retro-misfire (incident_aggregation); q09-self-testing-failure-dossiers (failure_artifacts); q10-which-backend-now (backend_decision); q12-canonical-durable-memory-writer (canonical_writer, generated_brief); q13-what-open-loops-remain (open_loop_tracking)
- agentmemory-style lifecycle/profile: q03-clean-behind-upstream-startup (repo_preflight, repo_sync); q04-dirty-or-divergent-branch-startup (repo_preflight); q05-fast-forward-changes-claimed-files (repo_sync); q07-code-exploration-without-whole-kb-scan (read_set_reconciliation); q08-recurring-retro-misfire (incident_aggregation); q09-self-testing-failure-dossiers (failure_artifacts); q10-which-backend-now (backend_decision); q11-exact-backend-decision-wording (verbatim_retrieval); q12-canonical-durable-memory-writer (canonical_writer)

## Recommendation

Select the highest-scoring baseline for the current workflow, then revisit external backends only after an executable retrieval benchmark shows better recall without losing repo workflow integration.
