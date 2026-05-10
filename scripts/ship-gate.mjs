#!/usr/bin/env node
// ship-gate.mjs — invoked by /ship before `gh pr create`.
//
// Reads ${VERIFICATION_REPORT_DIR:-verification-report}/report.json,
// independently re-derives the expected stack set from the repo, and exits
// non-zero if any expected stack is absent from stack_minimums_exercised,
// the report is missing/malformed, or outcome is not PASS.
//
// Per docs/decisions/2026-05-03-self-testing-loop-architecture.md.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const REQUIRED_ENTRY_KEYS = ["stack", "criterion", "tool", "evidence_path", "exercised_at"];
const ACCEPTANCE_OUTCOMES = new Set(["PASS", "NEEDS_ITERATION", "BLOCKED_BY_SPEC", "NOT_REQUIRED"]);

const WEB_FRAMEWORK_CONFIGS = [
  "next.config.js", "next.config.mjs", "next.config.ts",
  "vite.config.js", "vite.config.mjs", "vite.config.ts",
  "astro.config.js", "astro.config.mjs", "astro.config.ts"
];

const REAL_SESSION_PATTERN = /real[- ]session|logged[- ]in|shared[- ]tab|user'?s chrome/i;

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function resolveRepoRoot(cwd) {
  // Resolve to the git toplevel so /ship works from any subdirectory of the
  // project. If we aren't inside a git repo, fall back to cwd — the gate's
  // detection still runs and either matches root signals or no-ops cleanly.
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    });
    return out.trim() || cwd;
  } catch {
    return cwd;
  }
}

export function loadBrief(repoRoot, reportDir) {
  // The brief drives bb-browser-escape-hatch detection. /build writes
  // verification-report/brief.txt when dispatching the verifier so the
  // gate can re-read it independently. Env var SHIP_GATE_BRIEF overrides
  // the file (for ad-hoc runs).
  const envBrief = process.env.SHIP_GATE_BRIEF;
  if (envBrief) return envBrief;
  const briefPath = join(repoRoot, reportDir, "brief.txt");
  if (!existsSync(briefPath)) return "";
  try {
    return readFileSync(briefPath, "utf8");
  } catch {
    return "";
  }
}

