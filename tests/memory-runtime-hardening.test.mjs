import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { addEvidenceRecord } from "../scripts/evidence.mjs";
import { withFileLock } from "../scripts/lib/lock.mjs";
import { appendMemoryClaim } from "../scripts/memory-write.mjs";
import { expandMemory, recallMemory } from "../scripts/memory-recall.mjs";
import { runMemoryCommand } from "../scripts/memory.mjs";
import { runMemoryMaintain } from "../scripts/memory-maintain.mjs";
import { runMemoryRuntimeEval } from "../scripts/memory-runtime-eval.mjs";
import { addOpenLoop, listOpenLoops, updateOpenLoopStatus } from "../scripts/open-loop.mjs";
import { writeRepoState } from "../scripts/repo-state.mjs";
import { runPreflight } from "../scripts/session-preflight.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

function tempDir(name = "0th-memory-runtime-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line));
}

function sh(cwd, args) {
  return execFileSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function initRepo() {
  const repo = tempDir("0th-memory-runtime-repo-");
  sh(repo, ["git", "init", "-b", "main"]);
  sh(repo, ["git", "config", "user.email", "test@example.com"]);
  sh(repo, ["git", "config", "user.name", "Test User"]);
  fs.writeFileSync(path.join(repo, "memory.txt"), "v1\n");
  sh(repo, ["git", "add", "."]);
  sh(repo, ["git", "commit", "-m", "initial"]);
  return repo;
}

function spawnNode(args, options) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function writeIncident(dir, filename, frontmatter, body = "") {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: [${value.join(", ")}]`;
      return `${key}: ${value}`;
    }),
    "---",
    "",
    body
  ].join("\n"));
}

test("unified memory entrypoint routes normal agent commands", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");

  assert.match(runMemoryCommand(["--help"], { cwd: dir }), /recall/);

  const output = runMemoryCommand([
    "remember",
    "--memory-file",
    memoryFile,
    "--no-brief",
    "--type",
    "decision",
    "--claim",
    "Unified memory command is the normal agent surface.",
    "--scope",
    "repo",
    "--evidence-path",
    "docs/plans/memory.md",
    "--confidence",
    "high"
  ], { cwd: dir });
  const result = JSON.parse(output);
  const [claim] = readJsonl(memoryFile);

  assert.equal(result.written, true);
  assert.equal(claim.type, "decision");
});

test("unified memory entrypoint reports project and global runtime diagnostics", () => {
  const dir = tempDir();
  const stateRoot = path.join(dir, "state");
  const previous = process.env.OTH_SKILLS_STATE_DIR;
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  try {
    const output = runMemoryCommand(["doctor"], { cwd: dir });
    const result = JSON.parse(output);

    assert.equal(result.state_root, stateRoot);
    assert.equal(result.project.memory_file.includes(`${path.sep}projects${path.sep}`), true);
    assert.equal(result.global.memory_file, path.join(stateRoot, "global", "memory", "claims.jsonl"));
    assert.equal(result.global.evidence_file, path.join(stateRoot, "global", "evidence", "events.jsonl"));
    assert.equal(result.global.source_index_file, path.join(stateRoot, "global", "sources", "index.jsonl"));
    assert.equal(result.global.link_file, path.join(stateRoot, "global", "links", "links.jsonl"));
    assert.equal(result.routing.global_scope_claims, "global");
    assert.equal(result.routing.explicit_path_overrides, true);
    assert.match(result.plugin.repo_version, /^\d+\.\d+\.\d+/);
    assert.equal(result.readiness.recall_ready, false);
    assert.equal(typeof result.readiness.project_memory_file_exists, "boolean");
    assert.equal(typeof result.readiness.global_memory_file_exists, "boolean");
    assert.equal(result.readiness.subsystems.project_claims_ready, false);
    assert.equal(result.readiness.subsystems.source_packs_ready, false);

    for (const filePath of [
      result.project.memory_file,
      result.project.task_file,
      result.global.memory_file
    ]) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "\n");
    }

    const initialized = JSON.parse(runMemoryCommand(["doctor"], { cwd: dir }));
    assert.equal(initialized.readiness.project_memory_file_exists, true);
    assert.equal(initialized.readiness.global_memory_file_exists, true);
    assert.equal(initialized.readiness.project_task_file_exists, true);
    assert.equal(initialized.readiness.claim_recall_ready, true);
    assert.equal(initialized.readiness.recall_ready, true);
    assert.equal(initialized.readiness.subsystems.source_packs_ready, false);
  } finally {
    if (previous === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previous;
    }
  }
});

test("unified memory entrypoint ingests and expands global source packs", () => {
  const dir = tempDir();
  const stateRoot = path.join(dir, "state");
  const packFile = path.join(dir, "pack.json");
  const previous = process.env.OTH_SKILLS_STATE_DIR;
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  fs.writeFileSync(packFile, JSON.stringify({
    id: "memory-systems-world-model",
    source_id: "memory-systems-world-model",
    chunks: [
      {
        text: "Source packs keep verbatim chunks behind compact indexes.",
        source_pointer: { kind: "note", id: "source-pack-contract" },
        summary: "Source pack expansion is id-scoped."
      }
    ]
  }));
  try {
    const ingested = JSON.parse(runMemoryCommand(["source-pack", "ingest", "--json", packFile], { cwd: dir }));
    const expanded = JSON.parse(runMemoryCommand(["expand", "--id", "memory-systems-world-model"], { cwd: dir }));

    assert.equal(ingested.source_index_file, path.join(stateRoot, "global", "sources", "index.jsonl"));
    assert.equal(ingested.added_chunks, 1);
    assert.equal(expanded.kind, "source_pack");
    assert.equal(expanded.record.chunks[0].text, "Source packs keep verbatim chunks behind compact indexes.");
  } finally {
    if (previous === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previous;
    }
  }
});

test("evidence records are local provenance and recall expands by id", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "open-loops.jsonl");
  const evidenceFile = path.join(dir, "events.jsonl");

  const evidence = addEvidenceRecord({
    cwd: dir,
    evidenceFile,
    now: new Date("2026-05-11T10:00:00.000Z"),
    input: {
      event_type: "research",
      scope: "repo",
      summary: "LongMemEval maps memory work to indexing, retrieval, and reading.",
      source_paths: ["docs/evals/public-benchmarks.md"],
      redaction_status: "no_secrets_observed"
    }
  });
  const claim = appendMemoryClaim({
    cwd: dir,
    memoryFile,
    briefFile: path.join(dir, "brief.md"),
    now: new Date("2026-05-11T10:01:00.000Z"),
    input: {
      type: "external_research",
      claim: "LongMemEval should inform recall categories but not replace 0th workflow fixtures.",
      scope: "repo",
      evidence_ids: [evidence.id],
      confidence: "high"
    }
  });
  assert.throws(
    () => addEvidenceRecord({
      cwd: dir,
      evidenceFile,
      input: {
        event_type: "research",
        scope: "repo",
        summary: "api_key=abc1234567890secret",
        source_paths: ["docs/x.md"]
      }
    }),
    /secret-like content/
  );
  const commitEvidence = addEvidenceRecord({
    cwd: dir,
    evidenceFile,
    now: new Date("2026-05-11T10:02:00.000Z"),
    input: {
      event_type: "repo_update",
      scope: "repo",
      summary: "Reviewed commit 0123456789abcdef0123456789abcdef01234567 before updating memory.",
      source_paths: ["docs/evals/public-benchmarks.md"],
      redaction_status: "no_secrets_observed"
    }
  });

  const recall = recallMemory({
    cwd: dir,
    memoryFile,
    taskFile,
    evidenceFile,
    query: "LongMemEval workflow fixtures",
    limit: 3
  });
  const expanded = expandMemory({ cwd: dir, memoryFile, taskFile, evidenceFile, id: claim.id });
  const missing = expandMemory({ cwd: dir, memoryFile, taskFile, evidenceFile, id: "missing" });

  assert.equal(recall.abstained, false);
  assert.equal(recall.results[0].id, claim.id);
  assert.deepEqual(recall.results[0].source_pointers, [evidence.id]);
  assert.equal(expanded.found, true);
  assert.equal(expanded.kind, "claim");
  assert.equal(missing.found, false);
  assert.equal(missing.abstained, true);
  assert.equal(commitEvidence.written, true);
});

test("global-scope evidence records route to the global brain", () => {
  const dir = tempDir();
  const stateRoot = path.join(dir, "state");
  const previous = process.env.OTH_SKILLS_STATE_DIR;
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  try {
    const evidence = addEvidenceRecord({
      cwd: dir,
      now: new Date("2026-05-11T12:30:00.000Z"),
      input: {
        event_type: "research",
        scope: "global",
        summary: "GBrain-style sources route cross-project knowledge by source namespace.",
        source_paths: ["sources/global-memory/research-pack.jsonl"],
        redaction_status: "no_secrets_observed"
      }
    });

    assert.equal(evidence.evidence_file, path.join(stateRoot, "global", "evidence", "events.jsonl"));
    assert.equal(readJsonl(evidence.evidence_file)[0].scope, "global");
    assert.equal(fs.existsSync(path.join(stateRoot, "projects")), false);
  } finally {
    if (previous === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previous;
    }
  }
});

test("global evidence records preserve routing provenance fields", () => {
  const dir = tempDir();
  const evidenceFile = path.join(dir, "events.jsonl");
  addEvidenceRecord({
    cwd: dir,
    evidenceFile,
    now: new Date("2026-05-11T13:10:00.000Z"),
    input: {
      event_type: "research",
      scope: "global",
      brain_id: "global",
      source_id: "memory-systems-world-model",
      topic: "agent-memory",
      subject_key: "source-pack-fidelity",
      owner_project_key: "0th-skills",
      summary: "MemPalace-style drawers preserve source text while summaries act as pointers.",
      source_paths: ["sources/memory-systems/source-pack.jsonl"],
      redaction_status: "no_secrets_observed"
    }
  });

  const [record] = readJsonl(evidenceFile);
  assert.equal(record.brain_id, "global");
  assert.equal(record.source_id, "memory-systems-world-model");
  assert.equal(record.topic, "agent-memory");
  assert.equal(record.subject_key, "source-pack-fidelity");
  assert.equal(record.owner_project_key, "0th-skills");
});

test("memory claims automatically record owner project context for later evidence resolution", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");

  appendMemoryClaim({
    cwd: repo,
    memoryFile,
    updateBrief: false,
    input: {
      type: "decision",
      claim: "Relative evidence belongs to the project that wrote the claim.",
      scope: "repo",
      evidence_path: "docs/decisions/owner-context.md",
      confidence: "high"
    }
  });

  const [claim] = readJsonl(memoryFile);
  assert.match(claim.owner_project_key, /^[a-z0-9-]+-[a-f0-9]{12}$/);
  assert.equal(claim.owner_project_root, fs.realpathSync(repo));
  assert.equal(claim.owner_project_identity, fs.realpathSync(repo));
});

test("locked writes preserve concurrent memory claims", async () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const children = Array.from({ length: 8 }, (_, index) => spawnNode([
    path.join(repoRoot, "scripts/memory-write.mjs"),
    "--memory-file",
    memoryFile,
    "--no-brief",
    "--type",
    "observation",
    "--claim",
    `Concurrent write ${index} is preserved.`,
    "--scope",
    "repo",
    "--evidence-path",
    "tests/memory-runtime-hardening.test.mjs",
    "--confidence",
    "medium"
  ], { cwd: dir }));

  const results = await Promise.all(children);
  assert.deepEqual(results.map((result) => result.code), Array(8).fill(0));
  assert.equal(readJsonl(memoryFile).length, 8);
});

test("stale locks are removed visibly instead of blocking forever", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const lockDir = `${memoryFile}.lock`;
  fs.mkdirSync(lockDir, { recursive: true });
  const old = new Date("2000-01-01T00:00:00.000Z");
  fs.utimesSync(lockDir, old, old);

  const result = appendMemoryClaim({
    cwd: dir,
    memoryFile,
    updateBrief: false,
    input: {
      type: "decision",
      claim: "Stale lock removal is visible.",
      scope: "repo",
      evidence_path: "tests/memory-runtime-hardening.test.mjs",
      confidence: "high"
    }
  });

  assert.equal(result.written, true);
  assert.equal(result.lock.stale_removed, true);
});

test("live owner locks are not removed even when mtime looks stale", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const lockDir = `${memoryFile}.lock`;
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    acquired_at: "2000-01-01T00:00:00.000Z"
  })}\n`);
  const old = new Date("2000-01-01T00:00:00.000Z");
  fs.utimesSync(lockDir, old, old);

  assert.throws(
    () => withFileLock(memoryFile, () => {}, {
      timeoutMs: 25,
      staleMs: 1,
      retryMs: 5
    }),
    /timed out waiting for lock/
  );
  assert.equal(fs.existsSync(lockDir), true);
});

