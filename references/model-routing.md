# Portable Model Routing

Skills describe work; harness adapters select models. Never place provider model names in a shared
skill, capability packet, or logical role manifest.

## Compute policy

| Work kind | Default class |
|---|---|
| source discovery, evidence extraction, tests, log condensation | `economy` |
| bounded implementation, routine review | `balanced` |
| cross-source synthesis, architecture, high-risk implementation | `frontier` |

`high` risk raises the minimum to `balanced`; `critical` raises it to `frontier`. `inherit` is an
explicit request for the parent runtime, not a cheaper tier. Escalation must move to a stronger
class and may happen once after failed output-schema or verification evidence.

## Harness boundary

`adapters/<harness>.models.json` owns the current model and effort selectors for `economy`,
`balanced`, and `frontier`. The mapping is configuration, not proof. A live host capability record
must show that model and effort controls exist before the controller emits a launch plan.

If a harness can only inherit the parent runtime, economy and balanced routing are unavailable.
Remain single-root unless the packet explicitly requests `inherit` and delegation still has an
evidence, isolation, or measured latency advantage.

## Receipt boundary

Every allowed route has a deterministic `launch_id`. After spawn, collect actual model and effort
from session metadata or a runtime probe and run `scripts/0th.mjs attest`. A missing or mismatched
receipt means the requested cost/capability boundary was not proven and must not be reported as
successful routing.
