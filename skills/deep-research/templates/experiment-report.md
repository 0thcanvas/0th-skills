---
date: YYYY-MM-DD
agent: experimenter
experiment-number: {n}
experiment-type: {model-probe|integration-spike|feasibility-spike|scale-test}
budget-minutes: {15|30}
---

# Experiment {N}: {Title}

## Hypothesis
{What we're testing — one specific, falsifiable claim}

## Success Criteria
{Measurable — not "it works" but specific thresholds}

## Setup
{What was installed, configured, or downloaded}

## Execution
{What was run — reference to experiments/exp-{N}/run.sh}

## Result: PASS | FAIL | PARTIAL | INCONCLUSIVE

## Evidence
{Specific output — metrics, error messages, screenshots}

## Surprise
{Anything unexpected that changes our understanding, or "none"}

## Implication
{What this means for the architecture}

## Failure Category (if FAIL)
{FAIL_TECHNIQUE | FAIL_INTEGRATION | FAIL_ASSUMPTION | FAIL_ENVIRONMENT}
{Recommended routing: Phase 4 / Phase 5 / retry}
