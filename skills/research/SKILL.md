---
name: research
description: "Produces a current, source-aware answer for an external question. Use when repo evidence is insufficient and claims require docs, papers, code, standards, or practitioner sources."
argument-hint: "[question]"
---

# Research

Route each claim to the source most capable of proving it. Apply
`../../references/skills-kernel.md` once for root-task preflight, authority, optional delegation,
safety, context transfer, and closeout.

## Enter / scope

- Enter when current external facts, comparisons, recommendations, or source attribution matter.
- Skip when local code, docs, or durable project evidence already answer the question.
- `$ARGUMENTS` is the research question when invoked directly.

State the decision or deliverable, depth, freshness need, exclusions, and stop condition. Default to
one root agent. Use bounded parallel source buckets only when they are independent and the capability
gate proves an evidence or latency advantage; routine lookups remain single-root.

## Source map

Decompose branded language into the underlying capability and assign source buckets:

- primary docs, product pages, filings, specs, and release notes for product truth;
- source repositories, issues, and examples for implementation and maintenance evidence;
- papers and benchmark artifacts for methods and measured claims;
- practitioner forums, videos/transcripts, and social discourse for workflows, pain, leads, and
  disagreement—not as a substitute for primary validation;
- session-backed reading for login-gated or private state.

Use primary sources first. Search results are discovery, not evidence. Recommendations require current
maintenance, availability, and constraint checks. Time-sensitive claims need current sources.

## Research loop

1. Frame the exact question and the decision it supports.
2. Run a broad first pass to learn vocabulary, candidate sources, contradictions, and missing
   buckets. Do not conclude yet.
3. Re-query using learned terminology, source-specific searches, and dissenting hypotheses.
4. Inspect the sources that support each material claim. Record source date, scope, limitations,
   and disagreement.
5. Stop when the decision is supported, the requested coverage is met, or another pass produces no
   meaningful vocabulary or evidence improvement.

Use `context_handoff` between passes: bounded summary, source pointers, unresolved gaps, and next
read targets. Keep raw source material outside the root context.

## Session-backed sources

When login or user state is the evidence boundary, use the available session-backed adapter and
write a session-backed read receipt: adapter, account/query/surface, tested URL or surface,
interaction/read evidence, pagination or missing metadata, and access limits. Public search is not
a substitute for private/session state.

A fetch-only failure, challenge page, CAPTCHA, 403/429, or login wall is
`challenge_or_session_blocked`, not negative evidence. Attempt one safe adapter status/reconnect
path, then route to another available session path or report the exact blocker. `adapter_unavailable`
must include the failed command or boundary.

If Browser Kit conflicts with another CDP owner, move it with `--cdp-port`, `--daemon-port`,
`BROWSER_KIT_CDP_PORT`, or `BROWSER_KIT_DAEMON_PORT`; do not kill the other browser session by
default. OpenCLI and browser tools remain read-only unless the user explicitly authorizes a write.

## Output

Use `templates/output-shape.md`:

- verdict or direct answer first;
- evidence-supported findings separated from inference;
- conflicts, access limits, and remaining uncertainty;
- recommendation or next experiment;
- citations adjacent to the claims they support.

For durable findings, write the appropriate KB `raw/` note using
`templates/raw-findings-note.md`, update its index, and use the Memory Write Gate. Exploratory
reports remain working artifacts.

## References

- `references/source-routing.md`
- `references/video-source-research.md`
- `templates/output-shape.md`
- `templates/raw-findings-note.md`
- `../../references/skills-kernel.md`
- `../../references/specialist-routing.md`
- `../../references/workflow-verification.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
