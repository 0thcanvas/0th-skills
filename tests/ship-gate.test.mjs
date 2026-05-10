import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectStacks,
  loadBrief,
  resolveRepoRoot,
  validateCounterpartReviewEvidence,
  validateProductAcceptanceReport,
  validateReport
} from "../scripts/ship-gate.mjs";

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ship-gate-test-"));
}

function makeTempGitRepo() {
  const dir = makeTempRepo();
  execFileSync("git", ["init", "--quiet"], { cwd: dir, stdio: "ignore" });
  return dir;
}

function writePkg(dir, pkg) {
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}

function writeProductAcceptance(dir, payload = {}) {
  fs.mkdirSync(path.join(dir, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "verification-report", "product-acceptance.json"),
    JSON.stringify({
      schema_version: 1,
      required: false,
      required_rationale: "Mechanical test fixture with no product surface.",
      outcome: "NOT_REQUIRED",
      // Use `now` so fixtures stay inside the 24h freshness window across runs.
      reviewed_at: new Date().toISOString(),
      ...payload
    })
  );
}

function writeCounterpartReviewSkipped(dir, reason = "Test fixture: counterpart unavailable for the mock environment.") {
  fs.mkdirSync(path.join(dir, "verification-report"), { recursive: true });
  fs.writeFileSync(path.join(dir, "verification-report", "counterpart-review.skipped"), reason);
}

test("detectStacks: empty repo yields no stacks", () => {
  const repo = makeTempRepo();
  assert.deepEqual(detectStacks(repo), []);
});

test("detectStacks: package.json with electron dep yields electron-desktop", () => {
  const repo = makeTempRepo();
  writePkg(repo, { name: "x", dependencies: { electron: "^31.0.0" } });
  assert.deepEqual(detectStacks(repo), ["electron-desktop"]);
});

test("detectStacks: manifest.json mv3 yields chrome-mv3-extension", () => {
  const repo = makeTempRepo();
  fs.writeFileSync(
    path.join(repo, "manifest.json"),
    JSON.stringify({ manifest_version: 3, name: "ext" })
  );
  assert.deepEqual(detectStacks(repo), ["chrome-mv3-extension"]);
});

test("detectStacks: vite.config plus no electron yields web-app", () => {
  const repo = makeTempRepo();
  fs.writeFileSync(path.join(repo, "vite.config.ts"), "");
  writePkg(repo, { name: "x" });
  assert.deepEqual(detectStacks(repo), ["web-app"]);
});

test("detectStacks: vite.config plus electron yields electron-desktop only", () => {
  const repo = makeTempRepo();
  fs.writeFileSync(path.join(repo, "vite.config.ts"), "");
  writePkg(repo, { name: "x", devDependencies: { electron: "^31.0.0" } });
  assert.deepEqual(detectStacks(repo), ["electron-desktop"]);
});

test("detectStacks: package.json bin without UI deps yields cli", () => {
  const repo = makeTempRepo();
  writePkg(repo, { name: "x", bin: { x: "./bin.js" } });
  assert.deepEqual(detectStacks(repo), ["cli"]);
});

test("detectStacks: Dockerfile without UI yields service", () => {
  const repo = makeTempRepo();
  fs.writeFileSync(path.join(repo, "Dockerfile"), "FROM node:24");
  writePkg(repo, { name: "x" });
  assert.deepEqual(detectStacks(repo), ["service"]);
});

test("detectStacks: brief mentioning logged-in yields bb-browser-escape-hatch", () => {
  const repo = makeTempRepo();
  const stacks = detectStacks(repo, "verify the logged-in dashboard flow");
  assert.ok(stacks.includes("bb-browser-escape-hatch"));
});

test("resolveRepoRoot: returns git toplevel when invoked from a subdir", () => {
  const repo = makeTempGitRepo();
  const sub = path.join(repo, "packages", "deep", "nested");
  fs.mkdirSync(sub, { recursive: true });
  // realpathSync to handle macOS /private/var vs /var symlink
  assert.equal(fs.realpathSync(resolveRepoRoot(sub)), fs.realpathSync(repo));
});

test("resolveRepoRoot: falls back to cwd when not in a git repo", () => {
  const dir = makeTempRepo();
  assert.equal(resolveRepoRoot(dir), dir);
});

test("loadBrief: returns empty string when no brief file or env var", () => {
  const repo = makeTempRepo();
  delete process.env.SHIP_GATE_BRIEF;
  assert.equal(loadBrief(repo, "verification-report"), "");
});

