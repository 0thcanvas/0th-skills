# Codex Harness Adapter

This guide contains Codex-specific behavior behind the portable model-routing and delegation
contracts. Shared skills and references should point to capabilities and the adapter registry, not
copy these details.

## GPT-6 Astra compatibility

For an Astra host, retain the shared Kernel's instruction priority and follow-through rules and
the build workflow's proportional verification. These address Astra's sensitivity to conflicting
skill instructions, clarification pauses, and excessive testing. The single-root default remains;
use the existing delegation gate for independent work with a concrete advantage, subject to host
authorization. A model upgrade alone does not authorize extra workers.

Select `gpt-6-astra` in the host for root work. The bundled mapping inherits the host; it does not
select an older model. If a local routing override still pins frontier workers to an older model,
update only that profile when migrating it. Preserve economy/balanced routes and an explicit effort
supported by the target. Astra starts at `low`; preserve `medium` or stronger effort when already
selected. Do not infer selector support from the model name: fresh capability evidence is still
required before concrete worker dispatch. A routing-file change invalidates cached probe evidence.

The `workflow-vnext` evaluation is a frozen historical pilot, including its model identities. Keep
it intact; a new-model comparison needs separate runs and receipts. Static checks demonstrate
packaging and routing contracts, not improved model behavior or successful provider execution.

Source: [OpenAI's Astra prompting and migration guidance](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices),
checked 2026-09-05. API parameter migrations belong to API clients; this adapter uses `codex exec`.

## Live capability evidence

```bash
node scripts/0th.mjs routing doctor --harness codex --live-probe
```

The probe starts one read-only, ephemeral `codex exec` request for each concrete profile, so it can
consume provider tokens. It ignores user config, rules, plugins, and memories so unrelated MCP auth
or loaded skills cannot corrupt the result. Its cache lives under
`~/.0th/skills/cache/model-routing/codex.json`, expires after 24 hours, and is invalidated when the
CLI version or routing-file fingerprint changes.

The adapter sends worker prompts over stdin, pins model and effort per invocation, supports
`read-only` and `workspace-write`, and requires JSONL completion evidence. The runtime currently
does not emit independent model metadata in that stream, so a successful receipt records
`attestation_basis: explicit-launch-completed`. An `inherit` plan must use the host-native spawn
path.

`--codex-bin` remains a compatibility alias for the portable `--runtime-bin` option.
