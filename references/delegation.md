# Delegation and Runtime Routing

Read this only when delegation has a concrete evidence, isolation, or measured latency advantage.
The default remains one root agent.

Delegation requires all of:

1. independent or isolated work;
2. a concrete evidence advantage, context-isolation advantage, or measured latency advantage;
3. a bounded capability packet with task, work kind, compute class, inputs, output schema, authority,
   budget, escalation, and stop rules;
4. a live, fresh capability record showing the requested controls actually exist;
5. no unsafe shared mutable state.

Evaluate the packet through:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/0th.mjs" capabilities \
  --harness <runtime-harness> \
  --runtime-json <observed-capabilities.json> \
  --packet-json <capability-packet.json>
```

Delegate only when it returns `allowed: true`. Documentation, requested profile names, or assumed
model/effort settings are not runtime evidence. Ordered work, stale observations, missing isolation,
unsupported overrides, or disproportionate inherited effort stay single-root. Do not create a
reviewer, verifier, researcher, or fleet merely because a workflow phase has that name.

Portable packets use `compute_class: auto|economy|balanced|frontier|inherit`; they never contain a
model name. Discovery, extraction, test execution, and log condensation default to economy; bounded
implementation and routine review default to balanced; synthesis, architecture, and high-risk work
default to frontier. High and critical risk raise the floor.

Active harness mappings live in `~/.0th/skills/config/model-routing/<harness>.json` or
`OTH_SKILLS_ROUTING_DIR`; bundled adapters are inherit-only fallbacks. Explicit `--routing-json`
overrides local configuration, which overrides the bundled fallback.

Use `scripts/0th.mjs routing init --harness <name>` to create a local template without overwriting an
existing file. Use `routing doctor` with live runtime evidence before relying on a concrete route.
On Codex, `routing doctor --harness codex --live-probe` creates version-, configuration-, and
freshness-bound evidence; it consumes provider tokens and is never implicit. Model and effort
overrides plus the exact observed pair must all pass.

An allowed decision includes a launch plan and `launch_id`. For a concrete Codex plan, use
`scripts/0th.mjs dispatch` with prompt and output-schema files; prompts go through stdin. An
`inherit` plan uses the native harness path. Verify the emitted receipt through:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/0th.mjs" attest \
  --launch-plan-json <launch-plan.json> \
  --receipt-json <execution-receipt.json>
```

No receipt, an unverifiable runtime, or a model/effort mismatch invalidates cost routing. Stop or
escalate once to the packet's stronger class; do not repeat same-tier retries.
