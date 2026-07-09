import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateProofContract,
  validateProofResult
} from "../scripts/ship-gate.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const shipGatePath = path.join(repoRoot, "scripts", "ship-gate.mjs");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function makeTempGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-verification-gate-"));
  spawnSync("git", ["init", "--quiet"], { cwd: dir });
  return dir;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeGateFixture(repo, proofResultOverrides = {}, reportOverrides = {}) {
  const reportDir = path.join(repo, "verification-report");
  const now = new Date().toISOString();

  writeJson(path.join(reportDir, "proof-contract.json"), {
    schema_version: 1,
    feature: "workflow gate fixture",
    minimum_proof_tier: "T2",
    selected_rationale: "User-facing runtime behavior needs browser evidence.",
    required_evidence: ["browser screenshot"],
    real_env_risks: ["browser session unavailable"],
    created_at: now
  });

  writeJson(path.join(reportDir, "proof-result.json"), {
    schema_version: 1,
    feature: "workflow gate fixture",
    minimum_proof_tier: "T2",
    selected_rationale: "User-facing runtime behavior needs browser evidence.",
    required_evidence: ["browser screenshot"],
    outcome: "PASS",
    minimum_tier_satisfied: true,
    evidence_paths: ["verification-report/browser-proof.txt"],
    checked_at: now,
    ...proofResultOverrides
  });

  writeJson(path.join(reportDir, "report.json"), {
    outcome: "PASS",
    pre_dispatch_tool_failures_reviewed: true,
    stack_minimums_exercised: [],
    ...reportOverrides
  });

  writeJson(path.join(reportDir, "product-acceptance.json"), {
    schema_version: 1,
    feature: "workflow gate fixture",
    required: false,
    required_rationale: "Mechanical fixture with no product surface.",
    outcome: "NOT_REQUIRED",
    source: { decision: null, plan: null, user_brief: "fixture" },
    judgment_hierarchy: ["repo_standards"],
    rounds: [],
    fixed_issues: [],
    deferred_items: [],
    evidence_paths: ["verification-report/browser-proof.txt"],
    reviewed_at: now
  });

  fs.writeFileSync(
    path.join(reportDir, "counterpart-review.skipped"),
    "Fixture: counterpart review not needed for temp gate test."
  );
}

test("workflow hardening reference defines stable contract keys", () => {
  const source = read("references/workflow-verification.md");

  for (const key of [
    "context_handoff",
    "proof_contract_required",
    "blocked_real_env",
    "retro_open_loop_closeout"
  ]) {
    assert.ok(source.includes(key), `workflow-verification reference should include ${key}`);
  }

  assert.match(source, /summary/);
  assert.match(source, /source pointers/);
  assert.match(source, /unresolved gaps/);
  assert.match(source, /next read targets/);
  assert.match(source, /proof-contract\.json/);
  assert.match(source, /proof-result\.json/);
  assert.match(source, /minimum_proof_tier/);
  assert.match(source, /minimum_tier_satisfied/);
});

test("core workflows link to workflow verification hardening", () => {
  for (const skillName of [
    "think",
    "plan",
    "build",
    "debug",
    "research",
    "deep-research",
    "ship",
    "retro"
  ]) {
    const source = read(`skills/${skillName}/SKILL.md`);
    assert.match(
      source,
      /\.\.\/\.\.\/references\/workflow-verification\.md/,
      `${skillName} should link to workflow-verification.md`
    );
  }
});

test("build and ship preserve proof contract requirements without schema escape hatches", () => {
  const build = read("skills/build/SKILL.md");
  const ship = read("skills/ship/SKILL.md");

  assert.match(build, /proof_contract_required/);
  assert.match(build, /ship-bound implementation work requires/);
  assert.match(build, /docs-only or\s+metadata-only changes still use a `?T0`? contract when ship-bound/);
  assert.match(build, /minimum_proof_tier/);
  assert.match(build, /minimum_tier_satisfied/);

  assert.match(ship, /proof_contract_required/);
  assert.match(ship, /proof result tier/);
  assert.match(ship, /proof contract tier/);
});

