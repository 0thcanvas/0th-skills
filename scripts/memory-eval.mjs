#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function parseArgs(argv) {
  const args = {
    questions: path.join(repoRoot, "docs/evals/2026-05-10-memory-recall-questions.json"),
    baselines: path.join(repoRoot, "docs/evals/2026-05-10-memory-backend-baselines.json"),
    output: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--questions") {
      args.questions = path.resolve(argv[++i]);
    } else if (arg === "--baselines") {
      args.baselines = path.resolve(argv[++i]);
    } else if (arg === "--output") {
      args.output = path.resolve(argv[++i]);
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function assertQuestionSet(questions) {
  if (!Array.isArray(questions)) {
    throw new Error("questions must be an array");
  }

  const ids = new Set();
  const requiredCategories = new Set([
    "decision",
    "stale_claim",
    "recurring_mistake",
    "repo_vocabulary",
    "changed_code_behavior",
  ]);
  const categories = new Set();

  for (const question of questions) {
    if (!question.id || ids.has(question.id)) {
      throw new Error(`question id must be present and unique: ${question.id ?? "<missing>"}`);
    }
    ids.add(question.id);

    if (!question.question || typeof question.question !== "string") {
      throw new Error(`question ${question.id} needs question text`);
    }
    if (!question.category || typeof question.category !== "string") {
      throw new Error(`question ${question.id} needs a category`);
    }
    categories.add(question.category);

    if (!Array.isArray(question.required_capabilities) || question.required_capabilities.length === 0) {
      throw new Error(`question ${question.id} needs required_capabilities`);
    }
    if (!Array.isArray(question.evidence_paths) || question.evidence_paths.length === 0) {
      throw new Error(`question ${question.id} needs evidence_paths`);
    }
  }

  for (const category of requiredCategories) {
    if (!categories.has(category)) {
      throw new Error(`question set is missing category: ${category}`);
    }
  }
}

function assertBaselines(baselines) {
  if (!Array.isArray(baselines)) {
    throw new Error("baselines must be an array");
  }

  const requiredIds = new Set([
    "current_markdown_lookup",
    "thin_0th_local_layer",
    "mempalace_verbatim_pattern",
    "agentmemory_lifecycle_profile_pattern",
  ]);
  const ids = new Set();

  for (const baseline of baselines) {
    if (!baseline.id || ids.has(baseline.id)) {
      throw new Error(`baseline id must be present and unique: ${baseline.id ?? "<missing>"}`);
    }
    ids.add(baseline.id);

    if (!baseline.label || typeof baseline.label !== "string") {
      throw new Error(`baseline ${baseline.id} needs a label`);
    }
    if (!baseline.mode || typeof baseline.mode !== "string") {
      throw new Error(`baseline ${baseline.id} needs a mode`);
    }
    if (!Array.isArray(baseline.capabilities)) {
      throw new Error(`baseline ${baseline.id} needs capabilities`);
    }
    if (!Array.isArray(baseline.evidence_paths) || baseline.evidence_paths.length === 0) {
      throw new Error(`baseline ${baseline.id} needs evidence_paths`);
    }
  }

  for (const id of requiredIds) {
    if (!ids.has(id)) {
      throw new Error(`baseline set is missing ${id}`);
    }
  }
}

export function evaluateMemoryBackends(questions, baselines) {
  assertQuestionSet(questions);
  assertBaselines(baselines);

  const results = baselines.map((baseline) => {
    const capabilities = new Set(baseline.capabilities);
    const question_results = questions.map((question) => {
      const missing_capabilities = question.required_capabilities.filter(
        (capability) => !capabilities.has(capability),
      );

      return {
        id: question.id,
        category: question.category,
        answered: missing_capabilities.length === 0,
        missing_capabilities,
      };
    });

    const answered = question_results.filter((result) => result.answered).length;

    return {
      id: baseline.id,
      label: baseline.label,
      mode: baseline.mode,
      answered,
      total: questions.length,
      score: Number((answered / questions.length).toFixed(2)),
      missed: question_results
        .filter((result) => !result.answered)
        .map((result) => ({
          id: result.id,
          missing_capabilities: result.missing_capabilities,
        })),
      question_results,
    };
  });

  const ranked = [...results].sort((left, right) => {
    if (right.answered !== left.answered) {
      return right.answered - left.answered;
    }
    return left.id.localeCompare(right.id);
  });

  return {
    total_questions: questions.length,
    categories: [...new Set(questions.map((question) => question.category))].sort(),
    results,
    recommendation: {
      selected_baseline: ranked[0].id,
      selected_label: ranked[0].label,
      rationale:
        "Select the highest-scoring baseline for the current workflow, then revisit external backends only after an executable retrieval benchmark shows better recall without losing repo workflow integration.",
    },
  };
}

function toMarkdown(report) {
  const lines = [
    "# Memory Backend Eval",
    "",
    `Questions: ${report.total_questions}`,
    `Selected baseline: ${report.recommendation.selected_label} (${report.recommendation.selected_baseline})`,
    "",
    "## Scores",
    "",
    "| Baseline | Mode | Answered | Score |",
    "|---|---|---:|---:|",
  ];

  for (const result of report.results) {
    lines.push(`| ${result.label} | ${result.mode} | ${result.answered}/${result.total} | ${result.score} |`);
  }

  lines.push("", "## Misses", "");

  for (const result of report.results) {
    if (result.missed.length === 0) {
      lines.push(`- ${result.label}: none`);
      continue;
    }

    const misses = result.missed
      .map((miss) => `${miss.id} (${miss.missing_capabilities.join(", ")})`)
      .join("; ");
    lines.push(`- ${result.label}: ${misses}`);
  }

  lines.push("", "## Recommendation", "", report.recommendation.rationale, "");
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log("Usage: node scripts/memory-eval.mjs [--questions FILE] [--baselines FILE] [--output FILE]");
    return;
  }

  const questions = readJson(args.questions);
  const baselines = readJson(args.baselines);
  const report = evaluateMemoryBackends(questions, baselines);

  if (args.output) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, toMarkdown(report));
  }

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
