#!/usr/bin/env node
// ship-gate.mjs — invoked by /ship before `gh pr create`.
//
// Scans tracked files for machine-specific local paths, reads
// ${VERIFICATION_REPORT_DIR:-verification-report}/proof-contract.json,
// proof-result.json, and report.json, independently re-derives the expected
// stack set from the repo, and exits non-zero if the proof contract/result is
// missing, the proof result downgrades the contracted tier, any expected stack
// is absent from stack_minimums_exercised, the report is missing/malformed, or
// outcome is not PASS.
//
// Per docs/decisions/2026-05-03-self-testing-loop-architecture.md.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const REQUIRED_ENTRY_KEYS = ["stack", "criterion", "tool", "evidence_path", "exercised_at"];
const ACCEPTANCE_OUTCOMES = new Set(["PASS", "NEEDS_ITERATION", "BLOCKED_BY_SPEC", "NOT_REQUIRED"]);
const PROOF_TIERS = new Set(["T0", "T1", "T2", "T3", "T4"]);
const PROOF_TIER_RANK = new Map([...PROOF_TIERS].map((tier, index) => [tier, index]));
const PROOF_OUTCOMES = new Set(["PASS", "BLOCKED_REAL_ENV"]);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
// Default freshness window for product-acceptance reports. /ship's gate fails a report whose
// `reviewed_at` is older than this window — staleness was the contract the decision/plan
// promised but the original validator only checked string-non-empty.
const ACCEPTANCE_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
// Skew tolerance for clock differences between the machine that wrote `reviewed_at` and
// the machine running the gate (CI vs local laptop).
const ACCEPTANCE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const PROOF_RESULT_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const PROOF_RESULT_FUTURE_SKEW_MS = 5 * 60 * 1000;
export const STACK_ALIASES = new Map([
  ["bb-browser-escape-hatch", "browser-kit-escape-hatch"]
]);

const WEB_FRAMEWORK_CONFIGS = [
  "next.config.js", "next.config.mjs", "next.config.ts",
  "vite.config.js", "vite.config.mjs", "vite.config.ts",
  "astro.config.js", "astro.config.mjs", "astro.config.ts"
];

const REAL_SESSION_PATTERN = /real[- ]session|logged[- ]in|shared[- ]tab|user'?s chrome/i;

// Lookbehind `(?<![A-Za-z0-9])` rejects URL-embedded matches like
// `https://example.com/Users/alice/...` while still accepting boundary-led
// real home paths (preceded by whitespace, quote, comma, etc.).
export const LOCAL_PATH_DENYLIST = [
  {
    label: "macOS user home path",
    pattern: /(?<![A-Za-z0-9])\/Users\/[A-Za-z0-9._-]+\/[^\s`"')\]<>{}]+/
  },
  {
    label: "Linux user home path",
    pattern: /(?<![A-Za-z0-9])\/home\/[A-Za-z0-9._-]+\/[^\s`"')\]<>{}]+/
  },
  {
    label: "Windows user profile path",
    pattern: /(?<![A-Za-z0-9])[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\[^\s`"')\]<>{}]+/
  },
  {
    label: "0th Canvas checkout fallback",
    pattern: /(?:\$\{HOME\}|\$HOME|~)\/0thcanvas(?:\/[^\s`"')\]<>{}]+)?/
  }
];

// readJson distinguishes "missing file" (returns null) from "exists but
// malformed" (throws). Ship-gate must FAIL CLOSED on malformed JSON: a
// truncated package.json must not silently empty the detected-stack set.
function readJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    throw new Error(`ship-gate: ${filePath} exists but is not valid JSON: ${err.message}`);
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
  // The brief drives browser-kit-escape-hatch detection. /build writes
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
    stacks.add("browser-kit-escape-hatch");
  }

  return [...stacks];
}

function canonicalStack(stack) {
  return STACK_ALIASES.get(stack) ?? stack;
}

export function validateReport(report, expectedStacks) {
  const reasons = [];
  const canonicalExpectedStacks = expectedStacks.map(canonicalStack);

  if (canonicalExpectedStacks.length === 0) {
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
    if (entry.stack) exercisedStacks.add(canonicalStack(entry.stack));
  }

  for (const stack of canonicalExpectedStacks) {
    if (!exercisedStacks.has(stack)) {
      reasons.push(`expected stack '${stack}' not present in stack_minimums_exercised`);
    }
  }

  if (report.outcome !== "PASS") {
    reasons.push(`outcome is '${report.outcome}', not 'PASS'`);
  }

  return { ok: reasons.length === 0, reasons };
}

export function findLocalPathLeaksInText(filePath, text, denylist = LOCAL_PATH_DENYLIST) {
  const leaks = [];
  const lines = text.split(/\r?\n/);

  // Leak records intentionally omit `snippet`/full-line content. The matched
  // path (`match`) plus file:line is sufficient diagnostic context; echoing
  // arbitrary line content can re-expose secrets that share a line with the
  // local path (defense-in-depth for accidental secret commits).
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const entry of denylist) {
      const match = line.match(entry.pattern);
      if (!match) continue;
      leaks.push({
        file: filePath,
        line: index + 1,
        label: entry.label,
        match: match[0]
      });
    }
  }

  return leaks;
}

