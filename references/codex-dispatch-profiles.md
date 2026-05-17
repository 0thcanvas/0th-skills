# Codex Dispatch Profiles

Codex `spawn_agent` currently exposes generic `agent_type` roles such as `default`,
`explorer`, and `worker`. The `0th_*` names below are workflow task profiles, not
values to pass as `agent_type`.

When a skill says to use `0th_explorer`, `0th_reviewer`, or another `0th_*` Codex
profile, dispatch `spawn_agent` with the generic role, model, reasoning effort, and
prompt shape from this table.

Do not continue in the main thread for work that a Codex profile can handle. Main-thread
execution is only for when `spawn_agent` itself is unavailable or the subagent call
fails.

| Codex profile | Prompt heading | `agent_type` | `model` | `reasoning_effort` | Prompt must include |
|---|---|---|---|---|---|
| `0th_explorer` | `0th_explorer profile` | `explorer` | `gpt-5.4-mini` | `medium` | Mapping question, relevant context already read, and required `SUMMARY` / `FILES` / `SYMBOLS` / `GAPS` / `READ_SET` shape. |
| `0th_test_runner` | `0th_test_runner profile` | `default` | `gpt-5.4-mini` | `medium` | Test scope or command, failure-dossier requirement when applicable, and condensed `PASS` / `FAIL` return shape. |
| `0th_reviewer` | `0th_reviewer profile` | `default` | `gpt-5.4` | `high` | Slice spec, diff, test output, acceptance criteria, and `VERDICT` / `Acceptance criteria` / `Issues` / `Scope` return shape. |
| `0th_verifier` | `0th_verifier profile` | `worker` | `gpt-5.4` | `high` | Persisted verifier brief path, stack minimums, current branch, test output, report path, and a reminder that other agents may be active and unrelated edits must not be reverted. |
| `0th_experience_reviewer` | `0th_experience_reviewer profile` | `default` | `gpt-5.4` | `high` | Decision or plan source, feature summary, verifier evidence, known concerns, and `VERDICT` / `Judgment source` / `Findings` / `Fix before human review` / `Deferred` return shape. |
| `0th_researcher` | `0th_researcher profile` | `default` | `gpt-5.4` | `medium` | Question, source bucket, context, source-priority rules, and `ANSWER` / `KEY DETAILS` / `SOURCES` / `GAPS` shape. |
| `0th_deep_researcher` | `0th_deep_researcher profile` | `default` | `gpt-5.4` | `high` | Source URL or path, extraction questions, research context, and the structured finding shape required by the phase. |
| `0th_synthesizer` | `0th_synthesizer profile` | `default` | `gpt-5.4` | `high` | Raw note paths, existing world-model path when present, output path, consensus requirements, and gap/contradiction return shape. |
| `0th_experimenter` | `0th_experimenter profile` | `worker` | `gpt-5.4` | `high` | Architecture doc path, hypothesis, success criteria, experiment output path, and a reminder that other agents may be active and unrelated edits must not be reverted. |

Profile prompts must be self-contained: name the `0th_*` profile, include the task
inputs, and preserve that profile's expected return shape. Keep raw logs, full webpages,
and bulky intermediate outputs out of the orchestrator context unless the skill
explicitly asks for them.
