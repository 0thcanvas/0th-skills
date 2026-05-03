---
name: improve-architecture
description: "Find deepening opportunities in a codebase — refactors that turn shallow modules into deep ones. Use when the user wants to improve architecture, find refactoring candidates, consolidate coupled modules, or make code more testable and AI-navigable. Run periodically, not per-feature."
argument-hint: "[area to focus on, optional]"
---

# Improve Architecture

Surface architectural friction. Propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

This is a slow skill. Run it occasionally — every few days on an active codebase, not after every feature.

## Direct Invocation

If the user invoked this skill directly, treat `$ARGUMENTS` as the area to focus on (a path, module name, or natural-language scope). If `$ARGUMENTS` is empty, ask the user where to look or scan the whole codebase based on recent activity.

## When to Use

- "The codebase feels tangled."
- "Where would refactoring pay off?"
- After a high-velocity AI-coded sprint that may have accelerated entropy.

Skip when working on a specific feature — use `/build` for new code or `/think` for new design. This skill operationalizes the workspace principle "prefer deep modules over shallow ones."

## Vocabulary

Use these terms exactly. Consistent language is the point — don't substitute "component," "service," "API," or "boundary."

- **Module** — anything with an interface and an implementation (function, class, package, slice). Scale-agnostic.
- **Interface** — everything a caller must know to use the module: types, invariants, ordering, error modes, configuration. Not just the type signature.
- **Implementation** — what's inside the module.
- **Depth** — leverage at the interface. **Deep** = significant behaviour behind a small interface. **Shallow** = interface nearly as complex as implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place.
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

## Heuristics

- **Deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.** If you want to test past the interface, the module is probably the wrong shape.
- **One adapter = hypothetical seam. Two adapters = real seam.** Don't introduce a seam unless something actually varies across it.

## Process

### 1. Read context

Read `CONTEXT.md` (if present) for domain vocabulary. Read decision records in `docs/decisions/`, especially any tagged `Durable: yes` — those are anchors you should not re-litigate without an explicit revisit.

### 2. Explore

Walk the area you're touching. Look for friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as implementation?
- Where have pure functions been extracted just for testability while real bugs hide in the call chain (no **locality**)?
- Which areas are hard to test through the current interface?

Apply the deletion test to anything you suspect is shallow.

### 3. Propose

Present a numbered list of deepening opportunities. Each candidate:

- **Files** — modules involved
- **Problem** — current friction in plain language
- **Solution** — what would change
- **Benefits** — explained in **leverage** and **locality**, plus how tests improve

Use `CONTEXT.md` vocabulary for the domain ("the Order intake module," not "the FooBarHandler"). Use the architectural vocabulary above for shape.

If a candidate contradicts a `Durable: yes` decision record, mark it clearly: *"contradicts decision YYYY-MM-DD-topic — only worth reopening because…"*. Don't list theoretical refactors a durable record forbids.

Do NOT propose interfaces yet. Ask: "Which would you like to explore?"

### 4. Grill the chosen candidate

Drop into `/think`-style grilling on the picked candidate. Walk the design tree: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

If a new term emerges, update `CONTEXT.md` inline. If the user rejects the candidate with a load-bearing reason, capture it as a decision record in `docs/decisions/` (mark `Durable: yes` if all three durability criteria apply) so the same suggestion isn't re-proposed.

### 5. Hand off

Once a candidate has shape, write a short decision record and hand off to `/build`.

## Iron Law

**No deepening without explicit user pick.** Surface candidates; don't refactor in this skill. Implementation belongs in `/build`.
