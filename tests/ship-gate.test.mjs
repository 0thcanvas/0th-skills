import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectStacks,
  findLocalPathLeaksInText,
  loadBrief,
  resolveRepoRoot,
  scanTrackedFilesForLocalPathLeaks,
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

test("findLocalPathLeaksInText: flags machine-specific home paths", () => {
  const macPath = `/${["Users", "mini", "0thcanvas", "skills"].join("/")}`;
  const linuxPath = `/${["home", "alice", "project", "app"].join("/")}`;
  const windowsPath = ["C:", "Users", "mini", "project"].join("\\");
  const homeFallback = "$" + "{HOME}" + "/0thcanvas/skills";
  const source = [
    `Research note: ${macPath}`,
    `Cache: ${linuxPath}`,
    `Workspace: ${windowsPath}`,
    `Fallback: ${homeFallback}`
  ].join("\n");

  const leaks = findLocalPathLeaksInText("example.md", source);

  assert.equal(leaks.length, 4);
  assert.deepEqual(
    leaks.map((leak) => leak.label),
    [
      "macOS user home path",
      "Linux user home path",
      "Windows user profile path",
      "0th Canvas checkout fallback"
    ]
  );
});

test("findLocalPathLeaksInText: allows portable path contracts", () => {
  const source = [
    'node "${OTH_SKILLS_ROOT:?Set OTH_SKILLS_ROOT}/scripts/session-preflight.mjs"',
    "${KB_ROOT}/tech/raw/research.md",
    "~/.0th/reviews",
    "$HOME/.0th/reviews",
    ".0th/memory/claims.jsonl"
  ].join("\n");

  assert.deepEqual(findLocalPathLeaksInText("example.md", source), []);
});

test("scanTrackedFilesForLocalPathLeaks: scans tracked files only", () => {
  const repo = makeTempGitRepo();
  const trackedPath = `/${["Users", "mini", "0thcanvas", "skills"].join("/")}`;
  fs.writeFileSync(path.join(repo, "tracked.md"), `bad: ${trackedPath}\n`);
  fs.writeFileSync(path.join(repo, "untracked.md"), `bad: ${trackedPath}\n`);
  execFileSync("git", ["add", "tracked.md"], { cwd: repo, stdio: "ignore" });

  const leaks = scanTrackedFilesForLocalPathLeaks(repo);

  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].file, "tracked.md");
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

test("ship-gate CLI fails on tracked local path leaks even when no stacks are detected", () => {
  const repo = makeTempGitRepo();
  const localPath = `/${["Users", "mini", "0thcanvas", "skills"].join("/")}`;
  fs.writeFileSync(path.join(repo, "decision.md"), `Research note: ${localPath}\n`);
  execFileSync("git", ["add", "decision.md"], { cwd: repo, stdio: "ignore" });

  const scriptPath = path.resolve("scripts/ship-gate.mjs");
  let out = "";
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

  assert.equal(exitCode, 1);
  assert.match(out, /local path check FAILED/);
  assert.match(out, /decision\.md:1/);
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

// -----------------------------------------------------------------------------
// Slice 1 — ship-gate safety fixes (PR #19 review)
// -----------------------------------------------------------------------------

test("ship-gate fails closed on malformed package.json (no silent stack-empty exit 0)", () => {
  const repo = makeTempGitRepo();
  // Malformed JSON that JSON.parse rejects
  fs.writeFileSync(path.join(repo, "package.json"), "{ broken json");
  execFileSync("git", ["add", "package.json"], { cwd: repo, stdio: "ignore" });

  const scriptPath = path.resolve("scripts/ship-gate.mjs");
  let out = "";
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

  assert.notEqual(exitCode, 0, "malformed package.json must NOT exit 0");
  assert.match(out, /package\.json/);
  assert.match(out, /not valid JSON|malformed|invalid/i);
});

test("ship-gate fails closed when git ls-files fails inside a git repo (not a no-op)", () => {
  // Simulate by passing a non-existent dir as repoPath after pre-asserting .git presence —
  // here we exercise the function directly with a path that has .git but git can't read.
  const dir = makeTempRepo();
  // Create a .git that is NOT a valid repository (file, not directory, with junk content)
  fs.writeFileSync(path.join(dir, ".git"), "not-a-real-gitdir");

  assert.throws(
    () => scanTrackedFilesForLocalPathLeaks(dir),
    /git ls-files|not a git repository|ship-gate/i,
    "must throw when .git exists but git command fails (fail closed)"
  );
});

test("scanTrackedFilesForLocalPathLeaks: returns [] for non-git directories (no .git present)", () => {
  const dir = makeTempRepo();
  // No .git anywhere — function should treat this as "nothing tracked to scan", not fail
  assert.deepEqual(scanTrackedFilesForLocalPathLeaks(dir), []);
});

test("findLocalPathLeaksInText: does NOT flag URLs that happen to contain /Users or /home", () => {
  // Build URL test fixtures from parts so the ship-gate's own tracked-file
  // scanner doesn't flag THIS test file as a leak source. (Same convention
  // as the bad-paths test below — fake paths must be assembled at runtime.)
  const usersAlice = "/" + ["Users", "alice", "orders"].join("/");
  const homeV1 = "/" + ["home", "v1", "data"].join("/");
  const usersProfile = "/" + ["Users", "profile", "avatar"].join("/");
  const source = [
    `GET https://example.com${usersAlice}`,
    `API_BASE_URL=https://api.example.com${homeV1}`,
    `fetch("https://service.io${usersProfile}")`
  ].join("\n");

  const leaks = findLocalPathLeaksInText("config.json", source);
  assert.deepEqual(leaks, [], `URL paths must not be flagged as home paths, got ${JSON.stringify(leaks)}`);
});

test("findLocalPathLeaksInText: still flags actual home paths in JSON/quoted contexts", () => {
  // Construct the bad paths from parts so the ship-gate's own scanner
  // doesn't catch THIS test file as containing real leaks.
  const macPath = "/" + ["Users", "alice", "project"].join("/");
  const linuxPath = "/" + ["home", "bob", "data"].join("/");
  const macComment = "/" + ["Users", "eve", "scratch"].join("/");
  const source = [
    `"workspace":"${macPath}"`,
    `cache_dir = ${linuxPath}`,
    `// ${macComment}`
  ].join("\n");

  const leaks = findLocalPathLeaksInText("file.json", source);
  assert.equal(leaks.length, 3, `expected 3 real leaks, got ${JSON.stringify(leaks)}`);
});

test("findLocalPathLeaksInText: leak records do NOT echo full line content (secret-leak defense)", () => {
  // A line where a local path shares a line with a token-shaped secret.
  // The leak record must not echo the secret.
  const fakeSecret = "sk-" + "FAKE" + "1234567890abcdefghij";
  const buildOutput = "/" + ["Users", "alice", "builds", "output.log"].join("/");
  const source = `API_KEY=${fakeSecret} build_output=${buildOutput}`;

  const leaks = findLocalPathLeaksInText("note.md", source);
  assert.equal(leaks.length, 1);
  const serialized = JSON.stringify(leaks[0]);
  assert.ok(
    !serialized.includes(fakeSecret),
    `leak record must not echo the secret '${fakeSecret}': ${serialized}`
  );
  assert.ok(
    !serialized.includes("API_KEY"),
    `leak record must not echo arbitrary line content; got ${serialized}`
  );
});
