# Specialist Plugin Routing Plan

**Decision:** none - building from direct user instruction
**Slices:** 6

## Architecture
- 0th remains the workflow orchestrator: specialist skills may provide capability, but they do not bypass think, plan, proof, product acceptance, ship, or retro gates.
- Capability routing is category-based, not plugin-name-based: the workflow asks for a capability such as visual design, frontend QA, iOS simulator proof, or logged-in browser access.
- Plugins that are workflows keep ownership of their internal skill sequence; 0th routes to the capability/workflow boundary and validates returned evidence.
- Specialist handoffs use an adapter contract: a handoff envelope before delegation and a return receipt before the 0th workflow advances.
- Missing specialist plugins fall back to native 0th behavior; unavailable real-environment evidence is recorded as a verification gap or blocker, not silently downgraded.
- Routing rules stay compact and testable; detailed plugin behavior remains in the specialist plugin skills.

## Slices

### 1. Establish The Routing Kernel
Deliver the base orchestrator contract that every specialist route must obey.
- [x] Kernel defines capability categories, handoff envelope, return receipt, adapter-unavailable states, and no-silent-downgrade behavior.
- [x] Think, plan, build, and ship guidance all treat routing as a subroutine under 0th ownership.
- [x] Tests fail if specialist routing can bypass proof, product acceptance, ship, or retro gates.

### 2. Route Visual And Frontend Work End To End
Add the first complete adapter path for product design and frontend application work.
- [x] Visual/product work routes to a visual target or frontend builder capability before implementation when the task needs design judgment.
- [x] Returned evidence can satisfy or augment product acceptance only when screenshots, design QA, or browser QA are present.
- [x] Missing visual/frontend adapters fall back to native 0th flow with explicit visual-target and browser-evidence requirements.

### 3. Route iOS And SwiftUI Work End To End
Add a complete adapter path for iOS app and SwiftUI specialist capabilities.
- [x] iOS work can request simulator build/run/debug, UI screenshots, logs, performance, leak, or SwiftUI pattern evidence.
- [x] Native 0th fallback covers code review and compile/test proof, but does not claim simulator proof when simulator adapters are unavailable.
- [x] Proof outcomes distinguish compile-only validation from real app launch and UI evidence.

### 4. Route Logged-In Browser And Private-Surface Work End To End
Add a complete adapter path for session-backed browser and login-dependent research or verification.
- [x] Logged-in/session-backed tasks route to browser capability providers before opening fresh sessions.
- [x] Browser receipts include session source, tested URL or surface, interaction/read evidence, and known access limitations.
- [x] Missing browser adapters produce explicit unavailable or partial-evidence outcomes instead of replacing private-session proof with public search.

### 5. Preserve Host And Manifest Parity
Keep the routing contract visible across the host surfaces that load or mirror 0th behavior.
- [x] Host-facing instructions summarize the orchestrator principle and capability-routing rule without duplicating plugin bodies.
- [x] Agent manifests and wrapper descriptions remain compact and route through the shared contract.
- [x] Tests cover host parity so Claude, Codex, and generated wrappers do not drift on specialist-routing behavior.

### 6. Close Repo Hygiene Before Ship
Remove or finish unrelated experimental skill state before the routing PR ships.
- [x] The experimental visual-study skill is either completed with wrapper metadata and tests or moved out of the tracked plugin working tree.
- [x] Existing wrapper, metadata, block-sync, routing, and ship-gate tests pass after the specialist-routing changes.
- [x] The final PR separates routing changes from unrelated experimental work unless the user explicitly widens scope.