test("workflow proof contract keys are backed by ship-gate validation", () => {
  const now = new Date();
  const timestamp = now.toISOString();

  assert.equal(validateProofContract({
    schema_version: 1,
    feature: "workflow contract",
    minimum_proof_tier: "T2",
    selected_rationale: "User-facing runtime behavior needs browser evidence.",
    required_evidence: ["browser screenshot"],
    real_env_risks: ["browser session unavailable"],
    created_at: timestamp
  }).ok, true);

  const downgrade = validateProofResult({
    schema_version: 1,
    feature: "workflow contract",
    minimum_proof_tier: "T0",
    selected_rationale: "Tests passed.",
    required_evidence: ["unit tests"],
    outcome: "PASS",
    minimum_tier_satisfied: true,
    evidence_paths: ["verification-report/test-output.txt"],
    checked_at: timestamp
  }, { now, minimumProofTier: "T2" });

  assert.equal(downgrade.ok, false);
  assert.match(downgrade.reasons.join("\n"), /below contracted tier 'T2'/);

  const blocked = validateProofResult({
    schema_version: 1,
    feature: "workflow contract",
    minimum_proof_tier: "T2",
    selected_rationale: "Browser proof was required.",
    required_evidence: ["browser screenshot"],
    outcome: "BLOCKED_REAL_ENV",
    minimum_tier_satisfied: false,
    blocked_reason: "No logged-in browser session was available.",
    evidence_paths: ["verification-report/tests-only.txt"],
    checked_at: timestamp
  }, { now, minimumProofTier: "T2" });

  assert.equal(blocked.ok, false);
  assert.match(blocked.reasons.join("\n"), /BLOCKED_REAL_ENV.*not 'PASS'/);
  assert.match(blocked.reasons.join("\n"), /minimum_tier_satisfied must be true/);
});

test("workflow proof contract keys are enforced by the ship-gate CLI path", () => {
  const repo = makeTempGitRepo();
  writeGateFixture(repo, {
    minimum_proof_tier: "T0",
    selected_rationale: "Tests passed.",
    required_evidence: ["unit tests"],
    evidence_paths: ["verification-report/test-output.txt"]
  });

  const downgraded = spawnSync(process.execPath, [shipGatePath], {
    cwd: repo,
    encoding: "utf8"
  });

  assert.notEqual(downgraded.status, 0);
  assert.match(downgraded.stderr, /below contracted tier 'T2'/);

  writeGateFixture(repo);
  const satisfied = spawnSync(process.execPath, [shipGatePath], {
    cwd: repo,
    encoding: "utf8"
  });

  assert.equal(satisfied.status, 0, satisfied.stderr);
  assert.match(satisfied.stdout, /proof gates PASSED/);
});

test("workflow ship-gate CLI path preserves real stack detection and BLOCKED_REAL_ENV failures", () => {
  const repo = makeTempGitRepo();
  fs.writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({ name: "web-fixture", devDependencies: { vite: "^6.0.0" } })
  );
  fs.writeFileSync(path.join(repo, "vite.config.js"), "export default {};\n");

  writeGateFixture(repo);
  const missingStack = spawnSync(process.execPath, [shipGatePath], {
    cwd: repo,
    encoding: "utf8"
  });

  assert.notEqual(missingStack.status, 0);
  assert.match(missingStack.stderr, /expected stack 'web-app' not present/);

  const exercisedWebStack = {
    stack: "web-app",
    criterion: "loaded route hits backend and renders without console errors",
    tool: "playwright",
    evidence_path: "verification-report/browser-proof.txt",
    exercised_at: new Date().toISOString()
  };

  writeGateFixture(repo, {}, {
    stack_minimums_exercised: [exercisedWebStack]
  });
  const passingWebStack = spawnSync(process.execPath, [shipGatePath], {
    cwd: repo,
    encoding: "utf8"
  });

  assert.equal(passingWebStack.status, 0, passingWebStack.stderr);

  writeGateFixture(repo, {
    outcome: "BLOCKED_REAL_ENV",
    minimum_tier_satisfied: false,
    blocked_reason: "The real browser session was unavailable.",
    evidence_paths: ["verification-report/tests-only.txt"]
  }, {
    stack_minimums_exercised: [exercisedWebStack]
  });

  const blocked = spawnSync(process.execPath, [shipGatePath], {
    cwd: repo,
    encoding: "utf8"
  });

  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /BLOCKED_REAL_ENV.*not 'PASS'/);
  assert.match(blocked.stderr, /minimum_tier_satisfied must be true/);
});

test("research workflows use context handoffs instead of raw context accumulation", () => {
  const research = read("skills/research/SKILL.md");
  const deepResearch = read("skills/deep-research/SKILL.md");

  for (const source of [research, deepResearch]) {
    assert.match(source, /context_handoff/);
    assert.match(source, /summary/);
    assert.match(source, /source pointers/);
    assert.match(source, /unresolved gaps/);
  }

  assert.match(deepResearch, /bounded summaries/);
  assert.match(deepResearch, /raw source material/);
});

test("closeout surfaces retro and open-loop follow-through", () => {
  const build = read("skills/build/SKILL.md");
  const retro = read("skills/retro/SKILL.md");
  const claude = read("CLAUDE.md");
  const readme = read("README.md");

  for (const source of [build, retro, claude, readme]) {
    assert.match(source, /retro_open_loop_closeout/);
  }

  assert.match(build, /skipped verification/);
  assert.match(retro, /skipped verification/);
  assert.match(claude, /Workflow Verification/);
  assert.match(readme, /Workflow Verification/);
});
