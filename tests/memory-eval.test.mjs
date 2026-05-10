import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { evaluateMemoryBackends } from "../scripts/memory-eval.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("evaluateMemoryBackends scores baselines by required capabilities", () => {
  const questions = [
    {
      id: "q1",
      question: "What decision was made?",
      category: "decision",
      required_capabilities: ["source_provenance"],
      evidence_paths: ["docs/decisions/example.md"],
    },
    {
      id: "q2",
      question: "What stale claim changed?",
      category: "stale_claim",
      required_capabilities: ["source_provenance", "repo_sync"],
      evidence_paths: ["scripts/example.mjs"],
    },
    {
      id: "q3",
      question: "What mistake keeps recurring?",
      category: "recurring_mistake",
      required_capabilities: ["incident_aggregation"],
      evidence_paths: ["docs/decisions/incidents.md"],
    },
    {
      id: "q4",
      question: "Which vocabulary should be used?",
      category: "repo_vocabulary",
      required_capabilities: ["generated_brief"],
      evidence_paths: ["CONTEXT.md"],
    },
    {
      id: "q5",
      question: "What behavior changed?",
      category: "changed_code_behavior",
      required_capabilities: ["repo_sync"],
      evidence_paths: ["scripts/example.mjs"],
    },
    {
      id: "q6",
      question: "What unfinished work remains?",
      category: "open_loop",
      required_capabilities: ["open_loop_tracking", "source_provenance"],
      evidence_paths: ["scripts/open-loop.mjs"],
    },
  ];
  const baselines = [
    {
      id: "current_markdown_lookup",
      label: "Current markdown lookup",
      mode: "manual",
      capabilities: ["source_provenance"],
      evidence_paths: ["PROTOCOL.md"],
    },
    {
      id: "thin_0th_local_layer",
      label: "Thin 0th local layer",
      mode: "local_executable",
      capabilities: ["source_provenance", "repo_sync", "incident_aggregation", "generated_brief", "open_loop_tracking"],
      evidence_paths: ["scripts/memory-sync.mjs"],
    },
    {
      id: "gbrain_task_manager_pattern",
      label: "GBrain-style task manager",
      mode: "research_pattern",
      capabilities: ["open_loop_tracking", "source_provenance"],
      evidence_paths: ["research/gbrain.md"],
    },
    {
      id: "mempalace_verbatim_pattern",
      label: "MemPalace-style verbatim retrieval",
      mode: "research_pattern",
      capabilities: ["source_provenance", "verbatim_retrieval"],
      evidence_paths: ["research/mempalace.md"],
    },
    {
      id: "agentmemory_lifecycle_profile_pattern",
      label: "agentmemory-style lifecycle/profile",
      mode: "research_pattern",
      capabilities: ["source_provenance", "generated_brief", "incident_aggregation"],
      evidence_paths: ["research/agentmemory.md"],
    },
  ];

  const report = evaluateMemoryBackends(questions, baselines);

  assert.equal(report.recommendation.selected_baseline, "thin_0th_local_layer");
  assert.equal(report.results.find((result) => result.id === "thin_0th_local_layer").answered, 6);
  assert.equal(report.results.find((result) => result.id === "current_markdown_lookup").answered, 1);
});

test("real memory eval set covers required categories and candidate baselines", () => {
  const questions = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "docs/evals/2026-05-10-memory-recall-questions.json"), "utf8"),
  );
  const baselines = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "docs/evals/2026-05-10-memory-backend-baselines.json"), "utf8"),
  );

  const report = evaluateMemoryBackends(questions, baselines);

  assert.ok(questions.length >= 10);
  assert.deepEqual(report.categories, [
    "changed_code_behavior",
    "decision",
    "open_loop",
    "recurring_mistake",
    "repo_vocabulary",
    "stale_claim",
  ]);
  assert.deepEqual(
    report.results.map((result) => result.id).sort(),
    [
      "agentmemory_lifecycle_profile_pattern",
      "current_markdown_lookup",
      "gbrain_task_manager_pattern",
      "mempalace_verbatim_pattern",
      "thin_0th_local_layer",
    ],
  );
  assert.equal(report.recommendation.selected_baseline, "thin_0th_local_layer");
});

test("memory eval CLI emits JSON and writes a markdown report", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-eval-"));
  const outputPath = path.join(tempDir, "report.md");
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(repoRoot, "scripts/memory-eval.mjs"),
      "--output",
      outputPath,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  const report = JSON.parse(stdout);
  const markdown = fs.readFileSync(outputPath, "utf8");

  assert.equal(report.recommendation.selected_baseline, "thin_0th_local_layer");
  assert.match(markdown, /# Memory Backend Eval/);
  assert.match(markdown, /Thin 0th local layer/);
});
