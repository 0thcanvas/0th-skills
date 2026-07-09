# Portable Model Routing

**Durable:** yes

## Context

Generic subagents usually inherit the root model, which can multiply frontier-model cost. Fixed
role-to-model assignments also couple portable skills to one harness and become stale as catalogs
change.

## Decision

Capability packets declare a work kind and `auto`, `economy`, `balanced`, `frontier`, or `inherit`
compute intent. Shared skills and logical agent roles contain no provider model names. Each harness
maps compute classes in `adapters/<harness>.models.json`; live capability evidence must prove that
the runtime can honor the mapping before delegation. Every allowed route emits a hashed launch plan,
and a matching post-spawn receipt is required to prove the actual model and effort.

## Consequences

Unsupported and inherit-only harnesses fail closed instead of pretending to save cost. Adapter model
catalogs require maintenance, and real harness integration must expose runtime metadata for receipts.
The controller may escalate once to a stronger class after failed schema or verification evidence.

## Rejected

Permanent researcher/implementer model pins, provider model names in portable packets, and
unattested best-effort overrides were rejected because they conflate role, compute, and runtime truth.