export function scanTrackedFilesForLocalPathLeaks(repoPath) {
  // Distinguish "not a git repo" (legitimately nothing tracked to scan) from
  // "git command failed for some other reason inside a real repo" (must fail
  // closed, never silently return [] and let leaks slip through).
  if (!existsSync(join(repoPath, ".git"))) {
    return [];
  }

  let output;
  try {
    output = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
  } catch (err) {
    throw new Error(
      `ship-gate: git ls-files failed inside ${repoPath}: ${err.stderr?.toString().trim() || err.message}`
    );
  }

  const leaks = [];
  const files = output.split("\0").filter(Boolean);
  for (const file of files) {
    const filePath = join(repoPath, file);
    if (!existsSync(filePath)) continue;

    let text;
    try {
      text = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;

    leaks.push(...findLocalPathLeaksInText(file, text));
  }

  return leaks;
}

export function listTrackedVerificationArtifacts(repoPath, reportDir) {
  if (!existsSync(join(repoPath, ".git"))) {
    return [];
  }

  const normalizedReportDir = String(reportDir ?? "")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
  if (!normalizedReportDir || normalizedReportDir === "." || normalizedReportDir.includes("..")) {
    throw new Error(`ship-gate: unsafe verification report directory '${reportDir}'`);
  }

  let output;
  try {
    output = execFileSync("git", ["ls-files", "-z", "--", normalizedReportDir], {
      cwd: repoPath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
  } catch (err) {
    throw new Error(
      `ship-gate: git ls-files failed inside ${repoPath}: ${err.stderr?.toString().trim() || err.message}`
    );
  }

  return output
    .split("\0")
    .filter(Boolean)
    .filter((file) => file === normalizedReportDir || file.startsWith(`${normalizedReportDir}/`));
}

export function validateTrackedVerificationArtifacts(repoPath, reportDir) {
  const trackedFiles = listTrackedVerificationArtifacts(repoPath, reportDir);
  if (trackedFiles.length === 0) {
    return { ok: true, reasons: [] };
  }

  const reasons = trackedFiles.slice(0, 20).map((file) => `${file} is tracked`);
  if (trackedFiles.length > 20) {
    reasons.push(`... ${trackedFiles.length - 20} more tracked verification artifacts`);
  }
  reasons.push(
    `${reportDir}/ is local ship-gate evidence, not source; keep it ignored and summarize durable evidence in the PR body, docs, or memory`
  );

  return { ok: false, reasons };
}

export function validateProductAcceptanceReport(report, options = {}) {
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

  // Freshness: `reviewed_at` must be a parseable ISO timestamp, must not be in the future
  // (beyond clock skew), and must be within the freshness window of `now`. The decision
  // record at docs/decisions/2026-05-10-product-acceptance-loop.md promises that ship
  // checks evidence "presence, freshness, and outcome"; this is the freshness check.
  if (typeof report.reviewed_at !== "string" || report.reviewed_at.trim() === "") {
    reasons.push("reviewed_at must be a non-empty ISO timestamp string");
  } else if (!ISO_TIMESTAMP_PATTERN.test(report.reviewed_at)) {
    reasons.push(
      `reviewed_at '${report.reviewed_at}' is not a parseable ISO timestamp; reviewed_at must be an ISO timestamp like 2026-05-10T20:00:00.000Z`
    );
  } else {
    const reviewedAt = new Date(report.reviewed_at);
    if (Number.isNaN(reviewedAt.getTime())) {
      reasons.push(`reviewed_at '${report.reviewed_at}' is not a parseable ISO timestamp`);
    } else {
      const now = options.now ?? new Date();
      const ageMs = now.getTime() - reviewedAt.getTime();
      const freshWindowMs = options.freshWindowMs ?? ACCEPTANCE_FRESH_WINDOW_MS;
      const futureSkewMs = options.futureSkewMs ?? ACCEPTANCE_FUTURE_SKEW_MS;
      if (ageMs < -futureSkewMs) {
        reasons.push(`reviewed_at '${report.reviewed_at}' is in the future relative to ${now.toISOString()}`);
      } else if (ageMs > freshWindowMs) {
        const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
        const windowHours = (freshWindowMs / (60 * 60 * 1000)).toFixed(1);
        reasons.push(`reviewed_at '${report.reviewed_at}' is ${ageHours}h old, exceeds freshness window of ${windowHours}h`);
      }
    }
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
    } else if (report.evidence_paths.length === 0) {
      // The PR's central thesis is "if the claim is visual, the evidence must be visual";
      // an empty evidence_paths defeats it. Required acceptance must cite at least one
      // concrete piece of evidence (screenshot, verifier dossier, browser note, etc.).
      reasons.push("evidence_paths must be non-empty for required product acceptance");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

function validateNonEmptyStringArray(value, fieldName, reasons) {
  if (!Array.isArray(value) || value.length === 0) {
    reasons.push(`${fieldName} must be a non-empty array`);
    return;
  }

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || entry.trim() === "") {
      reasons.push(`${fieldName}[${index}] must be a non-empty string`);
    }
  }
}

export function validateProofContract(report) {
  const reasons = [];

  if (!report || typeof report !== "object") {
    reasons.push("proof contract is missing or not an object");
    return { ok: false, reasons };
  }

  if (report.schema_version !== 1) {
    reasons.push("schema_version must be 1");
  }

  if (!PROOF_TIERS.has(report.minimum_proof_tier)) {
    reasons.push(`minimum_proof_tier must be one of ${[...PROOF_TIERS].join(", ")}`);
  }

  if (typeof report.selected_rationale !== "string" || report.selected_rationale.trim() === "") {
    reasons.push("selected_rationale must be a non-empty string");
  }

  validateNonEmptyStringArray(report.required_evidence, "required_evidence", reasons);

  if (!Array.isArray(report.real_env_risks)) {
    reasons.push("real_env_risks must be an array");
  } else {
    for (const [index, entry] of report.real_env_risks.entries()) {
      if (typeof entry !== "string" || entry.trim() === "") {
        reasons.push(`real_env_risks[${index}] must be a non-empty string`);
      }
    }
  }

  if (typeof report.created_at !== "string" || report.created_at.trim() === "") {
    reasons.push("created_at must be a non-empty ISO timestamp string");
  } else if (!ISO_TIMESTAMP_PATTERN.test(report.created_at)) {
    reasons.push(
      `created_at '${report.created_at}' is not a parseable ISO timestamp; created_at must be an ISO timestamp like 2026-05-10T20:00:00.000Z`
    );
  } else if (Number.isNaN(new Date(report.created_at).getTime())) {
    reasons.push(`created_at '${report.created_at}' is not a parseable ISO timestamp`);
  }

  return { ok: reasons.length === 0, reasons };
}

export function validateProofResult(report, options = {}) {
  const reasons = [];

  if (!report || typeof report !== "object") {
    reasons.push("proof result is missing or not an object");
    return { ok: false, reasons };
  }

  if (report.schema_version !== 1) {
    reasons.push("schema_version must be 1");
  }

  if (!PROOF_TIERS.has(report.minimum_proof_tier)) {
    reasons.push(`minimum_proof_tier must be one of ${[...PROOF_TIERS].join(", ")}`);
  }

  if (typeof report.selected_rationale !== "string" || report.selected_rationale.trim() === "") {
    reasons.push("selected_rationale must be a non-empty string");
  }

  validateNonEmptyStringArray(report.required_evidence, "required_evidence", reasons);

  if (!PROOF_OUTCOMES.has(report.outcome)) {
    reasons.push(`outcome must be one of ${[...PROOF_OUTCOMES].join(", ")}`);
  } else if (report.outcome !== "PASS") {
    reasons.push(`proof result outcome is '${report.outcome}', not 'PASS'`);
  }

  if (report.minimum_tier_satisfied !== true) {
    reasons.push("minimum_tier_satisfied must be true");
  }

  validateNonEmptyStringArray(report.evidence_paths, "evidence_paths", reasons);

  const contractedTier = options.minimumProofTier;
  if (contractedTier) {
    if (!PROOF_TIERS.has(contractedTier)) {
      reasons.push(`contracted minimum proof tier '${contractedTier}' is invalid`);
    } else if (PROOF_TIERS.has(report.minimum_proof_tier)) {
      const resultRank = PROOF_TIER_RANK.get(report.minimum_proof_tier);
      const contractedRank = PROOF_TIER_RANK.get(contractedTier);
      if (resultRank < contractedRank) {
        reasons.push(
          `minimum_proof_tier '${report.minimum_proof_tier}' is below contracted tier '${contractedTier}'`
        );
      }
    }
  }

  if (report.outcome === "BLOCKED_REAL_ENV") {
    if (typeof report.blocked_reason !== "string" || report.blocked_reason.trim() === "") {
      reasons.push("blocked_reason must be a non-empty string when outcome is BLOCKED_REAL_ENV");
    }
  }

  if (typeof report.checked_at !== "string" || report.checked_at.trim() === "") {
    reasons.push("checked_at must be a non-empty ISO timestamp string");
  } else if (!ISO_TIMESTAMP_PATTERN.test(report.checked_at)) {
    reasons.push(
      `checked_at '${report.checked_at}' is not a parseable ISO timestamp; checked_at must be an ISO timestamp like 2026-05-10T20:00:00.000Z`
    );
  } else {
    const checkedAt = new Date(report.checked_at);
    if (Number.isNaN(checkedAt.getTime())) {
      reasons.push(`checked_at '${report.checked_at}' is not a parseable ISO timestamp`);
    } else {
      const now = options.now ?? new Date();
      const ageMs = now.getTime() - checkedAt.getTime();
      const freshWindowMs = options.freshWindowMs ?? PROOF_RESULT_FRESH_WINDOW_MS;
      const futureSkewMs = options.futureSkewMs ?? PROOF_RESULT_FUTURE_SKEW_MS;
      if (ageMs < -futureSkewMs) {
        reasons.push(`checked_at '${report.checked_at}' is in the future relative to ${now.toISOString()}`);
      } else if (ageMs > freshWindowMs) {
        const ageHours = (ageMs / (60 * 60 * 1000)).toFixed(1);
        const windowHours = (freshWindowMs / (60 * 60 * 1000)).toFixed(1);
        reasons.push(`checked_at '${report.checked_at}' is ${ageHours}h old, exceeds freshness window of ${windowHours}h`);
      }
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export function validateCounterpartReviewEvidence(repoPath, reportDir) {
  // /build must either produce a counterpart-review.md (the actual review output) or
  // a counterpart-review.skipped file containing either the exact availability blocker or
  // an explicit risk decision that review has no evidence advantage. This keeps review
  // risk-triggered without allowing an unexplained skip to pass as clean.
  const reviewPath = join(repoPath, reportDir, "counterpart-review.md");
  const skippedPath = join(repoPath, reportDir, "counterpart-review.skipped");
  const reasons = [];

  const reviewExists = existsSync(reviewPath);
  const skippedExists = existsSync(skippedPath);

  if (reviewExists) {
    let reviewContent;
    try {
      reviewContent = readFileSync(reviewPath, "utf8");
    } catch (err) {
      reasons.push(`could not read ${reportDir}/counterpart-review.md: ${err.message}`);
      return { ok: false, reasons };
    }
    if (reviewContent.trim() === "") {
      reasons.push(
        `${reportDir}/counterpart-review.md is empty; must contain the actual counterpart review output`
      );
      return { ok: false, reasons };
    }
    return { ok: true, reasons };
  }

  if (!skippedExists) {
    reasons.push(
      `missing counterpart review evidence: expected ${reportDir}/counterpart-review.md or ${reportDir}/counterpart-review.skipped`
    );
    return { ok: false, reasons };
  }

  let skippedContent;
  try {
    skippedContent = readFileSync(skippedPath, "utf8");
  } catch (err) {
    reasons.push(`could not read ${reportDir}/counterpart-review.skipped: ${err.message}`);
    return { ok: false, reasons };
  }
  const skipReason = skippedContent.trim();
  const classifiedSkip = /(?:unavailable|quota|auth(?:entication|orization)?|network|not[_ -]?required|not needed|no\s+(?:independent\s+)?review\s+evidence advantage|disproportionate)/i;
  if (skipReason === "" || !classifiedSkip.test(skipReason)) {
    reasons.push(
      `${reportDir}/counterpart-review.skipped must contain an availability blocker or a risk decision explaining why review has no evidence advantage`
    );
    return { ok: false, reasons };
  }

  return { ok: true, reasons };
}

function main() {
  const repoPath = resolveRepoRoot(process.cwd());
  const reportDir = process.env.VERIFICATION_REPORT_DIR ?? "verification-report";
  const reportPath = join(repoPath, reportDir, "report.json");
  const acceptancePath = join(repoPath, reportDir, "product-acceptance.json");
  const proofContractPath = join(repoPath, reportDir, "proof-contract.json");
  const proofResultPath = join(repoPath, reportDir, "proof-result.json");
  const brief = loadBrief(repoPath, reportDir);

  const localPathLeaks = scanTrackedFilesForLocalPathLeaks(repoPath);
  if (localPathLeaks.length > 0) {
    console.error("ship-gate: local path check FAILED. Replace machine-specific paths with env/config contracts.");
    for (const leak of localPathLeaks.slice(0, 20)) {
      console.error(
        `ship-gate:   - ${leak.file}:${leak.line} ${leak.label}: ${leak.match}`
      );
    }
    if (localPathLeaks.length > 20) {
      console.error(`ship-gate:   - ... ${localPathLeaks.length - 20} more`);
    }
    process.exit(1);
  }

  const trackedVerificationArtifacts = validateTrackedVerificationArtifacts(repoPath, reportDir);
  if (!trackedVerificationArtifacts.ok) {
    console.error("ship-gate: tracked verification artifact gate FAILED.");
    for (const reason of trackedVerificationArtifacts.reasons) {
      console.error(`ship-gate:   - ${reason}`);
    }
    process.exit(1);
  }

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

  const acceptanceOptions = {};
  const freshWindowEnv = process.env.PRODUCT_ACCEPTANCE_FRESH_WINDOW_HOURS;
  if (freshWindowEnv) {
    const hours = Number(freshWindowEnv);
    if (Number.isFinite(hours) && hours > 0) {
      acceptanceOptions.freshWindowMs = hours * 60 * 60 * 1000;
    }
  }
  const acceptanceResult = validateProductAcceptanceReport(acceptanceReport, acceptanceOptions);
  if (!acceptanceResult.ok) {
    console.error("ship-gate: product acceptance gate FAILED.");
    for (const reason of acceptanceResult.reasons) {
      console.error(`ship-gate:   - ${reason}`);
    }
    process.exit(1);
  }

  const counterpartResult = validateCounterpartReviewEvidence(repoPath, reportDir);
  if (!counterpartResult.ok) {
    console.error("ship-gate: counterpart review evidence gate FAILED.");
    for (const reason of counterpartResult.reasons) {
      console.error(`ship-gate:   - ${reason}`);
    }
    process.exit(1);
  }

  if (!existsSync(proofContractPath)) {
    console.error(`ship-gate: missing proof contract at ${proofContractPath}`);
    process.exit(1);
  }

  const proofContractReport = readJson(proofContractPath);
  if (proofContractReport === null) {
    console.error(`ship-gate: malformed JSON at ${proofContractPath}`);
    process.exit(1);
  }

  const proofContract = validateProofContract(proofContractReport);
  if (!proofContract.ok) {
    console.error("ship-gate: proof contract gate FAILED.");
    for (const reason of proofContract.reasons) {
      console.error(`ship-gate:   - ${reason}`);
    }
    process.exit(1);
  }

  if (!existsSync(proofResultPath)) {
    console.error(`ship-gate: missing proof result at ${proofResultPath}`);
    process.exit(1);
  }

  const proofResultReport = readJson(proofResultPath);
  if (proofResultReport === null) {
    console.error(`ship-gate: malformed JSON at ${proofResultPath}`);
    process.exit(1);
  }

  const proofOptions = {};
  const proofFreshWindowEnv = process.env.PROOF_RESULT_FRESH_WINDOW_HOURS;
  if (proofFreshWindowEnv) {
    const hours = Number(proofFreshWindowEnv);
    if (Number.isFinite(hours) && hours > 0) {
      proofOptions.freshWindowMs = hours * 60 * 60 * 1000;
    }
  }
  proofOptions.minimumProofTier = proofContractReport.minimum_proof_tier;
  const proofResult = validateProofResult(proofResultReport, proofOptions);
  if (!proofResult.ok) {
    console.error("ship-gate: proof result gate FAILED.");
    for (const reason of proofResult.reasons) {
      console.error(`ship-gate:   - ${reason}`);
    }
    process.exit(1);
  }

  if (expected.length === 0) {
    console.log("ship-gate: product acceptance and proof gates PASSED; no stacks detected for this repo");
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

import { isInvokedAsCli } from "./lib/cli.mjs";

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
