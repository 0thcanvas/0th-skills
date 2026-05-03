import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { migrate, computeNonTemplateLines } from "../scripts/feedback-migrator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEMPLATE = `# Skill Feedback

When a skill feels wrong during use, drop a one-liner here. Don't stop working — just note it and move on.

Format: \`- /skill: what felt wrong (YYYY-MM-DD)\`

Process: when you're ready, say "process the skill feedback" in any session. The agent reads this file, proposes changes to the skill files, you approve.

---
`;

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-migrator-"));
  const examplePath = path.join(dir, "FEEDBACK.example.md");
  const feedbackPath = path.join(dir, "FEEDBACK.md");
  const destinationPath = path.join(dir, "kb", "learning", "feedback.md");
  fs.writeFileSync(examplePath, TEMPLATE);
  return { dir, examplePath, feedbackPath, destinationPath };
}

test("template-only source: no migration needed", () => {
  const ws = makeWorkspace();
  fs.writeFileSync(ws.feedbackPath, TEMPLATE);

  const result = migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
    dryRun: true,
  });

  assert.equal(result.needed, false);
  assert.deepEqual(result.missingLines, []);
});

test("template + user entries: migration appends only the user lines", () => {
  const ws = makeWorkspace();
  fs.writeFileSync(
    ws.feedbackPath,
    TEMPLATE +
      "- /think: grilling felt rushed (2026-04-12)\n" +
      "- /build: implementer skipped redact stage (2026-04-15)\n"
  );

  const result = migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
  });

  assert.equal(result.needed, true);
  assert.deepEqual(result.appendedLines, [
    "- /think: grilling felt rushed (2026-04-12)",
    "- /build: implementer skipped redact stage (2026-04-15)",
  ]);
  // Destination file now exists with the user lines
  const destContent = fs.readFileSync(ws.destinationPath, "utf8");
  assert.match(destContent, /- \/think: grilling felt rushed/);
  assert.match(destContent, /- \/build: implementer skipped redact stage/);
});

test("absent destination is treated as empty (no error, all user lines copied)", () => {
  const ws = makeWorkspace();
  fs.writeFileSync(ws.feedbackPath, TEMPLATE + "- /think: stuck (2026-04-01)\n");
  // destinationPath does NOT exist yet — its parent dir doesn't either
  assert.equal(fs.existsSync(ws.destinationPath), false);
  assert.equal(fs.existsSync(path.dirname(ws.destinationPath)), false);

  const result = migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
  });

  assert.equal(result.needed, true);
  assert.deepEqual(result.appendedLines, ["- /think: stuck (2026-04-01)"]);
  assert.equal(fs.existsSync(ws.destinationPath), true);
});

test("already-migrated destination: re-run is a no-op", () => {
  const ws = makeWorkspace();
  fs.writeFileSync(ws.feedbackPath, TEMPLATE + "- /think: already copied (2026-04-01)\n");

  // First run: copy
  migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
  });

  // Second run: should detect everything is already in dest
  const result = migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
  });

  assert.equal(result.needed, false);
  assert.deepEqual(result.missingLines, []);
});

test("partial migration: re-run appends only the not-yet-copied lines", () => {
  const ws = makeWorkspace();
  fs.writeFileSync(
    ws.feedbackPath,
    TEMPLATE +
      "- /think: line A (2026-04-01)\n" +
      "- /build: line B (2026-04-02)\n" +
      "- /debug: line C (2026-04-03)\n"
  );
  // Pre-populate destination with only line A
  fs.mkdirSync(path.dirname(ws.destinationPath), { recursive: true });
  fs.writeFileSync(ws.destinationPath, "- /think: line A (2026-04-01)\n");

  const result = migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
  });

  assert.equal(result.needed, true);
  assert.deepEqual(result.appendedLines, [
    "- /build: line B (2026-04-02)",
    "- /debug: line C (2026-04-03)",
  ]);
  // Destination now has all three; line A wasn't duplicated
  const destContent = fs.readFileSync(ws.destinationPath, "utf8");
  const lineACount = (destContent.match(/line A/g) || []).length;
  assert.equal(lineACount, 1, "line A should not be duplicated");
});

test("comparator: trimmed-content equality, ignoring leading/trailing whitespace", () => {
  // A user line that matches a template line after trimming whitespace should NOT count as non-template
  const example = "# Title\nshared line\n";
  const feedback = "# Title\n  shared line  \n- new entry\n"; // shared line has extra whitespace
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-migrator-trim-"));
  const examplePath = path.join(dir, "ex.md");
  const feedbackPath = path.join(dir, "fb.md");
  fs.writeFileSync(examplePath, example);
  fs.writeFileSync(feedbackPath, feedback);

  const missing = computeNonTemplateLines({ feedbackPath, examplePath });
  assert.deepEqual(missing, ["- new entry"], "trimmed-equal lines should not be flagged as non-template");
});

