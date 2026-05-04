import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "..", "scripts", "failure-dossier-runner.mjs");

function tempReportDir() {
  return mkdtempSync(path.join(tmpdir(), "0th-dossier-runner-"));
}

function runRunner(args, reportDir) {
  return spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    cwd: __dirname,
    env: {
      ...process.env,
      VERIFICATION_REPORT_DIR: reportDir,
      OTH_DOSSIER_STDIO_LIMIT: "80"
    },
    timeout: 10000
  });
}

function dossierPath(reportDir, runId) {
  return path.join(reportDir, "runs", runId, "dossier.json");
}

test("successful commands write no failure dossier", () => {
  const reportDir = tempReportDir();
  const result = runRunner(["--run-id", "success-1", "--", "node", "-e", "console.log('ok')"], reportDir);

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "ok\n");
  assert.equal(existsSync(dossierPath(reportDir, "success-1")), false);
});

test("failing commands write an atomic run-scoped dossier", () => {
  const reportDir = tempReportDir();
  const result = runRunner([
    "--run-id",
    "failure-1",
    "--",
    "node",
    "-e",
    "console.log('visible stdout'); console.error('visible stderr'); process.exit(7)"
  ], reportDir);

  assert.equal(result.status, 7);
  assert.equal(result.stdout, "visible stdout\n");
  assert.equal(result.stderr, "visible stderr\n");

  const dossierFile = dossierPath(reportDir, "failure-1");
  assert.equal(existsSync(dossierFile), true);

  const dossier = JSON.parse(readFileSync(dossierFile, "utf8"));
  assert.equal(dossier.version, 1);
  assert.equal(dossier.status, "complete");
  assert.equal(dossier.run_id, "failure-1");
  assert.equal(dossier.exit_code, 7);
  assert.equal(dossier.cwd, __dirname);
  assert.deepEqual(dossier.command, ["node", "-e", "console.log('visible stdout'); console.error('visible stderr'); process.exit(7)"]);
  assert.match(dossier.started_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(dossier.finished_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(dossier.stdout.text, "visible stdout\n");
  assert.equal(dossier.stderr.text, "visible stderr\n");
  assert.equal(dossier.stdout.truncated, false);
  assert.equal(dossier.stderr.truncated, false);

  const runDirEntries = readdirSync(path.dirname(dossierFile));
  assert.deepEqual(runDirEntries, ["dossier.json"]);
});

test("dossier stdio is truncated without hiding that truncation happened", () => {
  const reportDir = tempReportDir();
  const longText = "x".repeat(120);
  const result = runRunner([
    "--run-id",
    "truncated-1",
    "--",
    "node",
    "-e",
    `console.log('${longText}'); process.exit(2)`
  ], reportDir);

  assert.equal(result.status, 2);
  const dossier = JSON.parse(readFileSync(dossierPath(reportDir, "truncated-1"), "utf8"));
  assert.equal(dossier.stdout.truncated, true);
  assert.equal(dossier.stdout.text.length, 80);
  assert.equal(dossier.stderr.truncated, false);
});

test("unsafe run ids are rejected before running the command", () => {
  const reportDir = tempReportDir();
  const result = runRunner(["--run-id", "../escape", "--", "node", "-e", "process.exit(9)"], reportDir);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /run-id/);
  assert.equal(existsSync(path.join(reportDir, "runs")), false);
});
