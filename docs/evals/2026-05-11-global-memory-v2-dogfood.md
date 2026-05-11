# Global Memory v2 Dogfood Report

Date: 2026-05-11
Scope: 0th-skills Memory v2 implementation sessions for the global memory layer.

## Summary

Memory v2 now uses generated runtime state as the canonical agent recall path: global brief, project
brief, task brief, compact recall, and explicit source-pack expansion. Markdown/KB material remains
source evidence or fallback, not startup memory.

## Comparison

| Dimension | Before global cutover | After global cutover |
|---|---|---|
| Useful recalls | Project memory and open loops only; cross-project research required manual KB/source lookup. | Project-first recall plus bounded global recall; global-only and source-id filters are executable. |
| Stale/conflicting recalls | Project duplicates and drift were visible; global staleness/conflicts were not surfaced. | Global stale claims, expired source packs, duplicate claims, orphan links, missing evidence, and subject-key conflicts are reported. |
| Token cost proxy | Startup read one project brief and one task brief. | Startup adds one generated global brief; source packs stay out of context until `recall` or `expand` requests them. |
| Legacy KB fallback | Cross-project material often fell back to markdown/KB browsing. | Runtime eval passes without `KB_ROOT` or Obsidian; markdown is fallback/source evidence only. |

## Evidence

- `node scripts/memory.mjs runtime-eval` covers global write, scoped recall, project/global conflict, source-pack expansion, stale global maintenance, and no-Obsidian dependency.
- `node scripts/memory.mjs doctor` reports repo/cache versions, project paths, global paths, and recall readiness.
- Source-pack fidelity is checked by content hash round-trip in runtime eval and unit tests.

## Remaining Dogfood Work

This report uses executable fixtures and the current implementation session as the first dogfood
sample. A later release should add measured startup token counts from real agent transcripts after
the plugin is installed and used for several days.
