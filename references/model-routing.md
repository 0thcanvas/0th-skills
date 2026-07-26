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
then bundled fallback. `adapters/templates/` provides structure. A bundled mapping may disable
concrete classes and inherit the frontier class so missing local configuration cannot silently spend
the root model as a cheap worker.

Run `scripts/0th.mjs routing init --harness <name>` to create a local template. It refuses to
overwrite an existing file unless `--force` is explicit and refuses symlink targets. A supplied
`--runtime-json` is the portable evidence path.

A registered adapter may offer an opt-in live probe:

```bash
node scripts/0th.mjs routing doctor --harness <name> --live-probe
```

Live probes can consume provider tokens and are never implicit. Their result must be bound to the
runtime version, routing-file fingerprint, and freshness window. A cached result authorizes only
the exact selector pairs that completed their probe. Configuration is intent, not proof. Adapter
guides under `adapters/harnesses/` document runtime-specific evidence and cache behavior.

If a harness can only inherit the parent runtime, economy and balanced routing are unavailable.
Remain single-root unless the packet explicitly requests `inherit` and delegation still has an
evidence, isolation, or measured latency advantage.

## Receipt boundary

Every allowed route has a deterministic `launch_id`. For a concrete route, execute the plan through
the registered adapter:

```bash
node scripts/0th.mjs dispatch \
  --launch-plan-json <launch-plan.json> \
  --prompt-file <prompt.md> \
  --output-schema <worker-output.schema.json> \
  --result-out <result.json> \
  --events-out <events.jsonl> \
  --receipt-out <receipt.json>
```

The registry chooses the adapter from the launch plan's harness. An adapter must preserve the
prompt boundary, pin the resolved selector, require completion evidence, and emit a receipt.
An `inherit` plan uses the harness-native spawn path unless its adapter explicitly supports it.
When runtime metadata is available, prefer `attestation_basis: runtime-metadata`; otherwise an
adapter may use a documented explicit-launch completion attestation.

Run `scripts/0th.mjs attest` against every receipt. A missing or mismatched receipt means the
requested cost/capability boundary was not proven and must not be reported as successful routing.
