# Codex Dispatch Fallback

Named Codex agents are preferred. Some Codex hosts expose only generic `spawn_agent`
`agent_type` choices. When a skill requires a named `0th_*` agent that is unavailable,
dispatch a generic subagent with the matching fallback below.

Do not continue in the main thread solely because a named `0th_*` agent is not exposed
as an `agent_type`. Main-thread execution is only the fallback when `spawn_agent`
itself is unavailable or the subagent call fails.

| Named agent | Fallback heading | `agent_type` | `model` | `reasoning_effort` | Prompt must include |
|---|---|---|---|---|---|
| `0th_explorer` | `0th_explorer fallback` | `explorer` | `gpt-5.4-mini` | `medium` | Mapping question, relevant context already read, and required `SUMMARY` / `FILES` / `SYMBOLS` / `GAPS` / `READ_SET` shape. |
| `0th_test_runner` | `0th_test_runner fallback` | `default` | `gpt-5.4-mini` | `medium` | Test scope or command, failure-dossier requirement when applicable, and condensed `PASS` / `FAIL` return shape. |
| `0th_reviewer` | `0th_reviewer fallback` | `default` | `gpt-5.4` | `high` | Slice spec, diff, test output, acceptance criteria, and `VERDICT` / `Acceptance criteria` / `Issues` / `Scope` return shape. |
| `0th_verifier` | `0th_verifier fallback` | `worker` | `gpt-5.4` | `high` | Persisted verifier brief path, stack minimums, current branch, test output, report path, and a reminder that other agents may be active and unrelated edits must not be reverted. |
| `0th_experience_reviewer` | `0th_experience_reviewer fallback` | `default` | `gpt-5.4` | `high` | Decision or plan source, feature summary, verifier evidence, known concerns, and `VERDICT` / `Judgment source` / `Findings` / `Fix before human review` / `Deferred` return shape. |
| `0th_researcher` | `0th_researcher fallback` | `default` | `gpt-5.4` | `medium` | Question, source bucket, context, source-priority rules, and `ANSWER` / `KEY DETAILS` / `SOURCES` / `GAPS` shape. |
| `0th_deep_researcher` | `0th_deep_researcher fallback` | `default` | `gpt-5.4` | `high` | Source URL or path, extraction questions, research context, and the structured finding shape required by the phase. |
| `0th_synthesizer` | `0th_synthesizer fallback` | `default` | `gpt-5.4` | `high` | Raw note paths, existing world-model path when present, output path, consensus requirements, and gap/contradiction return shape. |
| `0th_experimenter` | `0th_experimenter fallback` | `worker` | `gpt-5.4` | `high` | Architecture doc path, hypothesis, success criteria, experiment output path, and a reminder that other agents may be active and unrelated edits must not be reverted. |

Fallback prompts must be self-contained: name the unavailable agent, explain that this is
a generic Codex fallback, include the task inputs, and preserve the named agent's expected
return shape. Keep raw logs, full webpages, and bulky intermediate outputs out of the
orchestrator context unless the skill explicitly asks for them.
