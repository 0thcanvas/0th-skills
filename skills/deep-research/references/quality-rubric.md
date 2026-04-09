# Quality Gate: 10-Point Rubric

Applied at Phase 5 (all 10 criteria) and Phase 7 (experiment-affected criteria #4, #7, #10 only).
All applicable criteria must pass. Binary — no partial credit.

## Criteria

| # | Criterion | Question to Ask | FAIL Example |
|---|-----------|----------------|--------------|
| 1 | Decomposition grounded | Does every sub-problem trace back to the original question? | "Font detection" added but question was about layout |
| 2 | Evidence, not assumption | Does every claimed technique have a source URL? | "Transformers are good at this" with no citation |
| 3 | Verified > unverified | Does the solution primarily use `uncertainty: verified` findings? | Architecture built on a single unverified blog post |
| 4 | Limitations acknowledged | Are known failure modes explicitly listed? | "LaMa works great" without noting structured background failures |
| 5 | Cross-domain attempted | Was at least one sub-problem searched outside its obvious field? | Only searched "text detection" — never checked adjacent fields |
| 6 | Contradiction resolved | Are there unresolved disagreements between sources? | Paper A says 95%, Paper B says 40% — both cited without resolution |
| 7 | Experiment targets risk | Does the experiment test the most uncertain assumption? | Tested OCR (known to work) instead of style re-rendering (unknown) |
| 8 | No implementation drift | Does the solution still address the original question? | "We can detect text!" but question was edit + preserve style |
| 9 | Recency check | Are key sources from the last 2 years? | Architecture based on 2019 paper when 2025 diffusion models exist |
| 10 | Buildable specificity | Does the output name specific models/libs/APIs? | "Use an inpainting model" vs "Use LaMa v2 (advimman/lama, MIT)" |

## Loop-back Targets

| Criteria | Target Phase | Why |
|----------|-------------|-----|
| 1, 8 | Phase 0 (re-frame, human-gated) | Decomposition or drift is a framing problem |
| 2, 3, 6 | Phase 1 (re-search) | Need more/better evidence |
| 5 | Phase 5 (expand cross-domain) | Need to search other fields |
| 4, 9, 10 | Phase 2 (rebuild world model) | Need updated queries and synthesis |
| 7 | Phase 6 (re-select experiment) | Need to target higher-risk assumption |

## Retry Cap

Per-criterion retry cap: 2. After 2 failures on the same criterion, it downgrades to ADVISORY —
recorded in quality-gate.md but does not block progression.

## Phase 7 Scoping

Phase 7 re-checks only experiment-affected criteria (#4, #7, #10) since only Phase 6 runs
between the Phase 5 gate and Phase 7 gate. Decision mode (Phase 7d) runs criteria #1-6, #8-10
(skip #7). Survey mode (Phase 7s) skips the quality gate entirely.
