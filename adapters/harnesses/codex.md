# Codex Harness Adapter

This guide contains Codex-specific behavior behind the portable model-routing and delegation
contracts. Shared skills and references should point to capabilities and the adapter registry, not
copy these details.

## Model upgrades

Shared skills are model-neutral. Select the desired root model in the host; the bundled mapping
inherits its model and effort. Concrete worker selectors belong in local routing configuration.
Preserve deliberate economy/balanced choices when updating a frontier override. Never infer model
or effort support from a name: require fresh observed capabilities and attest the actual execution.
A routing-file change invalidates cached probe evidence.

Effort identifiers are runtime-provided strings, not a fixed model-generation list. Unknown effort
names can inherit or route through an observed exact pair. They are not automatically treated as
cheap: unclassified inherited effort blocks implicit economy work. Use an intentional supported
route or remain in the root. New provider protocols may still require an adapter change.

The shared Kernel owns instruction priority, authorized follow-through and proportional testing.
A model upgrade does not authorize extra workers or wider effects. Historical evaluations retain
their recorded model identities; new comparisons need separate runs and receipts. Routing tests
prove contract compatibility, not future model quality or live provider support.

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