test("preflight reconciles repo drift from out-of-band HEAD changes", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");
  const repoStateFile = path.join(repo, "repo-state.json");
  const before = sh(repo, ["git", "rev-parse", "HEAD"]);

  appendMemoryClaim({
    cwd: repo,
    memoryFile,
    updateBrief: false,
    input: {
      id: "memory-text-state",
      type: "repo_state",
      claim: "memory.txt is still v1.",
      scope: "repo",
      source_paths: ["memory.txt"],
      confidence: "high"
    }
  });
  writeRepoState({
    cwd: repo,
    repoStateFile,
    state: {
      branch: "main",
      last_seen_head: before,
      last_memory_sync_at: null
    }
  });

  fs.writeFileSync(path.join(repo, "memory.txt"), "v2\n");
  sh(repo, ["git", "add", "."]);
  sh(repo, ["git", "commit", "-m", "manual update"]);
  const after = sh(repo, ["git", "rev-parse", "HEAD"]);

  const result = runPreflight({ cwd: repo, allowPull: false, memoryFile, repoStateFile });
  const [claim] = readJsonl(memoryFile);

  assert.notEqual(after, before);
  assert.deepEqual(result.drift_sync.affected_claim_ids, ["memory-text-state"]);
  assert.equal(claim.lifecycle_state, "needs_review");
  assert.equal(JSON.parse(fs.readFileSync(repoStateFile, "utf8")).last_seen_head, after);
});

