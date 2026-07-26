# Evidence-Seeking Review

**Date:** 2026-07-26
**Status:** active
**Durable:** yes

## Decision
Review is optional. Add another pass only when it has a named evidence advantage such as fresh
context, distinct evidence access, a measured capability difference, or a justified adversarial
challenge.

Reviewer findings are hypotheses, not commands. The implementer accepts or rejects each finding
against the request and acceptance evidence, and keeps a revision only when that evidence improves.
Reviewer labels do not create authority.

No plan, build, or ship step requires review output or an explanation for skipping review. Internal
plans and diffs may be sent to an authorized counterpart; secrets, personal data, and user-excluded
content remain governed by the separate disclosure boundary.

## Consequences
- Remove mandatory plan review and counterpart-review ship artifacts.
- Keep product acceptance and executable proof as verification, not model consensus.
- Keep self-review, fresh same-model review, and cross-model review available as optional tools.

## Evidence
- `docs/evals/2026-07-26-workflow-vnext-pilot.md`
- Research conclusion: `research/llm-review-topologies/wiki/conclusion.md` in the 0th Canvas KB
