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

Active selectors live at `~/.0th/skills/config/model-routing/<harness>.json`, or under the directory
named by `OTH_SKILLS_ROUTING_DIR`. Resolution order is explicit `--routing-json`, local configuration,
then bundled fallback. `adapters/templates/` provides structure; `adapters/<harness>.models.json`
disables economy/balanced and inherits frontier so missing local configuration cannot silently spend
the root model as a cheap worker.

Run `scripts/0th.mjs routing init --harness <name>` to create the local template. It refuses to
overwrite an existing file unless `--force` is explicit and refuses symlink targets. Run
`scripts/0th.mjs routing doctor --harness <name> --runtime-json <path>` to verify live override
controls and observed model/effort availability. Configuration is intent, not proof.

If a harness can only inherit the parent runtime, economy and balanced routing are unavailable.
Remain single-root unless the packet explicitly requests `inherit` and delegation still has an
evidence, isolation, or measured latency advantage.

## Receipt boundary

Every allowed route has a deterministic `launch_id`. After spawn, collect actual model and effort
from session metadata or a runtime probe and run `scripts/0th.mjs attest`. A missing or mismatched
receipt means the requested cost/capability boundary was not proven and must not be reported as
successful routing.
