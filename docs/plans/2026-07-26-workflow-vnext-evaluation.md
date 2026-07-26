# Workflow vNext Evaluation Plan
**Decision:** direct user instruction on 2026-07-26 to run the proposed experiments and proceed from evidence
**Slices:** 5
**Review status:** optional; execution complete with one explicit portability blocker

## Review note
- The earlier workspace-export denial did not establish a system rule against sending internal
  plans to a counterpart. The user clarified that internal plans are allowed; only secrets,
  personal data, and explicitly excluded content remain outside the disclosure boundary.
- The same-model review was advisory input, not approval authority. The later review study replaced
  the mandatory gate with `docs/decisions/2026-07-26-evidence-seeking-review.md`.
- Resolved prerequisite: the separate Codex probe-schema fix passed 35 focused tests and a live
  three-profile probe returned `status: ready`.

## Architecture
- Keep the current workflow as the control; vNext is an experimental contract until behavioral gates pass.
- Compare prospective coordination (`CoordinationPlan`) separately from learned state
  (`EvidenceArtifact`) and transport (`StateCheckpoint` / `ResultPacket`).
- Run fresh-context cases from identical fixtures with deterministic acceptance tests or explicit scoring rubrics.
- Keep portable artifact schemas harness-neutral; live probing, launch, and receipt extraction remain adapter-owned.
- Store raw run evidence under ignored `verification-report/`; promote only the protocol, scores, and conclusions.

## Precommitted Experimental Protocol
- Control revision: `0th-skills` `main@f8627faa40f597c273b40977dc37c5635be121e4`; every prompt,
  fixture, schema, skill excerpt, and adapter transformation is content-hashed in the run manifest.
- Coding units: concrete fixtures for `one-file-feature`, `ordered-multi-file`, and
  `root-cause-debug` from the existing eight-task taxonomy.
- Conditions: `formal-plan`, `adaptive-state`, and `direct`; the common prompt is byte-identical and
  only the immutable policy block changes. Executors never see prior runs or aggregate scores.
- Repetitions: two independent fresh Codex threads per task-condition, 18 coding runs total. Condition
  order uses the frozen schedule `P-A-D`, `D-A-P`, `A-D-P`, `P-D-A`, `D-P-A`, `A-P-D` assigned in
  task/repetition order, and every run starts from a new copy of the same fixture hash.
- Runtime: coding runs require the observed `gpt-5.6-sol` / `low` pair through Codex CLI
  `0.146.0-alpha.3.1`; record skill revision, routing fingerprint, capability timestamp, thread id,
  adapter, start/end time, event usage, exit status, and unsupported controls. A mismatch invalidates
  the run instead of silently substituting another profile.
- Scoring: fixture tests and invariant scripts are the primary blind oracle. Output condition labels
  are removed before aggregation. Any rubric-only field must be an enumerated JSON assertion with
  exact tie/failure handling; no post-hoc LLM grading.
- Isolation: run directories contain only the immutable fixture, common prompt, one condition policy,
  and output schema. They are newly materialized and git-initialized; caches, prior artifacts, and
  evaluator reports are outside the worker workspace.
- Budget: at most 18 coding calls, 4 fresh-context recovery calls, one orchestration experiment
  consisting of 3 fan-out workers plus 1 synthesizer, and 2 portability calls. Each worker has a
  six-minute wall-clock limit. Only pre-output adapter/runtime failure may retry once; test,
  reasoning, timeout-after-output, and task failures are scored as failures.
- Stop rules: stop a condition after two invalid-runtime receipts, stop all live runs on credential
  exposure or uncontrolled external writes, and stop the suite if fixture hashes or common prompts
  differ across paired conditions. No paid or destructive calls are allowed.

## Recovery, Orchestration, and Portability Contracts
- Recovery is explicitly a **fresh-context handoff** test, not an actual host-compaction test. Two
  repetitions compare lossy-summary-only with a bounded checkpoint containing source pointers,
  contradictions, caveats, open loops, and next reads. Exact claim/source/caveat retention is scored
  mechanically. Actual host compaction remains unproven unless an observable host boundary appears.