test("loadBrief: reads verification-report/brief.txt when present", () => {
  const repo = makeTempRepo();
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "verification-report", "brief.txt"),
    "verify the logged-in dashboard flow"
  );
  delete process.env.SHIP_GATE_BRIEF;
  assert.match(loadBrief(repo, "verification-report"), /logged-in dashboard/);
});

test("loadBrief: SHIP_GATE_BRIEF env var overrides the file", () => {
  const repo = makeTempRepo();
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "verification-report", "brief.txt"),
    "from-file"
  );
  process.env.SHIP_GATE_BRIEF = "from-env";
  try {
    assert.equal(loadBrief(repo, "verification-report"), "from-env");
  } finally {
    delete process.env.SHIP_GATE_BRIEF;
  }
});

test("detectStacks: brief.txt with logged-in trigger drives bb-browser-escape-hatch (end-to-end via loadBrief)", () => {
  const repo = makeTempRepo();
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "verification-report", "brief.txt"),
    "verify shared-tab state on the user's Chrome profile"
  );
  delete process.env.SHIP_GATE_BRIEF;
  const brief = loadBrief(repo, "verification-report");
  const stacks = detectStacks(repo, brief);
  assert.ok(
    stacks.includes("bb-browser-escape-hatch"),
    `expected bb-browser-escape-hatch in detected stacks, got ${JSON.stringify(stacks)}`
  );
});

test("detectStacks (subdir invocation via CLI): script run from a deep subdir of an electron repo still detects electron-desktop", () => {
  const repo = makeTempGitRepo();
  writePkg(repo, { name: "x", dependencies: { electron: "^31" } });
  const sub = path.join(repo, "src", "renderer");
  fs.mkdirSync(sub, { recursive: true });
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  writeProductAcceptance(repo);
  writeCounterpartReviewSkipped(repo);
  fs.writeFileSync(
    path.join(repo, "verification-report", "report.json"),
    JSON.stringify({
      outcome: "PASS",
      pre_dispatch_tool_failures_reviewed: true,
      stack_minimums_exercised: [
        {
          stack: "electron-desktop",
          criterion: "renderer invoked window.api.x via contextBridge",
          tool: "playwright-electron",
          evidence_path: "verification-report/dossier.json",
          exercised_at: "2026-05-03T12:00:00Z"
        }
      ]
    })
  );
  const scriptPath = path.resolve("scripts/ship-gate.mjs");
  let out;
  let exitCode = 0;
  try {
    out = execFileSync("node", [scriptPath], {
      cwd: sub,
      encoding: "utf8",
      env: { ...process.env, SHIP_GATE_BRIEF: "" }
    });
  } catch (e) {
    exitCode = e.status;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  assert.equal(exitCode, 0, `expected exit 0 from subdir invocation, got ${exitCode}: ${out}`);
  assert.match(out, /gate PASSED.*electron-desktop/);
});

test("detectStacks: flat multi-match (electron + manifest at root) matches both rows", () => {
  const repo = makeTempRepo();
  fs.writeFileSync(
    path.join(repo, "manifest.json"),
    JSON.stringify({ manifest_version: 3 })
  );
  writePkg(repo, {
    name: "x",
    dependencies: { electron: "^31" },
    bin: { x: "./bin.js" }
  });
  const stacks = detectStacks(repo);
  assert.ok(stacks.includes("electron-desktop"));
  assert.ok(stacks.includes("chrome-mv3-extension"));
  // cli excluded because UI deps present
  assert.ok(!stacks.includes("cli"));
});

test("validateReport: missing report fails", () => {
  const result = validateReport(null, ["web-app"]);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /missing|not an object/i);
});

test("validateReport: missing stack_minimums_exercised array fails", () => {
  const result = validateReport({ outcome: "PASS" }, ["web-app"]);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /stack_minimums_exercised/);
});

test("validateReport: expected stack absent from exercised list fails", () => {
  const result = validateReport(
    { outcome: "PASS", stack_minimums_exercised: [] },
    ["web-app"]
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /web-app.*not present/);
});

test("validateReport: outcome other than PASS fails when stacks expected", () => {
  const result = validateReport(
    {
      outcome: "BLOCKED",
      pre_dispatch_tool_failures_reviewed: true,
      stack_minimums_exercised: [
        {
          stack: "web-app",
          criterion: "x",
          tool: "playwright",
          evidence_path: "y",
          exercised_at: "z"
        }
      ]
    },
    ["web-app"]
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /BLOCKED.*not.*PASS/i);
});

