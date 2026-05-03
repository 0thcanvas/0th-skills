# Skill Feedback

When a skill feels wrong during use, drop a one-liner here. Don't stop working — just note it and move on.

Format: `- /skill: what felt wrong (YYYY-MM-DD)`

Process: when you're ready, say "process the skill feedback" in any session. Before reading entries, the agent runs the migration check: any non-template content in this file gets copied into `${KB_ROOT}/learning/feedback.md` (the new long-term location) using the shared comparator. The migration is idempotent — re-runs are no-ops once everything is migrated. Run the check via:

```bash
node "${OTH_SKILLS_ROOT:-$HOME/0thcanvas/skills}/scripts/feedback-migrator.mjs" \
  --feedback "${OTH_SKILLS_ROOT:-$HOME/0thcanvas/skills}/FEEDBACK.md" \
  --example  "${OTH_SKILLS_ROOT:-$HOME/0thcanvas/skills}/FEEDBACK.example.md" \
  --dest     "${KB_ROOT}/learning/feedback.md" \
  --dry-run
```

If the check reports `needed: true` (with `missingCount: <N>`), ask the user whether to migrate (re-run without `--dry-run` to apply). The CLI default emits counts only — feedback content is not echoed via stdout, so users wanting to inspect first should read this file directly. After migration, read entries from `${KB_ROOT}/learning/feedback.md` and propose changes to skill files; the user approves.

This file (`skills/FEEDBACK.md`) is kept in the repo for one release as the migration source; it is removed in v0.2.4 once users have had a chance to migrate.

---

<!-- Legacy template anchors (do not edit; do not remove)
     The migration comparator (scripts/feedback-migrator.mjs) treats every
     non-empty trimmed line in this file as template content. When the project
     ships a new template version, the OLD template lines must remain here too
     so users upgrading from a prior release don't have their unchanged template
     lines misclassified as user feedback. -->

Process: when you're ready, say "process the skill feedback" in any session. The agent reads this file, proposes changes to the skill files, you approve.