- Fan-out/fan-in uses three read-only workers and one synthesizer over fixed contradictory source
  buckets. Every experiment receipt binds run id, parent id, condition, canonical input hash, output
  hash, launch id, harness/model/effort, adapter/runtime, timestamps, and attestation result.
  Missing or unverifiable receipts invalidate the multi-agent proof.
- Portability uses one named non-Codex path: Claude Code `2.1.139`. Codex and Claude receive the same
  canonical packet hash and oracle; adapter transformations and capability differences are recorded.
  Contract preservation is reported separately from model quality, latency, tokens, or price.
- Raw outputs remain ignored and redacted under `verification-report/`. Promoted summaries retain
  input/output/evidence hashes plus the minimal redacted oracle result, receipt identity fields, and
  assertion failures needed to audit every score after raw artifacts are removed.

## Precommitted Decision Rules
- No workflow default changes on any fixture-integrity failure, receipt mismatch, uncontrolled side
  effect, verification omission, or runtime substitution.
- `direct` becomes the bounded-task candidate only if both one-file runs pass, match the best pass
  count, create no plan/state artifact, and use fewer median tokens than `formal-plan`.
- `adaptive-state` becomes the ordered/debug candidate only if all four runs pass, its pass count is
  not below `formal-plan`, and its median tokens do not exceed `formal-plan`. Any unique formal-plan
  pass retains formal planning for that class.
- Structured handoff is adopted only if both checkpoint runs retain every required
  claim/source/caveat/open-loop field and summary-only loses at least one required field. Equal
  results support no advantage claim.
- Multi-agent orchestration is supported only if all receipts attest and synthesis preserves every
  source pointer and unresolved contradiction. Otherwise the default remains single-root.
- Portability is supported only as a contract claim when both named harnesses consume the identical
  packet and satisfy the same oracle. This pilot cannot establish cross-harness performance parity.
- Passing this pilot authorizes only a smallest vNext implementation slice. Production-default
  activation still requires expansion across the full eight-task corpus.

## Slices
### 1. Freeze the protocol and deterministic fixtures
- [x] Define conditions, tasks, artifact schemas, scoring, budgets, stop rules, and known limitations.
- [x] Proof: fixture/schema tests fail on missing provenance, unresolved gaps, or invalid lifecycle fields.

### 2. Compare planning strategies
- [x] Replay bounded, ordered, and debugging tasks under formal-plan, adaptive-state, and direct conditions.
- [x] Proof: 18/18 attested runs passed with identical fixtures and protected oracles.

### 3. Test context-boundary recovery
- [x] Compare lossy-summary-only resumption with structured checkpoint plus source pointers after a forced fresh-context boundary.
- [x] Proof: checkpoint 2/2; prose summary 0/2 on exact audit-field retention.

### 4. Test orchestration and portability
- [x] Run bounded read-only fan-out/fan-in with conflicting findings after the live capability gate passes.
- [ ] `BLOCKED_REAL_ENV`: Claude Code 2.1.139 returned `oauth_org_not_allowed`; Codex passed the
  identical canonical packet and Claude never reached model output.
- [x] Proof: every orchestration receipt attests; a missing or unverifiable receipt invalidates the
  multi-agent claim. Preserve adapter limitations rather than lowering the claim.

### 5. Decide and hand off
- [x] Publish the paired results, threats to validity, and go/no-go thresholds.
- [x] Write a short vNext decision and implement the smallest authorized slice.
- [x] Proof: 472/472 repository tests and plugin smoke pass; Claude portability remains an explicit
  `BLOCKED_REAL_ENV` claim boundary.

## Claim Boundary
- Coding conclusions are specific to Codex CLI `0.146.0-alpha.3.1`, `gpt-5.6-sol`, and `low`
  reasoning effort. Other models, efforts, and future versions require revalidation.
- The recovery experiment proves only fresh-context handoff behavior.
- The portability experiment proves packet-contract transport, not performance parity.
