# Legacy Codex Dispatch Profiles

This file documents an explicit compatibility surface. Portable skills do not reference these
profiles and must not treat their configured model, effort, role, or thread settings as live runtime
capabilities.

The optional manifests under `.codex/agents/` remain available when a user explicitly selects one
or when a caller has already passed the gate in `skills-kernel.md`. Their names describe historical
task shapes; they are not permanent workflow roles and they do not authorize delegation by
themselves.

For automatic routing:

1. default to the root agent;
2. create a bounded capability packet;
3. obtain a fresh observed capability record;
4. run `scripts/0th.mjs capabilities`;
5. delegate only when the decision returns `allowed: true`.

Requested profile names and static manifest settings are documentation, not evidence of the model,
effort, isolation, or workspace behavior the current runtime will provide.
