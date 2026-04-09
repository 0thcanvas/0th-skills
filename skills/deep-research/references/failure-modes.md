# Failure Mode Defenses

Mapped from "Why LLMs Aren't Scientists Yet" (arXiv 2601.03315, Jan 2026).
Six recurring failure modes observed in LLM-as-researcher pipelines.

## 1. Training Data Bias
**What goes wrong:** Model defaults to popular but outdated patterns, overriding explicit instructions.
**Defense:** Source routing forces diverse sources. Cross-domain search prevents defaulting to obvious approaches.
**Enforced at:** Phase 0 (diverse source buckets), Phase 5 (cross-domain search).

## 2. Implementation Drift
**What goes wrong:** When complexity increases, the model quietly simplifies and abandons the core question.
**Defense:** Quality gate criterion #8 checks original question alignment. `state.md` preserves the original question immutably.
**Enforced at:** Phase 5 quality gate, state.md (architectural).

## 3. Memory / Context Degradation
**What goes wrong:** As sessions grow, the model loses track of earlier decisions and findings.
**Defense:** State file on disk. World model on disk. Agents get clean context per dispatch. Orchestrator never accumulates raw output.
**Enforced at:** All phases — this is an architectural defense, not a phase-specific check.

## 4. Overexcitement ("Eureka Instinct")
**What goes wrong:** Model declares success despite clear failures, emphasizing positives while ignoring problems.
**Defense:** Quality gate requires ALL 10 criteria. Verdict must cite specific evidence. Experiment must target highest-risk assumption. Overexcitement detector runs before Phase 7.
**Enforced at:** Phase 5 gate, Phase 6 (risk-first selection), Phase 7 gate + detector.

## 5. Insufficient Domain Knowledge
**What goes wrong:** Model misses undocumented craft knowledge that experienced practitioners take for granted.
**Defense:** Human gates at Phase 0 (frame approval) and Phase 3 (gap probing). User catches "that's not how X works" before autonomous phases run.
**Enforced at:** Phase 0, Phase 3.

## 6. Lack of Scientific Taste
**What goes wrong:** Model can't distinguish good experimental design from bad, doesn't flag fatal flaws.
**Defense:** Consensus protocol filters weak findings (>=2 sources with >=1 original provenance). Recency check (#9). Contradiction resolution (#6) forces engagement with disagreements.
**Enforced at:** Phase 2 (consensus), Phase 5 gate.

## Overexcitement Detector

Before writing any verdict in Phase 7, the orchestrator must answer:

1. What is the WEAKEST link in this architecture?
2. If a senior engineer reviewed this, what would they call bullshit on?
3. (Feasibility only) Did any experiment actually FAIL? If not, were we testing hard enough?
4. Am I excited because the evidence is strong, or because I WANT this to work?

If question 4 gives pause — flag it to the user as a concern.
Decision mode skips question 3. Survey mode skips the entire detector.