test("validateReport: malformed exercised entry (missing required key) fails", () => {
  const result = validateReport(
    {
      outcome: "PASS",
      pre_dispatch_tool_failures_reviewed: true,
      stack_minimums_exercised: [{ stack: "web-app" }]
    },
    ["web-app"]
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /missing required key/);
});

test("validateReport: missing pre_dispatch_tool_failures_reviewed fails when stacks expected", () => {
  const result = validateReport(
    {
      outcome: "PASS",
      stack_minimums_exercised: [
        {
          stack: "web-app",
          criterion: "loaded route, backend hit, no console errors",
          tool: "playwright",
          evidence_path: "verification-report/dossier.json",
          exercised_at: "2026-05-03T12:00:00Z"
        }
      ]
    },
    ["web-app"]
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /pre_dispatch_tool_failures_reviewed/);
});

test("validateReport: all expected stacks exercised plus PASS yields ok", () => {
  const result = validateReport(
    {
      outcome: "PASS",
      pre_dispatch_tool_failures_reviewed: true,
      stack_minimums_exercised: [
        {
          stack: "web-app",
          criterion: "loaded route, backend hit, no console errors",
          tool: "playwright",
          evidence_path: "verification-report/dossier.json",
          exercised_at: "2026-05-03T12:00:00Z"
        }
      ]
    },
    ["web-app"]
  );
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateReport: empty expected list passes regardless of report shape", () => {
  const result = validateReport({}, []);
  assert.equal(result.ok, true);
});

test("validateProductAcceptanceReport: missing report fails", () => {
  const result = validateProductAcceptanceReport(null);
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /product acceptance report is missing/);
});

test("validateProductAcceptanceReport: required acceptance must pass", () => {
  const now = new Date("2026-05-10T20:30:00.000Z");
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: true,
    required_rationale: "UI feature with learner-facing instruction copy.",
    outcome: "NEEDS_ITERATION",
    reviewed_at: "2026-05-10T20:00:00.000Z"
  }, { now });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /required product acceptance outcome is 'NEEDS_ITERATION', not 'PASS'/);
});

test("validateProductAcceptanceReport: not-required acceptance needs rationale", () => {
  const now = new Date("2026-05-10T20:30:00.000Z");
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "",
    outcome: "NOT_REQUIRED",
    reviewed_at: "2026-05-10T20:00:00.000Z"
  }, { now });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /required_rationale/);
});

test("validateProductAcceptanceReport: valid not-required report passes", () => {
  const now = new Date("2026-05-10T20:30:00.000Z");
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "Documentation-only cleanup with no product surface.",
    outcome: "NOT_REQUIRED",
    reviewed_at: "2026-05-10T20:00:00.000Z"
  }, { now });
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateProductAcceptanceReport: rejects unparseable reviewed_at", () => {
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "Documentation-only cleanup.",
    outcome: "NOT_REQUIRED",
    reviewed_at: "yesterday"
  });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /reviewed_at 'yesterday' is not a parseable ISO timestamp/);
});

test("validateProductAcceptanceReport: rejects non-ISO reviewed_at strings even when Node can parse them", () => {
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "Documentation-only cleanup.",
    outcome: "NOT_REQUIRED",
    reviewed_at: "May 10 2026 20:00:00 GMT"
  }, { now: new Date("2026-05-10T20:30:00.000Z") });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /reviewed_at must be an ISO timestamp/);
});

test("validateProductAcceptanceReport: rejects stale reviewed_at outside freshness window", () => {
  const now = new Date("2026-05-12T00:00:00.000Z");
  const reviewedAt = "2026-05-10T20:00:00.000Z"; // ~28h before `now`
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "Documentation-only cleanup.",
    outcome: "NOT_REQUIRED",
    reviewed_at: reviewedAt
  }, { now });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /reviewed_at .* is .*h old, exceeds freshness window/);
});

test("validateProductAcceptanceReport: rejects reviewed_at in the future beyond skew", () => {
  const now = new Date("2026-05-10T20:00:00.000Z");
  const reviewedAt = "2026-05-10T21:00:00.000Z"; // 1h in the future, well beyond 5min skew
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "Documentation-only cleanup.",
    outcome: "NOT_REQUIRED",
    reviewed_at: reviewedAt
  }, { now });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /is in the future/);
});