test("maintenance reports stale memory, duplicate claims, missing sources, and open-loop source drift", () => {
  const dir = tempDir();
  const memoryFile = path.join(dir, "claims.jsonl");
  const taskFile = path.join(dir, "open-loops.jsonl");
  const briefFile = path.join(dir, "brief.md");

  for (const id of ["one", "two"]) {
    appendMemoryClaim({
      cwd: dir,
      memoryFile,
      briefFile,
      now: new Date(`2026-05-11T10:0${id === "one" ? "1" : "2"}:00.000Z`),
      input: {
        id,
        type: "decision",
        claim: "Duplicate runtime claims should be reviewed.",
        scope: "repo",
        evidence_path: "missing-doc.md",
        confidence: "high"
      }
    });
  }
  addOpenLoop({
    cwd: dir,
    taskFile,
    briefFile: path.join(dir, "task-brief.md"),
    input: {
      title: "Fix missing source",
      scope: "repo",
      next_action: "Create the missing source or drop this loop.",
      source_paths: ["missing-source.js"]
    }
  });

  const report = runMemoryMaintain({ cwd: dir, memoryFile, taskFile, briefFile });
  const applied = runMemoryMaintain({ cwd: dir, memoryFile, taskFile, briefFile, apply: true });
  const claims = readJsonl(memoryFile);

  assert.equal(report.findings.duplicate_candidates.length, 1);
  assert.equal(report.findings.missing_sources.length, 2);
  assert.equal(report.findings.orphan_open_loops.length, 1);
  assert.deepEqual(applied.actions.map((action) => action.id), ["two"]);
  assert.equal(claims.find((claim) => claim.id === "two").lifecycle_state, "needs_review");
});

