# Specialist Routing

0th remains the workflow orchestrator. Specialist plugins and tools can provide capability, but
they do not replace the 0th workflow gates.

## Boundary

Always route at the capability/workflow boundary: ask for a capability such as visual product design,
frontend QA, iOS simulator proof, SwiftUI guidance, logged-in browser access, or framework-specific
review. When a plugin is itself a workflow, let that plugin run its own internal steps; do not micromanage a plugin's internal skill sequence.

Routing is a subroutine, not a transfer of workflow ownership. 0th still owns the decision record,
plan, proof tier, verifier evidence, product acceptance, ship gate, and retro/memory handoff.

## Handoff Envelope

Before using a specialist capability, write or state a specialist handoff envelope:

- Capability requested
- Why the specialist is needed
- Exact delegated scope
- Changes or surfaces the specialist must not touch
- Required evidence and proof tier expectation
- Fallback path if the adapter is missing or incomplete

## Return Receipt

Specialist work does not satisfy proof by itself. Before 0th advances, require a specialist return receipt:

- Adapter state
- Files, artifacts, surfaces, or URLs touched
- Verification performed
- Evidence paths, screenshots, logs, or notes produced
- Known gaps or blocked items
- Whether the requested evidence contract was satisfied

## Adapter States

- `adapter_available`: the specialist adapter exists and can be invoked.
- `adapter_unavailable`: the specialist adapter is missing, unavailable, unauthenticated, or blocked.
- `adapter_ran_evidence_incomplete`: the adapter ran but did not return enough evidence for the
  requested proof or product gate.
- `adapter_satisfied_contract`: the adapter returned the required evidence for the delegated scope.

## Adapter Families

### `visual_product_design`

Use this capability when the task needs product design judgment, UX shaping, visual target creation,
ideation, image-to-code, or design QA. Product Design is the preferred adapter when it is available.
Its plugin-owned internal workflow can decide which internal skills to invoke. 0th rule: do not copy the plugin body; 0th only names the capability, handoff envelope, required evidence, and fallback.

Expected receipt evidence:
- Design brief or visual target
- Selected direction or concept, when applicable
- Generated or implemented artifact, when applicable
- Screenshots or design QA notes
- Gaps, blocked decisions, or unresolved product concerns

Native 0th fallback: require an explicit visual target from the user, repo, screenshot, or plan before
implementation. If no visual target exists and design judgment is the point of the task, stop for
clarification instead of inventing taste.

### `frontend_app_builder`

Use this capability when the task needs high-fidelity frontend concept-to-code work, rendered
frontend QA, browser QA, responsive evidence, or screenshot-backed visual checks. Build Web Apps is
the preferred adapter when it is available. Its plugin-owned internal workflow owns concepting,
implementation, and browser inspection details.

Expected receipt evidence:
- Implemented surface or patch summary
- Browser-tested URL or local surface
- Screenshots across required viewports, when visual fidelity matters
- Browser QA notes, console errors, and interaction evidence
- Gaps, unsupported states, or fidelity concerns

Native 0th fallback: continue through normal /build with explicit visual invariant, browser evidence,
and product acceptance requirements. Do not call frontend/product acceptance satisfied from tests
alone when screenshots, design QA, or browser QA were required.

## Fallback

If an adapter is missing, use the native 0th fallback for the work that 0th can honestly do. For
example, 0th can still review code, run local tests, or write a verifier brief. It must not claim
adapter-only evidence such as real logged-in session proof, simulator screenshots, or design QA.

No-silent-downgrade rule: if the selected proof tier requires specialist or real-environment
evidence that is unavailable, report the exact gap. If that gap is required for the chosen tier,
the outcome is `BLOCKED_REAL_ENV`, not a lower proof tier chosen after the fact.
