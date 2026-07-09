# 0th Skills Kernel Protocol

The portable layer defines outcomes, authority, evidence, output, and stop rules. It does not name a host, model, effort setting, agent role, or orchestration command.

Runtime delegation requires two validated inputs:

1. an observed host capability record conforming to `schemas/host-capabilities.schema.json`;
2. a bounded capability packet conforming to `schemas/capability-packet.schema.json`.

The packet names a portable work kind and compute class, never a provider model. The local harness
mapping conforms to `schemas/model-routing.schema.json`; bundled mappings are fail-closed fallbacks.
An allowed decision emits a deterministic
launch plan conforming to `schemas/launch-plan.schema.json`. After spawning, the controller validates an observed child record against
`schemas/execution-receipt.schema.json`.

`documented-only` capability records are discovery hints, not execution authority. Concrete routes
also require observed model and effort availability. Missing, stale, unavailable, or unsupported
runtime controls fail closed to `single-root`.

Task authority and terminal states use `schemas/task-spec.schema.json` and `schemas/exit-status.schema.json`. Repo proof tiers, stack minimums, Memory v2, and ship gates remain authoritative controller contracts.
