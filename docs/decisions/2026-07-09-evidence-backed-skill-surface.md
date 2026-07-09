# Evidence-Backed Skill Surface

## Context

Fresh-agent ablations found equal implementation quality for a tiny build with and without the full
workflow, but the skill added nine artifacts and material latency. A direct architecture-map request
also matched `zoom-out` quality without its lifecycle overhead. Metadata-only checks cleanly
distinguished ordinary and deep research, and the remaining skills respected their no-op and
authority boundaries.

## Decision

Add a lightweight `build` lane for bounded non-ship T0/T1 work while preserving the full proof lane
for ship-bound, T2+, specialist, delegated, or product-acceptance work. Remove `zoom-out` from the
plugin surface. Keep `research` and `deep-research` separate, but make deep research an explicitly
budgeted expensive escalation with ordinary research as the default.

## Consequences

The plugin exposes nine skills. Small local work avoids gate-only artifacts, while repository branch
policy and required runtime proof still apply. Deep-research limits may be raised only by the user or
accepted TaskSpec. Revisit if broader behavioral evaluations show a quality or safety regression.