test("maintenance resolves global relative evidence through owner context instead of current cwd", () => {
  const ownerRepo = initRepo();
  const otherRepo = initRepo();
  const stateRoot = path.join(tempDir(), "state");
  const previous = process.env.OTH_SKILLS_STATE_DIR;
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  const evidenceRel = "docs/goals/report.md";
  fs.mkdirSync(path.join(ownerRepo, "docs/goals"), { recursive: true });
  fs.writeFileSync(path.join(ownerRepo, evidenceRel), "report\n");

  try {
    appendMemoryClaim({
      cwd: ownerRepo,
      updateBrief: false,
      input: {
        type: "external_research",
        claim: "Global evidence should resolve against its owner project.",
        scope: "global",
        source_id: "owner-context-test",
        evidence_path: evidenceRel,
        confidence: "high"
      }
    });

    const report = runMemoryMaintain({ cwd: otherRepo });

    assert.equal(report.findings.global.missing_sources.length, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previous;
    }
  }
});

test("maintenance reports and applies raw-to-archived evidence relocation", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");
  const taskFile = path.join(repo, "tasks.jsonl");
  const sourceIndexFile = path.join(repo, "sources.jsonl");
  const rawRel = "obsidian/0thcanvas/research/topic/raw/2026-05-19-note.md";
  const archivedRel = "obsidian/0thcanvas/research/topic/raw/archived/2026-05-19-note.md";
  fs.mkdirSync(path.dirname(path.join(repo, archivedRel)), { recursive: true });
  fs.writeFileSync(path.join(repo, archivedRel), "archived note\n");

  appendMemoryClaim({
    cwd: repo,
    memoryFile,
    updateBrief: false,
    input: {
      id: "archived-evidence",
      type: "external_research",
      claim: "Archived raw notes remain valid evidence after compile.",
      scope: "repo",
      evidence_path: rawRel,
      confidence: "high"
    }
  });

  const report = runMemoryMaintain({ cwd: repo, memoryFile, taskFile, sourceIndexFile });
  assert.equal(report.findings.missing_sources.length, 0);
  assert.deepEqual(report.findings.relocatable_sources.map((entry) => entry.relocated_path), [archivedRel]);

  const applied = runMemoryMaintain({ cwd: repo, memoryFile, taskFile, sourceIndexFile, apply: true });
  const [claim] = readJsonl(memoryFile);

  assert.equal(claim.evidence_path, archivedRel);
  assert.deepEqual(applied.actions.map((action) => action.action), ["repaired_evidence_pointer"]);
});

