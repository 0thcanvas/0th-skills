---
name: improve-architecture
description: "Use when the user wants architectural cleanup: deepening shallow modules, consolidating coupled code, or improving testability."
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

Read `CONTEXT.md` (if present) for domain vocabulary. If `docs/decisions/` exists, read its contents — especially any record tagged `Durable: yes`, those are anchors not to re-litigate without an explicit revisit. If `docs/decisions/` doesn't exist, treat the area as having no prior decisions; create the directory only when writing a new record.

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

If a new term emerges, track it in working memory — do not write to disk during grilling. Persisting to `CONTEXT.md` happens at hand-off (Step 5) alongside the decision record. If the user rejects the candidate with a load-bearing reason, capture it as a decision record at hand-off (mark `Durable: yes` if all three durability criteria apply) so the same suggestion isn't re-proposed.

### 5. Hand off

Step 5 covers two outcomes from Step 4:

- **Accepted** — candidate has shape. Write the decision record, update `CONTEXT.md` at the project root if vocabulary was resolved or sharpened during the grill, then hand off to `/build`.
- **Rejected** — candidate closed with a load-bearing reason. Write a rejection decision record (mark `Durable: yes` if all three durability criteria apply) so the same suggestion isn't re-proposed, update `CONTEXT.md` if vocabulary was resolved or sharpened, then return to Step 3 to pick another candidate or stop.

`/think` and `/improve-architecture` are the only skills that write to `CONTEXT.md`, and both write only at decision-capture time — never mid-grill.

## Iron Law

**No deepening without explicit user pick.** Surface candidates; don't refactor in this skill. Implementation belongs in `/build`.

## Repo Preflight

Before trusting repo state, run `node "${OTH_SKILLS_ROOT:-$HOME/0thcanvas/skills}/scripts/session-preflight.mjs"`. It fetches upstream, fast-forwards only clean behind branches, and warns on dirty or divergent states without merging, resetting, or stashing.

## Memory Integration

Before finishing a meaningful workflow boundary, run the Memory Write Gate in `../../references/memory-contract.md`. Classify new knowledge as `decision`, `observation`, `root_cause`, `vocabulary`, `incident`, `repo_state`, `external_research`, or `nothing durable`, then write only through the target the contract names.