test("validateProductAcceptanceReport: accepts reviewed_at within future-skew tolerance", () => {
  const now = new Date("2026-05-10T20:00:00.000Z");
  // 2 minutes in the future — clock skew between writer and gate machine.
  const reviewedAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "Documentation-only cleanup.",
    outcome: "NOT_REQUIRED",
    reviewed_at: reviewedAt
  }, { now });
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateProductAcceptanceReport: freshWindowMs option overrides default 24h window", () => {
  const now = new Date("2026-05-10T20:00:00.000Z");
  // 48h before `now` — outside the default 24h window but inside a 72h window.
  const reviewedAt = "2026-05-08T20:00:00.000Z";
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: false,
    required_rationale: "Documentation-only cleanup.",
    outcome: "NOT_REQUIRED",
    reviewed_at: reviewedAt
  }, { now, freshWindowMs: 72 * 60 * 60 * 1000 });
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateCounterpartReviewEvidence: fails when neither review nor skipped file exists", () => {
  const repo = makeTempRepo();
  const result = validateCounterpartReviewEvidence(repo, "verification-report");
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /missing counterpart review evidence/);
});

test("validateCounterpartReviewEvidence: passes when counterpart-review.md exists", () => {
  const repo = makeTempRepo();
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "verification-report", "counterpart-review.md"),
    "COUNTERPART REVIEW: code\n\nBlockers: none\nOverall: clean."
  );
  const result = validateCounterpartReviewEvidence(repo, "verification-report");
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateCounterpartReviewEvidence: fails when counterpart-review.md is empty", () => {
  const repo = makeTempRepo();
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(path.join(repo, "verification-report", "counterpart-review.md"), " \n ");
  const result = validateCounterpartReviewEvidence(repo, "verification-report");
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /counterpart-review\.md is empty/);
});

test("validateCounterpartReviewEvidence: review output wins over a stale skipped marker", () => {
  const repo = makeTempRepo();
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "verification-report", "counterpart-review.md"),
    "COUNTERPART REVIEW: code\n\nBlockers: none\nOverall: clean."
  );
  fs.writeFileSync(path.join(repo, "verification-report", "counterpart-review.skipped"), "   \n  ");
  const result = validateCounterpartReviewEvidence(repo, "verification-report");
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateCounterpartReviewEvidence: passes when counterpart-review.skipped has a reason", () => {
  const repo = makeTempRepo();
  writeCounterpartReviewSkipped(repo, "quota exhausted on 2026-05-10");
  const result = validateCounterpartReviewEvidence(repo, "verification-report");
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateCounterpartReviewEvidence: fails when counterpart-review.skipped is empty", () => {
  const repo = makeTempRepo();
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(path.join(repo, "verification-report", "counterpart-review.skipped"), "   \n  ");
  const result = validateCounterpartReviewEvidence(repo, "verification-report");
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /must contain the exact unavailable\/quota\/auth\/network reason/);
});

test("validateProductAcceptanceReport: required acceptance with empty evidence_paths fails", () => {
  const now = new Date("2026-05-10T20:30:00.000Z");
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    required: true,
    required_rationale: "UI feature with learner-facing instruction copy.",
    outcome: "PASS",
    reviewed_at: "2026-05-10T20:00:00.000Z",
    source: { decision: "docs/decisions/x.md", plan: "docs/plans/x.md" },
    judgment_hierarchy: ["decision_record"],
    evidence_paths: []
  }, { now });
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /evidence_paths must be non-empty for required product acceptance/);
});