export function detectStacks(repoPath, brief = "") {
  const stacks = new Set();
  const pkg = readJson(join(repoPath, "package.json"));
  const allDeps = pkg
    ? { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
    : {};

  const hasElectron =
    "electron" in allDeps ||
    existsSync(join(repoPath, "electron", "main.ts")) ||
    existsSync(join(repoPath, "electron", "main.js"));
  if (hasElectron) stacks.add("electron-desktop");

  const manifest = readJson(join(repoPath, "manifest.json"));
  if (manifest && manifest.manifest_version === 3) {
    stacks.add("chrome-mv3-extension");
  }

  const hasWebConfig =
    WEB_FRAMEWORK_CONFIGS.some(c => existsSync(join(repoPath, c))) ||
    existsSync(join(repoPath, "app")) ||
    existsSync(join(repoPath, "pages"));
  if (hasWebConfig && !hasElectron) stacks.add("web-app");

  const hasUIDeps =
    hasElectron ||
    stacks.has("chrome-mv3-extension") ||
    stacks.has("web-app");

  if (pkg?.bin && !hasUIDeps) stacks.add("cli");

  const hasService =
    existsSync(join(repoPath, "Dockerfile")) ||
    existsSync(join(repoPath, "fly.toml"));
  if (hasService && !hasUIDeps) stacks.add("service");

  if (REAL_SESSION_PATTERN.test(brief)) {
    stacks.add("bb-browser-escape-hatch");
  }

  return [...stacks];
}

export function validateReport(report, expectedStacks) {
  const reasons = [];

  if (expectedStacks.length === 0) {
    return { ok: true, reasons };
  }

  if (!report || typeof report !== "object") {
    reasons.push("verification report is missing or not an object");
    return { ok: false, reasons };
  }

  if (!Array.isArray(report.stack_minimums_exercised)) {
    reasons.push("stack_minimums_exercised is missing or not an array");
    return { ok: false, reasons };
  }

  if (report.pre_dispatch_tool_failures_reviewed !== true) {
    reasons.push("pre_dispatch_tool_failures_reviewed must be true");
  }

  const exercisedStacks = new Set();
  for (const entry of report.stack_minimums_exercised) {
    if (!entry || typeof entry !== "object") {
      reasons.push(`malformed entry in stack_minimums_exercised: ${JSON.stringify(entry)}`);
      continue;
    }
    for (const key of REQUIRED_ENTRY_KEYS) {
      if (!(key in entry)) {
        reasons.push(`entry missing required key '${key}': ${JSON.stringify(entry)}`);
      }
    }
    if (entry.stack) exercisedStacks.add(entry.stack);
  }

  for (const stack of expectedStacks) {
    if (!exercisedStacks.has(stack)) {
      reasons.push(`expected stack '${stack}' not present in stack_minimums_exercised`);
    }
  }

  if (report.outcome !== "PASS") {
    reasons.push(`outcome is '${report.outcome}', not 'PASS'`);
  }

  return { ok: reasons.length === 0, reasons };
}

export function validateProductAcceptanceReport(report) {
  const reasons = [];

  if (!report || typeof report !== "object") {
    reasons.push("product acceptance report is missing or not an object");
    return { ok: false, reasons };
  }

  if (report.schema_version !== 1) {
    reasons.push("schema_version must be 1");
  }

  if (typeof report.required !== "boolean") {
    reasons.push("required must be a boolean");
  }

  if (typeof report.required_rationale !== "string" || report.required_rationale.trim() === "") {
    reasons.push("required_rationale must be a non-empty string");
  }

  if (!ACCEPTANCE_OUTCOMES.has(report.outcome)) {
    reasons.push(`outcome must be one of ${[...ACCEPTANCE_OUTCOMES].join(", ")}`);
  }

  if (typeof report.reviewed_at !== "string" || report.reviewed_at.trim() === "") {
    reasons.push("reviewed_at must be a non-empty ISO timestamp string");
  }

  if (report.required === true && report.outcome !== "PASS") {
    reasons.push(`required product acceptance outcome is '${report.outcome}', not 'PASS'`);
  }

  if (report.required === false && report.outcome !== "NOT_REQUIRED") {
    reasons.push(`not-required product acceptance outcome is '${report.outcome}', not 'NOT_REQUIRED'`);
  }

  if (report.required === true) {
    if (!report.source || typeof report.source !== "object") {
      reasons.push("source must be an object for required product acceptance");
    }
    if (!Array.isArray(report.judgment_hierarchy) || report.judgment_hierarchy.length === 0) {
      reasons.push("judgment_hierarchy must be a non-empty array for required product acceptance");
    }
    if (!Array.isArray(report.evidence_paths)) {
      reasons.push("evidence_paths must be an array for required product acceptance");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

function main() {
  const repoPath = resolveRepoRoot(process.cwd());
  const reportDir = process.env.VERIFICATION_REPORT_DIR ?? "verification-report";
  const reportPath = join(repoPath, reportDir, "report.json");
  const acceptancePath = join(repoPath, reportDir, "product-acceptance.json");
  const brief = loadBrief(repoPath, reportDir);

  const expected = detectStacks(repoPath, brief);

  if (!existsSync(acceptancePath)) {
    console.error(`ship-gate: missing product acceptance report at ${acceptancePath}`);
    process.exit(1);
  }

  const acceptanceReport = readJson(acceptancePath);
  if (acceptanceReport === null) {
    console.error(`ship-gate: malformed JSON at ${acceptancePath}`);
    process.exit(1);
  }

  const acceptanceResult = validateProductAcceptanceReport(acceptanceReport);
  if (!acceptanceResult.ok) {
    console.error("ship-gate: product acceptance gate FAILED.");
    for (const reason of acceptanceResult.reasons) {
      console.error(`ship-gate:   - ${reason}`);
    }
    process.exit(1);
  }

  if (expected.length === 0) {
    console.log("ship-gate: product acceptance gate PASSED; no stacks detected for this repo");
    process.exit(0);
  }

  if (!existsSync(reportPath)) {
    console.error(`ship-gate: missing verification report at ${reportPath}`);
    console.error(`ship-gate: expected stacks: ${expected.join(", ")}`);
    process.exit(1);
  }

  const report = readJson(reportPath);
  if (report === null) {
    console.error(`ship-gate: malformed JSON at ${reportPath}`);
    process.exit(1);
  }

  const result = validateReport(report, expected);
  if (!result.ok) {
    console.error(`ship-gate: gate FAILED. Expected stacks: ${expected.join(", ")}`);
    for (const reason of result.reasons) {
      console.error(`ship-gate:   - ${reason}`);
    }
    process.exit(1);
  }

  console.log(`ship-gate: gate PASSED. Stacks exercised: ${expected.join(", ")}`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
