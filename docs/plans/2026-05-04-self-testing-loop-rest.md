# Self-Testing Loop Rest Plan

**Decision:** [docs/decisions/2026-05-04-self-testing-failure-dossiers.md](../decisions/2026-05-04-self-testing-failure-dossiers.md)
**Slices:** 5

## Architecture

- Failure detection lives in a managed command runner, not in hook parsing.
- Dossiers are immutable per-run JSON files under `verification-report/runs/<run_id>/`.
- Hook adapters surface only dossiers whose `run_id` appears in the current tool input.
- `/ship` keeps the mechanical floor for verifier evidence and pre-dispatch blind spots.

## Slices

### 1. Managed failure dossier runner

A command wrapper runs verification commands and writes an atomic per-run dossier only when the command fails.
- [ ] Successful commands exit with the child status and write no dossier.
- [ ] Failing commands write schema-valid `runs/<run_id>/dossier.json` via temp-file-then-rename.
- [ ] Dossier output captures command, cwd, timing, exit code, and truncated stdout/stderr without shell tracing.

### 2. Codex hook adapter

Codex `PostToolUse` can surface a runner-written dossier through `additionalContext`.
- [ ] Adapter reads hook JSON from stdin and ignores events without a managed `run_id`.
- [ ] Adapter validates the dossier and rejects missing, malformed, partial, or mismatched `run_id` files.
- [ ] Adapter output includes the dossier path plus current `session_id`, `turn_id`, and `tool_use_id`.

### 3. Claude hook adapter + install docs

Claude receives the same output contract through its failure-hook path, with documented user-scope installation.
- [ ] Claude adapter accepts equivalent fixture payloads and emits the same dossier summary shape.
- [ ] README documents user-scope hook configuration for both hosts without auto-mutating user config.
- [ ] Tests prove Codex and Claude adapters stay aligned except for event-field names.

### 4. Skill adoption

0th-managed agents and skills instruct test/verification commands to use the runner when they need failure dossiers.
- [ ] `/build`, `/debug`, verifier, and test-runner prompts name the runner for managed verification commands.
- [ ] Agent parity tests enforce the instruction across Claude and Codex mirrors.
- [ ] The old "parse tool_response" wording is absent from shipped prompts and docs.

### 5. Ship gate blind-spot hardening + release notes

The loop explicitly handles pre-dispatch blind spots and is discoverable in release notes.
- [ ] Verifier report schema includes `pre_dispatch_tool_failures_reviewed`.
- [ ] `/ship` gate fails closed when required verifier evidence omits that field.
- [ ] README release notes describe failure dossiers, hook adapters, and the remaining user-scope hook caveat.