test("validateProductAcceptanceReport: required acceptance with PASS + full payload passes", () => {
  const now = new Date("2026-05-10T20:30:00.000Z");
  const result = validateProductAcceptanceReport({
    schema_version: 1,
    feature: "learner onboarding",
    required: true,
    required_rationale: "User-facing onboarding flow with copy and pedagogy review.",
    source: {
      decision: "docs/decisions/2026-05-10-product-acceptance-loop.md",
      plan: "docs/plans/2026-05-10-product-acceptance-loop.md",
      user_brief: "Learner sees a 3-step welcome before first lesson."
    },
    judgment_hierarchy: ["decision_record", "plan_acceptance_criteria", "explicit_user_brief", "repo_standards"],
    outcome: "PASS",
    rounds: [],
    fixed_issues: [],
    deferred_items: [],
    evidence_paths: ["verification-report/screenshots/onboarding-step-1.png"],
    reviewed_at: "2026-05-10T20:00:00.000Z"
  }, { now });
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("ship-gate end-to-end: required:true PASS happy path exits 0", () => {
  // The previously-missing test for the most consequential branch: a real shipping PR
  // with a fully-required acceptance report. If a future refactor breaks this path,
  // every shipping PR breaks — and we want to know.
  const repo = makeTempGitRepo();
  writePkg(repo, { name: "x", dependencies: { electron: "^31" } });
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "verification-report", "product-acceptance.json"),
    JSON.stringify({
      schema_version: 1,
      feature: "learner onboarding",
      required: true,
      required_rationale: "User-facing onboarding with copy and pedagogy review.",
      source: {
        decision: "docs/decisions/2026-05-10-product-acceptance-loop.md",
        plan: "docs/plans/2026-05-10-product-acceptance-loop.md",
        user_brief: null
      },
      judgment_hierarchy: ["decision_record", "plan_acceptance_criteria", "explicit_user_brief", "repo_standards"],
      outcome: "PASS",
      rounds: [{ round: 1, blocker_count: 0, polish_count: 0, fixed: [] }],
      fixed_issues: [],
      deferred_items: [],
      evidence_paths: ["verification-report/screenshots/onboarding-step-1.png"],
      reviewed_at: new Date().toISOString()
    })
  );
  writeCounterpartReviewSkipped(repo);
  fs.writeFileSync(
    path.join(repo, "verification-report", "report.json"),
    JSON.stringify({
      outcome: "PASS",
      pre_dispatch_tool_failures_reviewed: true,
      stack_minimums_exercised: [
        {
          stack: "electron-desktop",
          criterion: "renderer invoked window.api.x via contextBridge",
          tool: "playwright-electron",
          evidence_path: "verification-report/dossier.json",
          exercised_at: "2026-05-03T12:00:00Z"
        }
      ]
    })
  );
  const scriptPath = path.resolve("scripts/ship-gate.mjs");
  let out;
  let exitCode = 0;
  try {
    out = execFileSync("node", [scriptPath], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, SHIP_GATE_BRIEF: "" }
    });
  } catch (e) {
    exitCode = e.status;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  assert.equal(exitCode, 0, `expected exit 0 for required:true PASS happy path, got ${exitCode}: ${out}`);
  assert.match(out, /gate PASSED.*electron-desktop/);
});

test("ship-gate end-to-end: required:true with empty evidence_paths exits 1", () => {
  const repo = makeTempGitRepo();
  writePkg(repo, { name: "x", dependencies: { electron: "^31" } });
  fs.mkdirSync(path.join(repo, "verification-report"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "verification-report", "product-acceptance.json"),
    JSON.stringify({
      schema_version: 1,
      required: true,
      required_rationale: "UI feature with copy.",
      source: { decision: "x", plan: "y" },
      judgment_hierarchy: ["decision_record"],
      outcome: "PASS",
      evidence_paths: [], // empty — should be rejected
      reviewed_at: new Date().toISOString()
    })
  );
  writeCounterpartReviewSkipped(repo);
  const scriptPath = path.resolve("scripts/ship-gate.mjs");
  let out;
  let exitCode = 0;
  try {
    out = execFileSync("node", [scriptPath], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, SHIP_GATE_BRIEF: "" }
    });
  } catch (e) {
    exitCode = e.status;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  assert.equal(exitCode, 1, `expected exit 1 for empty evidence_paths, got ${exitCode}: ${out}`);
  assert.match(out, /evidence_paths must be non-empty/);
});

test("ship-gate end-to-end: fails with missing counterpart review evidence", () => {
  const repo = makeTempGitRepo();
  writePkg(repo, { name: "x", dependencies: { electron: "^31" } });
  writeProductAcceptance(repo);
  // Deliberately omit counterpart-review.{md,skipped} — gate should fail.
  fs.writeFileSync(
    path.join(repo, "verification-report", "report.json"),
    JSON.stringify({
      outcome: "PASS",
      pre_dispatch_tool_failures_reviewed: true,
      stack_minimums_exercised: [
        {
          stack: "electron-desktop",
          criterion: "renderer invoked window.api.x via contextBridge",
          tool: "playwright-electron",
          evidence_path: "verification-report/dossier.json",
          exercised_at: "2026-05-03T12:00:00Z"
        }
      ]
    })
  );
  const scriptPath = path.resolve("scripts/ship-gate.mjs");
  let out;
  let exitCode = 0;
  try {
    out = execFileSync("node", [scriptPath], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, SHIP_GATE_BRIEF: "" }
    });
  } catch (e) {
    exitCode = e.status;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  assert.equal(exitCode, 1, `expected exit 1 for missing counterpart evidence, got ${exitCode}: ${out}`);
  assert.match(out, /counterpart review evidence gate FAILED/);
});
