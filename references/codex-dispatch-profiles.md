# Legacy Codex Dispatch Profiles

This file documents an explicit compatibility surface. Portable skills do not reference these
profiles and must not treat a role name or thread setting as live runtime capabilities. These files
do not pin model or effort; compute selection belongs to `adapters/codex.models.json`.

The optional manifests under `.codex/agents/` remain available when a user explicitly selects one
or when a caller has already passed the gate in `skills-kernel.md`. Their names describe historical
task shapes; they are not permanent workflow roles and they do not authorize delegation by
themselves.

For automatic routing:

1. default to the root agent;
2. create a bounded capability packet;
3. obtain a fresh observed capability record;
4. run `scripts/0th.mjs capabilities`;
5. launch exactly the emitted plan;
6. verify the child receipt with `scripts/0th.mjs attest`.

Requested profile names and adapter mappings are intent, not evidence of the model, effort,
isolation, or workspace behavior the current runtime provided. Only a matching receipt closes that
boundary.
