# Knowledge Base Protocol

This document tells agents how to interact with a project knowledge base. It is editor-agnostic: the KB is a markdown directory layout, not an Obsidian-specific feature.

## Assumptions

- The canonical KB path contract is `KB_ROOT`.
- The KB is a tree of normal markdown files and directories.
- Agents should not hardcode a vault path or assume a specific notes app.

If a human happens to read the KB in Obsidian, that is fine, but nothing in this protocol requires Obsidian.

## Resolving The KB Root

Use this order:

1. `KB_ROOT` environment variable
2. Project instructions or repo docs that explicitly define the KB root
3. Ask the human once where the KB should live

If neither `KB_ROOT` nor project instructions define a KB root, ask once and then recommend persisting the answer so future sessions do not need to ask again.

Recommended persistence targets:

- project instructions such as `CLAUDE.md` or `AGENTS.md`
- shell or project env configuration that exports `KB_ROOT`

Do not invent a KB location silently when the project has not declared one.

## Recommended Structure

Each domain is a topic directory:

```text
{domain}/
  raw/
    archived/
  wiki/
    archived/
  index.md
```

Two root-level files support navigation:

- `index.md` — top-level domain and article catalog
- `log.md` — append-only operation log

## Reading

At the start of a session:

1. Read the KB root `index.md`
2. Read recent entries in `log.md`
3. If the task touches an existing domain, read that domain's `index.md`
4. Read specific `wiki/` pages as needed
5. Read pending `raw/` notes only when the wiki does not already cover the topic

Never read from `raw/archived/` during normal work.

## Writing

When durable knowledge is produced:

- Put staged findings in `raw/` when you do not yet have enough context to integrate them cleanly
- Prefer writing directly to `wiki/` when the knowledge is already understood well enough to integrate
- Update the domain `index.md`
- Append a short entry to `log.md`

## Operations

### Ingest

Default path for a well-understood source:

1. Read the source
2. Update one or more `wiki/` pages
3. Add or refresh links to related KB pages
4. Add a `Sources:` section to touched pages
5. Update the domain `index.md`
6. Append to `log.md`

### Capture

Use `raw/` as a parking lot when the finding is worth keeping but not yet ready for the wiki.

Recommended filename:

`YYYY-MM-DD-{slug}.md`

Recommended frontmatter:

```yaml
---
date: YYYY-MM-DD
agent: claude-code | codex | other
source: brief origin description
source_url: https://...   # omit if not applicable
tags: [tag1, tag2]
---
```

### Compile

When multiple pending raw notes cover related topics:

1. Read pending files from `raw/`
2. Merge them into `wiki/` pages
3. Move integrated raw files to `raw/archived/`
4. Update the domain `index.md`
5. Append to `log.md`

### Query

When answering from KB knowledge:

1. Read the relevant `index.md`
2. Read the relevant `wiki/` pages
3. Synthesize an answer
4. If the synthesis is durable, write it back into the KB
5. Append to `log.md`

### Lint

Only when asked, or when a human explicitly wants a health check.

Check for:

- contradictions
- stale claims
- orphan pages
- missing pages
- broken links
- index drift
- missing `Sources:` sections

## Linking

The KB should be cross-linked. Use whichever link style the project already uses:

- Prefer `[[wikilinks]]` if the KB already uses them
- Otherwise use normal markdown links

Do not mix styles arbitrarily inside the same KB. Follow the existing convention.

## Provenance

Wiki pages should end with a lightweight `Sources:` section so claims can be traced later.

Example:

```md
## Sources

- Internal design note: `docs/decisions/2026-04-01-example.md`
- Raw note: `raw/2026-04-02-example.md`
- External source: https://example.com
```

## Log Format

Append operations to `log.md` in a grep-friendly format:

```md
## [YYYY-MM-DD] verb | domain | description

Brief details about what changed.
```

Suggested verbs:

- `ingest`
- `capture`
- `compile`
- `query`
- `lint`
- `correct`

## What Not To Do

- Do not hardcode an Obsidian vault path
- Do not ignore `KB_ROOT` when it is set
- Do not assume Obsidian-specific rendering behavior
- Do not let durable synthesis disappear into chat history
- Do not write empty pages
- Do not read `raw/archived/` during normal work
- Do not lint unless asked
