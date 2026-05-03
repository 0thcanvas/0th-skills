import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectStacks, validateReport } from "../scripts/ship-gate.mjs";

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ship-gate-test-"));
}

function writePkg(dir, pkg) {
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
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

test("detectStacks: monorepo with electron and manifest matches both rows", () => {
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
      stack_minimums_exercised: [{ stack: "web-app" }]
    },
    ["web-app"]
  );
  assert.equal(result.ok, false);
  assert.match(result.reasons.join("\n"), /missing required key/);
});

test("validateReport: all expected stacks exercised plus PASS yields ok", () => {
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
  assert.equal(result.ok, true, result.reasons.join(", "));
});

test("validateReport: empty expected list passes regardless of report shape", () => {
  const result = validateReport({}, []);
  assert.equal(result.ok, true);
});
