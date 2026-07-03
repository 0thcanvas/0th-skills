# Workflow Verification Hardening Plan

**Decision:** none — building from direct instruction after specialist routing merged.
**Slices:** 5

## Architecture

- Scope: update the core 0th workflows that choose, execute, or close out proof (`think`, `plan`,
  `build`, `debug`, `research`, `deep-research`, `ship`, `retro`, and host-facing docs); do not
  change runtime APIs, memory storage formats, or specialist plugin internals.
- Coverage model: decision/planning workflows select risk and scope; build/debug workflows create
  and satisfy proof contracts; research workflows keep context bounded; ship checks evidence; retro
  and open-loop closeout preserve lessons and unfinished work.
- Proof choice is a pre-implementation contract: pick the lowest honest tier from the real user/runtime boundary, not from tool convenience.
- Schema source: reuse the existing `proof-contract.json` and `proof-result.json` fields from
  `references/proof-tiers.md`; this plan changes workflow discipline, not the artifact schema.
- Context hygiene is workflow-owned: agents carry compact summaries, read maps, and evidence pointers forward instead of accumulating raw pages, logs, or unrelated files.
- Real-environment gaps are first-class outcomes: missing browser, simulator, sandbox, or live approval produces a named blocker, not a downgraded pass.
- Memory, open loops, and retro are closeout surfaces: unfinished work, user corrections, and verification misses must become visible artifacts.

## Slices

### 1. Context Pruning Contract
Introduce a compact context discipline for long workflows, research, and multi-agent work.
- [x] A shared context-pruning reference defines required handoff fields: summary, source pointers, unresolved gaps, next read targets, and covered workflow roles.
- [x] Workflow prompts tell agents to start from maps, briefs, and targeted reads before loading raw artifacts.
- [x] Research and deep-research keep raw source material on disk and bring only bounded summaries into the orchestrator context.

### 2. Proof Readiness Gate
Make build-oriented workflows state the proof tier, real-environment dependency, and blocked fallback before implementation starts.
- [x] Workflow prompts reference the existing proof contract/result schema and the T0-T4 tier ladder.
- [x] Ship-bound implementation work requires a pre-implementation `proof-contract.json`; docs-only or metadata-only changes still use a T0 contract.
- [x] The done summary names `minimum_proof_tier`, `minimum_tier_satisfied`, evidence paths, and any stronger evidence that was unavailable.

### 3. Real-Environment Verification Loop
Tighten the verification loop so hard-to-run surfaces still produce honest evidence instead of superficial test-only closeouts.
- [x] User-facing and session-backed work requires a recipe-backed verification attempt or `proof-result.json` outcome `BLOCKED_REAL_ENV`.
- [x] Browser extension, web UI, iOS/simulator, private-session, and external-sandbox examples point to the evidence that tests cannot replace.
- [x] Ship/readiness checks require the proof result tier to be equal to or stronger than the selected proof contract tier.

### 4. Retro And Open-Loop Follow-Through
Make correction capture and unfinished-work tracking harder to skip at workflow boundaries.
- [x] A user correction, skipped verification, or repeated tool failure triggers explicit retro/open-loop consideration.
- [x] Completed work closes or updates related open loops rather than leaving stale task briefs behind.
- [x] Closeout language separates durable memory claims from temporary artifacts and unfinished tasks.

### 5. Contract Tests And Release Hygiene
Lock the new behavior with lightweight docs/contract tests and a normal ship path.
- [x] Tests cover stable contract keys: `context_handoff`, `proof_contract_required`, `blocked_real_env`, and `retro_open_loop_closeout`.
- [x] README and host-facing guidance expose the new loop compactly without duplicating every skill body.
- [x] Ship evidence includes the full suite, proof/product acceptance artifacts, and any counterpart-review result or explicit unavailable reason.
