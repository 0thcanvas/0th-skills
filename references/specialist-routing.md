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

### `ios_app_real_env_verification`

Use this capability when an iOS app change needs simulator build/run/debug, real app launch proof,
UI screenshots, logs, performance evidence, leak evidence, or Simulator interaction. Build iOS Apps
is the preferred adapter when it is available; its XcodeBuildMCP-backed workflow owns simulator
setup, launch, screenshots, UI inspection, and log capture details.

Expected receipt evidence:
- Project/workspace, scheme, and simulator target used
- Build result and real app launch confirmation
- UI screenshots or UI description for the changed surface
- Relevant logs, interaction notes, or error output
- Performance, ETTrace, or leak evidence when requested
- Gaps, blocked simulator state, or missing signing/runtime requirements

Native 0th fallback: run code review and compile-only validation such as local SwiftPM or
`xcodebuild` compile/test proof when available. Compile-only validation is not real app launch
evidence, and it must not claim simulator proof, UI screenshots, or logs from a running app.

### `swiftui_ui_patterns`

Use this capability when a SwiftUI change needs platform pattern guidance, view refactoring,
Observation/state-flow review, Liquid Glass adoption, performance reasoning, or preview/simulator
feedback. Build iOS Apps is the preferred adapter family when it is available.

Expected receipt evidence:
- SwiftUI pattern or refactor guidance applied
- Deployment-target or API-availability notes when relevant
- Compile/test output for the affected target
- Preview, simulator, UI screenshots, performance, or leak evidence when the proof tier requires it
- Gaps or platform assumptions that still need human or runtime confirmation

Native 0th fallback: follow local codebase conventions and current Apple documentation when needed,
then validate with compile/test proof. Do not present SwiftUI compile success as simulator UI proof
unless the app or preview actually ran and returned real app launch or rendered UI evidence.

### `logged_in_browser_access`

Use this capability when verification or investigation depends on the user's authenticated browser
state, browser extension context, private dashboard, shared tab, or current browser session. Browser
Kit is the preferred managed adapter for bb-browser-backed Chrome sessions when available; bb-browser
or other host browser automation may be used when Browser Kit is unavailable or the task requires
arbitrary page state inspection.

Adapter failures are part of the receipt, not proof about the page. If Browser Kit or bb-browser is
unavailable because the daemon, MCP registration, provider launch, or session attach failed, attempt
one documented recovery path when safe before falling back. If recovery still fails, record
`adapter_unavailable`, the exact command or error, and the next available session-backed path tried.
If the blocker is a local port collision with OpenCLI Browser Bridge or another tool on
`localhost:19825`, prefer moving Browser Kit with `--cdp-port <port> --daemon-port <port>` or
`BROWSER_KIT_CDP_PORT` / `BROWSER_KIT_DAEMON_PORT`; do not kill the other session unless the user
asked for that specific cleanup.

Expected receipt evidence:
- Session source, adapter, and whether an existing current browser session was reused
- Tested URL or surface
- Actions performed and interaction/read evidence
- Screenshots, DOM/UI notes, console/network/log evidence, or copied user-visible text as needed
- Access limitations, challenges, stale tabs, or login/session blockers

Native 0th fallback: use non-session tests, public pages, or open-web search only for claims that do
not require authenticated state. If the proof needs a logged-in/private surface, public search is not
a substitute; record `adapter_unavailable`, partial evidence, or `BLOCKED_REAL_ENV`.

### `session_backed_reading`

Use this capability when research needs user-visible content from login-gated or adapter-backed
surfaces. OpenCLI is the preferred read path when an adapter command exists. Browser Kit, bb-browser,
or browser automation are fallback/debug paths when the adapter is missing, pagination or metadata is
ambiguous, or arbitrary page state must be inspected.

OpenCLI and Browser Kit can coexist if Browser Kit is moved off OpenCLI Browser Bridge's fixed
`localhost:19825`; use Browser Kit's CDP/daemon port flags or env vars and include the chosen ports
in the session-backed read receipt when they matter to reproduction.

Generic fetch/search blockers are access signals. A challenge page, CAPTCHA, verification page,
403/429, login wall, or bot-block page should be recorded as `challenge_or_session_blocked` and
rerouted through a session-backed path when the source matters to the answer. Do not treat it as
negative evidence or as permission to skip the source bucket.

Expected receipt evidence:
- Adapter command or browser path used
- Account, query, post, dashboard, or tested URL or surface read
- Interaction/read evidence and pagination or missing-metadata notes
- Whether the content is user-visible/session evidence rather than canonical provider metadata
- Access limitations or adapter gaps

Native 0th fallback: use public/open-web research only for public claims. For private-session claims,
public search is not a substitute; mark the session-backed evidence unavailable or partial.

## Fallback

If an adapter is missing, use the native 0th fallback for the work that 0th can honestly do. For
example, 0th can still review code, run local tests, or write a verifier brief. It must not claim
adapter-only evidence such as real logged-in session proof, simulator screenshots, or design QA.

No-silent-downgrade rule: if the selected proof tier requires specialist or real-environment
evidence that is unavailable, report the exact gap. If that gap is required for the chosen tier,
the outcome is `BLOCKED_REAL_ENV`, not a lower proof tier chosen after the fact.
