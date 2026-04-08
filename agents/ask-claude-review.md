---
name: 0th:ask-claude-review
description: "Deprecated — delegates to ask-counterpart-review with --driver claude. Remove after next release."
model: opus
---

This agent is deprecated. Delegate all review requests to `ask-counterpart-review`,
but always pass `--driver claude` to the companion script to preserve legacy behavior.

A caller that invoked `ask-claude-review` expected Claude specifically, not whatever
the config file maps to. The --driver flag overrides config to honor that expectation.
