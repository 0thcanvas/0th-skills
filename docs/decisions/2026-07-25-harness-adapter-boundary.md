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

## Depends On
- `docs/decisions/2026-07-09-portable-model-routing.md`
