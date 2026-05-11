# Memory Public Benchmark Map

Date: 2026-05-11

## What Other Systems Optimize Against

| Benchmark | Used by | What it measures | What to watch |
|---|---|---|---|
| LongMemEval | LongMemEval paper, MemPalace, Mem0 memory-benchmarks, MemX, Hindsight/AMB references | Long-term assistant memory across information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention | Some published numbers are retrieval recall while others are end-to-end QA accuracy; do not compare them directly. |
| LoCoMo | Mem0 paper, A-Mem reproduction repo, memory-benchmarks | Conversational memory QA across single-hop, temporal, multi-hop, open-domain, and related categories | Chatbot-centered; useful for regression, but weaker for coding-agent workflow memory. |
| BEAM | Hindsight claims, BEAM paper | Very long conversations up to 10M tokens, designed to prevent context stuffing | Stronger pressure test for scale, but still conversation-shaped rather than repo/workflow-shaped. |
| AMB | Hindsight / vectorize-io agent-memory-benchmark | Agent-oriented tasks: tool-call memory, document-research memory, preferences, accuracy, speed, and token cost | Closest public direction to our use case, but not yet a direct 0th Skills workflow benchmark. |
| MemBench / ConvoMem | MemPalace repo benchmark notes | Retrieval recall on memory items/conversation memory | Helpful retrieval-only signal, not enough to validate lifecycle, repo drift, or open-loop behavior. |

## Where 0th Memory v2 Stands

Memory v2 is not yet claiming a public LongMemEval, LoCoMo, BEAM, or AMB score. That would be misleading today because the current evaluator is a workflow capability eval, not a public retrieval/QA benchmark harness.

The correct comparison is:

- Public benchmarks test retrieval/QA accuracy, scale, cost, or long-context pressure.
- 0th Memory v2 currently tests coding-agent workflow guarantees: event capture, repo preflight, stale-claim sync, read-set reconciliation, open-loop resume, local runtime state, and source-backed recall.
- The hardened runtime adds primitives needed before a fair benchmark run: compact recall, expand-by-id, evidence IDs, maintenance reports, and executable fixtures.

## Adopted Benchmark Lessons

- From LongMemEval: keep categories for information extraction, multi-session reasoning, temporal reasoning, knowledge updates, and abstention.
- From LoCoMo/A-Mem/Mem0: include temporal, multi-hop, and open-domain recall, but avoid treating personal-chat QA as sufficient for agent workflows.
- From BEAM: scale matters; context stuffing is not a real memory architecture once data exceeds the model context.
- From AMB: measure agentic tasks, speed, token cost, prompts, and reproducibility, not only accuracy.
- From MemPalace benchmark notes: never compare retrieval recall with QA accuracy as if they are the same metric.

## 0th-Specific Benchmark Target

The next fair benchmark for us is an executable local fixture suite with these task families:

1. Decision recall: answer from active decisions with source pointers.
2. Stale claim sync: mark changed source claims `needs_review`.
3. Repo drift: detect HEAD changes that happened outside the current agent session.
4. Read-set confirmation: only refresh memory tied to files/symbols actually inspected.
5. Open-loop resume: find blocked/open/dropped/reopened work across projects.
6. Evidence expansion: compact recall followed by expand-by-id into source-backed records.
7. User correction retention: preserve corrections as incidents or lessons.
8. Abstention: return no-result shape when memory lacks evidence.
9. Public-benchmark alignment: map each fixture to LongMemEval/LoCoMo/BEAM/AMB where possible.

## Sources

The links below are cited as authored at compile time. They have **not been
independently re-verified inside this repo** (per PR #21 comment-analyzer
finding) — confirm each URL resolves to the named paper or post before
relying on it externally. The `2603.*` arXiv prefix in particular is
future-dated relative to the current document compile date and may not yet
exist.

- LongMemEval paper: https://arxiv.org/abs/2410.10813
- LongMemEval code: https://github.com/xiaowu0162/LongMemEval
- Mem0 paper: https://arxiv.org/abs/2504.19413
- Mem0 memory-benchmarks: https://github.com/mem0ai/memory-benchmarks
- A-Mem reproduction repo: https://github.com/WujiangXu/A-mem
- MemPalace benchmark notes: https://github.com/MemPalace/mempalace/blob/develop/benchmarks/BENCHMARKS.md
- MemPalace repo: https://github.com/MemPalace/mempalace
- Hindsight AMB post: https://hindsight.vectorize.io/blog/2026/03/23/agent-memory-benchmark
- Agent Memory Benchmark repo: https://github.com/vectorize-io/agent-memory-benchmark
- BEAM paper: https://arxiv.org/abs/2510.27246
- Hindsight BEAM post: https://hindsight.vectorize.io/blog/2026/04/02/beam-sota
- MemX paper: https://arxiv.org/abs/2603.16171
