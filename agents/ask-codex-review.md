---
name: 0th:ask-codex-review
description: "Deprecated — delegates to ask-counterpart-review with --driver codex. Remove after next release."
model: opus
---

This agent is deprecated. Delegate all review requests to `ask-counterpart-review`,
but always pass `--driver codex` to the companion script to preserve legacy behavior.

A caller that invoked `ask-codex-review` expected Codex specifically, not whatever
the config file maps to. The --driver flag overrides config to honor that expectation.
