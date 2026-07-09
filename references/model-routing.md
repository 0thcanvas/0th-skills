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
overwrite an existing file unless `--force` is explicit and refuses symlink targets. A supplied
`--runtime-json` remains the portable evidence path. Codex can instead run an opt-in live probe:

```bash
node scripts/0th.mjs routing doctor --harness codex --live-probe
```

The probe starts one read-only, ephemeral `codex exec` request for each concrete profile, so it can
consume provider tokens. Its cache is local user state under
`~/.0th/skills/cache/model-routing/codex.json`, expires after 24 hours, and is invalidated when the
Codex CLI version or routing-file fingerprint changes. A cached result authorizes only exact
model/effort pairs that completed their probe. Configuration is intent, not proof.

If a harness can only inherit the parent runtime, economy and balanced routing are unavailable.
Remain single-root unless the packet explicitly requests `inherit` and delegation still has an
evidence, isolation, or measured latency advantage.

## Receipt boundary

Every allowed route has a deterministic `launch_id`. For Codex concrete routes, execute the plan
through the controlled adapter:

```bash
node scripts/0th.mjs dispatch \
  --launch-plan-json <launch-plan.json> \
  --prompt-file <prompt.md> \
  --output-schema <worker-output.schema.json> \
  --result-out <result.json> \
  --events-out <events.jsonl> \
  --receipt-out <receipt.json>
```

The adapter sends the prompt over stdin, pins model and effort per invocation, requires Codex JSONL
completion evidence, and writes the result, event log, and receipt. It supports only `read-only` and
`workspace-write`; an `inherit` plan must use the harness-native spawn path. The Codex CLI currently
does not emit independent model metadata in its JSONL stream, so a successful receipt records
`attestation_basis: explicit-launch-completed`: the server accepted and completed the explicit
model/effort launch. When a harness exposes runtime model metadata, prefer
`attestation_basis: runtime-metadata`.

Run `scripts/0th.mjs attest` against every receipt. A missing or mismatched receipt means the
requested cost/capability boundary was not proven and must not be reported as successful routing.