test("maintenance imports recurring retro incident patterns without reading correction bodies", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");
  const taskFile = path.join(repo, "tasks.jsonl");
  const sourceIndexFile = path.join(repo, "sources.jsonl");
  const incidentDir = path.join(repo, "kb", "learning", "skill-incidents");

  for (const index of [1, 2, 3]) {
    writeIncident(
      incidentDir,
      `2026-05-${10 + index}-visual-${index}.md`,
      {
        date: `2026-05-${10 + index}T12:00:00-05:00`,
        skill: "general-agent",
        classification: "verification-skipped",
        severity: "moderate",
        tags: ["visual-verification"]
      },
      "## Correction evidence\nThis body must not be copied into Memory v2 claims.\n"
    );
  }

  const dryRun = runMemoryMaintain({
    cwd: repo,
    memoryFile,
    taskFile,
    sourceIndexFile,
    incidentDir,
    maintainedAt: "2026-05-19T00:00:00.000Z"
  });
  assert.equal(dryRun.findings.incident_patterns.length >= 1, true);

  const applied = runMemoryMaintain({
    cwd: repo,
    memoryFile,
    taskFile,
    sourceIndexFile,
    incidentDir,
    maintainedAt: "2026-05-19T00:00:00.000Z",
    apply: true
  });
  const secondApply = runMemoryMaintain({
    cwd: repo,
    memoryFile,
    taskFile,
    sourceIndexFile,
    incidentDir,
    maintainedAt: "2026-05-19T00:00:00.000Z",
    apply: true
  });
  const imported = readJsonl(memoryFile).filter((claim) => claim.type === "incident");

  assert.equal(applied.actions.some((action) => action.action === "imported_incident_pattern"), true);
  assert.equal(secondApply.actions.some((action) => action.action === "imported_incident_pattern"), false);
  assert.equal(imported.length > 0, true);
  assert.equal(JSON.stringify(imported).includes("This body must not be copied"), false);
  assert.equal(imported.every((claim) => claim.source_paths.length >= 3), true);
});