test("comparator: empty lines are never flagged as non-template (noise filter)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "feedback-migrator-empty-"));
  const examplePath = path.join(dir, "ex.md");
  const feedbackPath = path.join(dir, "fb.md");
  fs.writeFileSync(examplePath, "# Title\n");
  fs.writeFileSync(feedbackPath, "# Title\n\n\n  \n- entry\n\n");

  const missing = computeNonTemplateLines({ feedbackPath, examplePath });
  assert.deepEqual(missing, ["- entry"]);
});

test("legacy v0.2.2 FEEDBACK.md content is recognized as template, not user feedback", () => {
  // Simulates a user upgrading from v0.2.2 with the unchanged original template.
  // The example must treat the OLD template lines as template too, otherwise the
  // migrator would report them as non-template and try to copy the old prose to KB.
  const ws = makeWorkspace();
  // Use the actual v0.2.2 FEEDBACK.md content (the version currently committed before
  // this PR's slice 4 edits would have rewritten it).
  const v022 = `# Skill Feedback

When a skill feels wrong during use, drop a one-liner here. Don't stop working — just note it and move on.

Format: \`- /skill: what felt wrong (YYYY-MM-DD)\`

Process: when you're ready, say "process the skill feedback" in any session. The agent reads this file, proposes changes to the skill files, you approve.

---
`;
  // Use the SHIPPED FEEDBACK.example.md as the template baseline (not the test's TEMPLATE constant)
  const realExamplePath = path.resolve(__dirname, "..", "FEEDBACK.example.md");
  fs.copyFileSync(realExamplePath, ws.examplePath);
  fs.writeFileSync(ws.feedbackPath, v022);

  const result = migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
    dryRun: true,
  });

  assert.equal(
    result.needed,
    false,
    "v0.2.2 template content should be recognized as template; it must NOT be classified as user feedback to migrate"
  );
  assert.deepEqual(result.missingLines, []);
});

test("CLI default output suppresses missingLines and appendedLines for privacy", async () => {
  // Library callers can still get the lines via the function return; the CLI
  // default must report counts only so feedback content doesn't leak through
  // stdout into transcripts or counterpart-review prompts.
  const ws = makeWorkspace();
  fs.writeFileSync(
    ws.feedbackPath,
    TEMPLATE +
      "- /think: privacy-sensitive feedback line (2026-04-01)\n"
  );

  const { spawnSync } = await import("node:child_process");
  const scriptPath = path.resolve(__dirname, "..", "scripts", "feedback-migrator.mjs");
  const result = spawnSync(
    "node",
    [scriptPath, "--feedback", ws.feedbackPath, "--example", ws.examplePath, "--dest", ws.destinationPath, "--dry-run"],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.needed, true);
  assert.equal(typeof parsed.missingCount, "number", "default CLI output should report missingCount");
  assert.equal(parsed.missingCount, 1);
  assert.ok(
    !("missingLines" in parsed) || parsed.missingLines === undefined,
    "default CLI output must NOT include missingLines so feedback content doesn't leak via stdout"
  );
  assert.ok(
    !result.stdout.includes("privacy-sensitive feedback line"),
    "default CLI stdout must not echo any feedback line"
  );
});

test("CLI --show-lines flag opts into emitting line content for debugging", async () => {
  const ws = makeWorkspace();
  fs.writeFileSync(ws.feedbackPath, TEMPLATE + "- /think: visible (2026-04-01)\n");

  const { spawnSync } = await import("node:child_process");
  const scriptPath = path.resolve(__dirname, "..", "scripts", "feedback-migrator.mjs");
  const result = spawnSync(
    "node",
    [
      scriptPath,
      "--feedback", ws.feedbackPath,
      "--example", ws.examplePath,
      "--dest", ws.destinationPath,
      "--dry-run",
      "--show-lines",
    ],
    { encoding: "utf8" }
  );

  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(parsed.missingLines, ["- /think: visible (2026-04-01)"]);
});

test("missing FEEDBACK.md returns no-op (nothing to migrate)", () => {
  const ws = makeWorkspace();
  // Don't create feedbackPath
  assert.equal(fs.existsSync(ws.feedbackPath), false);

  const result = migrate({
    feedbackPath: ws.feedbackPath,
    examplePath: ws.examplePath,
    destinationPath: ws.destinationPath,
  });

  assert.equal(result.needed, false);
  assert.deepEqual(result.missingLines, []);
});
