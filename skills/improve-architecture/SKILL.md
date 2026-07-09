---
name: improve-architecture
description: "Finds high-leverage module deepening opportunities without changing code. Use when a codebase feels tangled, shallow, duplicated, or hard to test through stable interfaces."
argument-hint: "[area to focus on, optional]"
---

# Improve Architecture

Surface evidence-backed deepening candidates; do not refactor. Apply
`../../references/skills-kernel.md` once for root-task preflight, authority, optional delegation,
safety, and closeout.

## Vocabulary

- **Module:** interface plus implementation at any scale.
- **Interface:** everything a caller must know, including invariants and errors.
- **Depth:** useful behavior behind a small interface.
- **Seam:** a boundary where behavior can vary without editing callers.
- **Adapter:** one implementation at a seam.
- **Leverage:** value callers receive from depth.
- **Locality:** change, bugs, and knowledge concentrated behind the interface.

`$ARGUMENTS` identifies the area; otherwise use recent activity or ask for scope when a full scan
would be disproportionate. Read `CONTEXT.md` and relevant decisions first. `Durable: yes` records are
anchors and require an explicit reason to revisit.

## Scan

Look for:

- concepts that require bouncing through many shallow modules;
- pass-through wrappers whose interface is as complex as their implementation;
- duplicated ordering, error, validation, or configuration knowledge across callers;
- seams introduced for hypothetical variation with only one adapter;
- tests coupled to internals because the observable interface is the wrong shape.

Apply the **Deletion test**: if deleting a module makes complexity disappear, it was likely
ceremony; if the complexity reappears across callers, the module was providing locality.

## Propose

Return a ranked candidate list. For each candidate include files, current friction, the deepening
move, leverage, locality, test impact, migration risk, and any durable decision it conflicts with.
Do not invent an interface yet.

Ask for an **explicit user pick** before design work. **Do not refactor** in this skill.

For the chosen candidate, clarify constraints and define the deepened module, seam, adapters, public
behavior, and surviving tests. If accepted, write a short decision record and update `CONTEXT.md`
only for vocabulary resolved during this discussion, then hand off to `/build`. If rejected for a
load-bearing reason, record that decision so the same candidate is not repeatedly proposed.

## References

- `../../references/skills-kernel.md`
- `../../references/working-artifacts.md`
- `../../references/memory-contract.md`
