# Codex Harness Adapter

This guide contains Codex-specific behavior behind the portable model-routing and delegation
contracts. Shared skills and references should point to capabilities and the adapter registry, not
copy these details.

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