test("maintenance surfaces instruction drift and generated local log noise as advisory findings", () => {
  const repo = initRepo();
  const memoryFile = path.join(repo, "claims.jsonl");
  const taskFile = path.join(repo, "tasks.jsonl");
  const sourceIndexFile = path.join(repo, "sources.jsonl");
  fs.writeFileSync(path.join(repo, "CLAUDE.md"), "Read index.md at session start. Always.\n");
  fs.writeFileSync(path.join(repo, "error.log"), "generated tool output\n");

  const report = runMemoryMaintain({ cwd: repo, memoryFile, taskFile, sourceIndexFile });

  assert.equal(report.findings.instruction_drift.length, 1);
  assert.match(report.findings.instruction_drift[0].recommendation, /Memory v2/);
  assert.equal(report.findings.local_artifacts.length, 1);
  assert.match(report.findings.local_artifacts[0].recommendation, /state root|ignore/);
});

test("open-loop lifecycle keeps audit history and can list across project runtime dirs", () => {
  const previousStateRoot = process.env.OTH_SKILLS_STATE_DIR;
  const stateRoot = tempDir("0th-open-loop-state-");
  process.env.OTH_SKILLS_STATE_DIR = stateRoot;
  try {
    const repoA = path.join(tempDir(), "repo-a");
    const repoB = path.join(tempDir(), "repo-b");
    fs.mkdirSync(repoA);
    fs.mkdirSync(repoB);

    const added = addOpenLoop({
      cwd: repoA,
      now: new Date("2026-05-11T11:00:00.000Z"),
      input: {
        title: "Resume Memory v2 runtime hardening",
        scope: "project",
        priority: "P1",
        next_action: "Continue implementation.",
        evidence_path: "docs/plans/memory-v2-runtime-hardening.md"
      }
    });
    updateOpenLoopStatus({
      cwd: repoA,
      id: added.id,
      status: "blocked",
      blockedReason: "Waiting for benchmark mapping.",
      now: new Date("2026-05-11T11:05:00.000Z")
    });
    updateOpenLoopStatus({
      cwd: repoA,
      id: added.id,
      status: "open",
      nextAction: "Benchmark mapping is done; continue.",
      now: new Date("2026-05-11T11:10:00.000Z")
    });
    addOpenLoop({
      cwd: repoB,
      input: {
        title: "Global memory check",
        scope: "global",
        next_action: "Review cross-project memory.",
        evidence_path: "references/open-loops.md"
      }
    });

    const [loop] = readJsonl(added.task_file);
    const all = listOpenLoops({ cwd: repoA, allProjects: true });

    assert.deepEqual(loop.history.map((entry) => entry.event), ["created", "blocked", "reopened"]);
    assert.equal(all.loop_count, 2);
  } finally {
    if (previousStateRoot === undefined) {
      delete process.env.OTH_SKILLS_STATE_DIR;
    } else {
      process.env.OTH_SKILLS_STATE_DIR = previousStateRoot;
    }
  }
});

test("runtime eval exercises memory behavior fixtures end to end", () => {
  const report = runMemoryRuntimeEval();

  assert.equal(report.outcome, "PASS");
  assert.deepEqual(
    report.results.map((result) => result.name),
    [
      "recall-expand-evidence",
      "stale-claim-sync",
      "manual-head-drift",
      "open-loop-resume-history",
      "user-correction-retention",
      "global-write-scoped-recall",
      "project-global-conflict",
      "source-pack-fidelity",
      "stale-global-maintenance",
      "no-obsidian-dependency",
      "abstention",
      "non-repo-preflight-advisory",
      "owner-context-global-evidence",
      "raw-archived-relocation",
      "retro-incident-import",
      "partial-readiness-and-hygiene"
    ]
  );
});
