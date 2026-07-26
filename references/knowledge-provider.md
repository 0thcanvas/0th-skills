# Knowledge Provider Contract

Use an optional `knowledge_provider` as a versioned navigation cache for agents, never as a second
source of truth.

## Request

Send:

- task keywords and bounded question;
- repository or project identifiers when known;
- current revision or source-set fingerprint when available;
- required source pointers and freshness floor;
- read-only authority and a bounded result contract.

## Result

Require:

- projects or bounded contexts consulted;
- source revision or fingerprint;
- files, symbols, edges, or canonical documents used;
- conclusions and unresolved gaps;
- freshness status: `current`, `partially_stale`, `stale`, or `unknown`.

Use current cached analysis for navigation when its source set still matches. Re-analyze only the
affected slice when relevant sources changed. Implementation, debugging, review findings, and
high-risk claims still open current source before asserting behavior.

If the provider is absent, stale, or unavailable, continue with direct source analysis. Never block
ordinary work merely because an optional index, registry, wiki, or generated atlas is missing.
