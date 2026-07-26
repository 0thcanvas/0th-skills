# Keep Skills Portable; Complete the Harness Adapter Boundary

**Date:** 2026-07-25
**Status:** active
**Durable:** yes

## Context
The portable protocol is host-neutral, but the controller still imports the Codex executor and
branches on Codex for live probing. A new harness therefore needs controller edits today.

## Decision
Keep shared skills, capability packets, authority, and proof contracts harness-neutral.
Isolate live capability discovery, launch, and receipt extraction behind harness adapters.
The controller may consume the adapter contract but should not import or branch on Codex-specific implementations.

## Constraints
- Every harness exposes different model, effort, topology, launch, and attestation controls.
- Unsupported controls must fail closed without weakening the portable workflow contract.
- Adding a harness should require an adapter, manifests, and contract tests—not edits to shared skills.

## Not Doing
- A least-common-denominator workflow that removes useful host-native capabilities.
- Pretending migration is free; adapter and packaging work remains intentionally host-specific.
- Refactoring the controller in the probe-schema bug fix.

## Consequences
- Migration cost is bounded to one adapter, manifests, packaging, and contract tests.
- The current Codex branch in `scripts/host-capabilities.mjs` remains explicit migration debt.

## Current state
- The Codex Structured Outputs schema and user-config isolation are fixed; a live three-profile
  probe returned `status: ready` on 2026-07-26.
- Shared skills, execution policy, packets, and receipts are host-neutral.
- `scripts/host-capabilities.mjs` still imports the Codex live-probe adapter directly. Extracting
  capability discovery into an adapter registry remains non-blocking migration work.

## Depends On
- `docs/decisions/2026-07-09-portable-model-routing.md`
