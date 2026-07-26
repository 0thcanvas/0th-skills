# Evidence-Adaptive Execution

The agent selects the internal coordination artifact. Do not ask the user to choose between direct
execution, a checkpoint, or a plan.

- **Direct** — one bounded execution loop with clear acceptance and no unresolved authority or
  architecture decision. Do the work; do not manufacture a plan or state file.
- **Adaptive checkpoint** — ordered investigation, debugging, research, or implementation where
  evidence changes the next action. Record only the current claim, source pointer, caveat,
  unresolved contradiction, unresolved gap, and next read or action. This is learned state, not a
  prospective checklist.
- **Formal plan** — use only when prospective slices materially reduce execution risk across
  sessions, dependent decisions, ownership boundaries, or a handoff too large for a bounded
  checkpoint. Slice by observable outcome and proof.

File count, an ordered multi-file edit, or multiple implementation approaches is not by itself a
reason for a formal plan. Ask one focused intention question only when available evidence leaves
multiple plausible outcome-level intentions that materially change acceptance, authority, or
irreversible effects. Multiple implementation paths to one outcome are not ambiguity.

External/live effects and irreversible changes increase risk but do not automatically require a
formal plan. They require explicit authority and a bounded effect contract: target, authority, cost
ceiling, reversibility, and stop condition. Infer that contract from the request, repository, and
current evidence; ask the user only for missing authority or an outcome-level tradeoff.

If the user requests a plan as the deliverable, provide one. That request does not make user approval
of internal planning mechanics a prerequisite for a separately authorized implementation.

At a context boundary, transfer a bounded `ResultPacket`: claim ids and conclusions, source
pointers, caveats, unresolved contradictions, unresolved gaps, and next reads or actions. Keep raw
evidence in its owning files. A receiving agent or resumed context must not silently fill missing
packet fields from plausibility.

This policy is harness-neutral. Model selection, capability probes, launch controls, and execution
receipts belong to runtime adapters.
