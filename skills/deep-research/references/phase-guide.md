# Deep Research Guide

Use the entrypoint's budget and scope. One root can perform the entire investigation; delegation
is optional and follows `../../../references/skills-kernel.md`. Role packets isolate bounded work,
not evidence standards. Read this guide for the parts relevant to the current deliverable.

## Frame and storage

Record the accepted question, decision criteria, exclusions, mode, budgets, and next action in
`state.md`. Follow `../../../references/working-artifacts.md` for the topic destination; no KB setup
or migration is required. Existing state informs resumption; reconcile it with the current request
and avoid concurrent writes to the same topic.

Decompose only enough to choose useful sources and expose the assumption most likely to invalidate
the answer. Continue from a reasonable frame within the accepted scope. Ask only when an unresolved
ambiguity or missing authority materially changes what can be done. No routine frame, gap, or
conclusion approval is required.

## Search and source routing

Default budgets are two source passes, two full loops, and one reframe across the investigation.
A source pass is a planned round of acquisition; follow-up queries and cross-domain searches count
within these limits, not as free extra rounds. Record consumption in state. Stop early when evidence
suffices; only the user or accepted TaskSpec can raise limits.

Use a broad first pass and, if needed, a second pass targeting learned vocabulary, contradictions,
and decision-changing gaps. Prefer original papers, authoritative docs, repositories, and observed
behavior for technical claims. Route source packets to the appropriate capability rather than
forcing all sources through web search. For logged-in/user-visible discourse, resolve
`session_backed_reading`, load provider guidance, and use read-only access within the user's scope.
Record access failures, pagination, and missing metadata as coverage limits, not negative evidence.

The root may inspect raw pages, papers, search results, and safe experiment output directly. Save
claim-relevant extracts with source URL/path, date, scope, and original/derivative provenance in
`raw/`; do not accumulate entire source corpora in handoffs. A delegated packet returns a compact
summary with evidence paths and gaps. Inspect originals when the summary cannot support a claim.

## World model and revision

Keep a claim ledger or graph in `world-model.md` linking conclusions to sources, methods,
limitations, and contradictions. Use graph nodes and typed edges only when they clarify the topic.
Assess evidence per claim rather than assigning blanket verification to a whole sub-problem.

Independence is about origin and method: two workers reading one paper are one origin; a README
and press article repeating that paper are also one origin. Two independent studies in the same
source bucket can corroborate each other. A single authoritative source can establish a narrowly
scoped fact about its own API or release; broader performance claims need appropriate independent
measurement or explicit uncertainty. Record why support is sufficient for the exact claim.

Statuses are revisable: supported, tentative, disputed, refuted, or superseded. Existing verified
claims must be downgraded or withdrawn when new evidence warrants it. Retain a compact change note
and provenance so the reversal is auditable; historical support is not current truth. Revisit prior
source notes when a contradiction requires it. Distinguish measured results from interpretation.

## Gaps, reframing, and quality

Prioritize gaps by whether they can change the requested conclusion. Explain material changes in
progress updates and continue within scope. Reframe at most once by default; if evidence requires a
new objective outside the accepted task, deliver the findings and identify the missing decision.

Use `abstract-mechanisms.md` for cross-domain ideas when a gap benefits from them.
Explain how an analogy maps to the actual problem and where it breaks. Record newly found mechanisms
inside the topic artifacts. Research must not edit its own skill, plugin, or shared reference library;
any library improvement is a separate explicitly authorized maintenance task.

Apply `quality-rubric.md` before concluding, and after new evidence materially changes conclusions.
A failed evidence criterion remains failed regardless of retry count. Spend remaining budget only
on a useful repair; otherwise narrow the claim or deliver a partial result with the unresolved gap.
Do not turn repeated failure into advisory status or unsupported success.

## Develop the requested output

- Feasibility: describe a buildable approach, interfaces, constraints, and its highest-risk
  assumption. Use `wiki/architecture.md` when a separate architecture artifact helps.
- Decision: compare the relevant options against the user's criteria, recommend when evidence
  supports it, and state what uncertainty could reverse the choice. An architecture is optional.
- Survey: map the landscape, coverage, maturity, and open questions. Create subtopic pages only
  where they make the survey easier to use; no experiment or architecture is required.

Templates are starting shapes, not mandatory filler. Match depth to the requested deliverable.

## Experiment when needed

For feasibility, test the highest-risk buildable assumption through the smallest executable seam.
Define hypothesis, measurable pass/fail criteria, environment, scope, side effects, and time/cost
limits before running. Existing authorization governs local and live experiments; a research request
does not itself authorize purchases, external writes, credentials changes, or destructive actions.
Proceed with already authorized experiments without re-requesting permission. When authority is
missing, prepare the concrete experiment and continue independent research before asking.

Keep experiment files isolated under the topic's `experiments/`. Provide a reproducible entrypoint,
inputs and dependency versions, safe measurements, and a report distinguishing technique,
integration, assumption, and environment failures. Sanitize logs; do not retain secrets or private
session payloads. Retry an environment problem only with a changed diagnosis, at most twice and
within remaining budget. Missing runtime access is an untested assumption, not a technique failure.

## Conclude and preserve continuity

Lead with the answer, then decisive evidence, contradictions, scope limits, and remaining questions.
For feasibility separate demonstrated, plausible, and untested behavior. For decisions and surveys
use their natural recommendation or landscape output rather than a feasibility verdict.

Record termination separately from the answer: `SUCCESS` when applicable criteria are met,
`PARTIAL` when useful but incomplete, `PIVOT` when the frame is invalid, `EXHAUSTED` when source or
reframe budget cannot resolve a gap, `MAX_ITERATIONS` at the full-loop limit, or `USER_STOP` on stop.
Exhausted access or budget does not establish the frontier of knowledge. Do not pursue more loops
merely to fill the budget. Survey normally needs one loop.

Update state with budgets consumed, conclusions and evidence paths, changes of mind, remaining gaps,
and the next action if any. Keep only artifacts needed by the requested result or continuation.
