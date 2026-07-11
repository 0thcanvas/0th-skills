# Skill Feedback

When a skill feels wrong during use, drop a one-liner here. Don't stop working — just note it and move on.

Format: `- /skill: what felt wrong (YYYY-MM-DD)`

Process: when you're ready, say "process the skill feedback" in any session. Before reading entries, the agent runs the migration check: any non-template content in this file gets copied into `${KB_ROOT}/learning/feedback.md` (the new long-term location) using the shared comparator. The migration is idempotent — re-runs are no-ops once everything is migrated. Run the check via:

```bash
node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/scripts/feedback-migrator.mjs" \
  --feedback "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/FEEDBACK.md" \
  --example  "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT to the 0th-skills directory}/FEEDBACK.example.md" \
  --dest     "${KB_ROOT}/learning/feedback.md" \
  --dry-run
```

If the check reports `needed: true` (with `missingCount: <N>`), ask the user whether to migrate (re-run without `--dry-run` to apply). The CLI default emits counts only — feedback content is not echoed via stdout, so users wanting to inspect first should read this file directly. After migration, read entries from `${KB_ROOT}/learning/feedback.md` and propose changes to skill files; the user approves.

This file (`FEEDBACK.md` at the repo root) is kept in the repo for a migration-overlap window; it will be removed in a later release once users have had a chance to migrate.

---

- /ship: counterpart review auto-detection missed Codex Desktop because CODEX_SANDBOX was absent, then silently defaulted to Codex instead of failing or using Claude (2026-05-05)
- /research, /deep-research: Codex ran research in the main thread when named 0th workflow labels were treated as direct agent types; skills need explicit spawn_agent dispatch profiles (2026-05-16)
- Browser Kit and computer-use: browser workflows encouraged opening new tabs/windows before checking reusable logged-in sessions; add session-reuse preflight before navigation (2026-05-16)
- /build, verifier: a current-process env miss allowed premature `BLOCKED_REAL_ENV` despite configured 1Password runners; require the safe-runner preflight before blocking (2026-07-11)
