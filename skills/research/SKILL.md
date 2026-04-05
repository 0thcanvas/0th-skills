---
name: research
description: "Run source-aware research for products, APIs, open-source tools, and papers. Use when the answer lives outside the repo and generic web search is not enough. Routes queries across official docs, GitHub, arXiv, specs, and broader web, then returns decision-ready findings."
argument-hint: "[question]"
---

# Research

Research with source routing. Not "search once and summarize."

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as the research question. If
`$ARGUMENTS` is empty, infer the question from the conversation.

## When to Use

- Product or API evaluation where current external facts matter
- Open-source tool discovery or comparison
- Paper or algorithm landscape review
- Competitive or implementation research before /think, /build, or /debug
- Cases where the repo and KB do not already answer the question

Skip this when local code, docs, or the KB already contain the answer.

## Triage Preamble

```
Question: [one sentence]
Depth: quick scan / decision-ready / deep dive
Deliverable: [recommendation / comparison / source list / raw findings]
```

## Session Resumption

If resuming an ongoing research thread:
1. Read the relevant KB domain index
2. Read any prior raw notes in that domain
3. Read recent decisions or plans that depend on this research
4. Report: "Last session answered X. Open questions: Y. Next: Z."

## Reference Files

- See `references/source-routing.md` for query-shaping examples and source-bucket heuristics.

## Template Files

- See `templates/output-shape.md` for the default decision-ready inline output shape.
- See `templates/raw-findings-note.md` when the research is durable enough to persist into the KB.

## Process

### 1. Define the Real Question

State the decision or deliverable the research must support.

Bad: "Research Canva Magic Grab."
Good: "Find the best open-source and paper-backed approaches for extracting editable fields from designed invitation images."

### 2. Decompose the Topic

Split the branded or user-facing term into underlying capabilities.

Examples:
- Product feature -> vendor name, feature name, underlying capability, adjacent terms
- API/tooling -> official docs, SDKs, examples, migration notes, real-world usage
- OSS landscape -> task name, ecosystem names, benchmark terms, maintenance signals
- Paper landscape -> task name, problem formulation, model family, benchmark dataset

If the first query is brand-shaped, generate capability-shaped queries before going deeper.

### 3. Route to Source Buckets

Use the best source for each sub-question:

- **Official docs / product pages** for product truth, API behavior, pricing, limits, launch claims
- **GitHub** for open-source tools, maintenance signals, implementation examples, issue discussions
- **arXiv / papers** for algorithms, baselines, benchmark results, recent methods
- **Specs / standards docs** for browser or protocol behavior
- **Forums / blogs / videos** for practitioner reports, workflow pain, edge cases

Primary sources first. Commentary second.

### 4. Dispatch Searches to a Host-Native Research Subagent

Do not run web lookups directly from this skill when a host-native research subagent is available.
Each search/fetch cycle should go through the host's focused research agent so raw page content
stays out of this conversation.

Subagent choice by host:

- **Claude-hosted runs:** use `0th:web-researcher`
- **Codex-hosted runs:** use `0th_researcher`

For every sub-question in your map:

- Send one focused question to the research subagent, with the target source bucket when you know it
- Wait for the condensed ANSWER / KEY DETAILS / SOURCES block
- Collect the returned findings into your local map, then decide what to query next

Dispatch subagents in parallel when the sub-questions are independent. Dispatch sequentially only
when a later query depends on vocabulary learned from an earlier one.

If the host-native subagent is unavailable, fall back to running web search directly, but apply the
same discipline: one sub-question per search cycle, condense before writing anything into your local map.

### 5. First Pass: Map the Space

- Run a broad pass across the relevant source buckets
- Collect candidate sources, not conclusions
- Note vocabulary used by good sources
- Identify contradictions, stale sources, and missing pieces

Goal: build the map before making claims.

### 6. Second Pass: Re-query with Learned Vocabulary

Do not stop at the first page of results.

- Expand with synonyms, task names, paper terms, and implementation terms learned from pass one
- Search by underlying problem, not just by marketing name
- Search the source directly when possible, especially GitHub and arXiv
- Use site-restricted searches when generic search quality is weak

See `references/source-routing.md` for concrete query patterns.

### 7. Compare Evidence

For each important claim, ask:
- Is this a primary source?
- Is it current enough?
- Is it specific to the use case?
- Does another source disagree?

Prefer:
1. Official docs, primary repos, papers
2. Maintainer issues, benchmark pages, examples
3. Independent blog posts, tutorials, videos

If sources conflict, say so explicitly. Do not smooth over disagreement.

### 8. Produce a Decision-Ready Output

Use the default output shape in `templates/output-shape.md`.

If the findings are durable, write them to the KB in the relevant domain's `raw/` directory and update the domain index.

## Research Rules

- Do not treat a search engine as the source of truth
- Do not rely on a single source bucket for deep research
- Do not confuse a branded feature with the underlying technical problem
- Do not recommend tools without checking maintenance signals and recency
- Do not cite papers you have not actually inspected
- Do not pull raw page content into this conversation when the host-native research subagent can do the search/fetch cycle for you
- If you find yourself query-looping without improving the vocabulary or source quality, pause and re-read `references/source-routing.md`

## Handoff

- Use /think when the research feeds a decision
- Use /build when the research is sufficient to implement
- Use /debug when the research explains an external failure mode or dependency issue

## KB Integration

- **Reads:** KB domain index, prior raw notes, related decisions and plans
- **Writes:** durable findings to the appropriate KB `raw/` directory
