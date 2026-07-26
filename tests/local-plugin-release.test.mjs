import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  activateLocalRelease,
  installActiveRelease,
  publishLocalRelease,
  readLocalReleaseStatus
} from "../scripts/local-plugin-release.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseCliPath = path.join(repoRoot, "scripts", "local-plugin-release.mjs");

function temporaryReleaseState() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "0th-local-release-"));
  return {
    registryRoot: path.join(root, "registry"),
    homeDir: path.join(root, "home")
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFixtureManifest(sourceRoot, version) {
  fs.mkdirSync(path.join(sourceRoot, ".codex-plugin"), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, ".claude-plugin"), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRoot, ".codex-plugin", "plugin.json"),
    `${JSON.stringify({ name: "0th-skills", version }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(sourceRoot, ".claude-plugin", "plugin.json"),
    `${JSON.stringify({ name: "0th", version }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(sourceRoot, "scripts", "0th.mjs"), "#!/usr/bin/env node\n");
}

function runGit(sourceRoot, args) {
  const result = spawnSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("keeps local release guidance as a linked current runbook instead of a dated decision", () => {
  const runbookPath = path.join(repoRoot, "references", "local-plugin-releases.md");
  const historicalDecisionPath = path.join(
    repoRoot,
    "docs",
    "decisions",
    "2026-07-26-private-local-plugin-releases.md"
  );
  const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");

  assert.equal(fs.existsSync(runbookPath), true);
  assert.equal(fs.existsSync(historicalDecisionPath), false);
  assert.match(readme, /references\/local-plugin-releases\.md/);

  const runbook = fs.readFileSync(runbookPath, "utf8");
  assert.match(runbook, /private .* marketplace/i);
  assert.match(runbook, /local-plugin-release\.mjs publish/);
  assert.match(runbook, /local-plugin-release\.mjs activate/);
  assert.match(runbook, /does not publish|never publishes/i);
});

test("publishes an immutable SemVer release into a private local marketplace", () => {
  const { registryRoot, homeDir } = temporaryReleaseState();
  const result = publishLocalRelease({
    sourceRoot: repoRoot,
    registryRoot,
    homeDir,
    env: {},
    commit: "1111111111111111111111111111111111111111",
    now: new Date("2026-07-26T15:00:00.000Z")
  });

  assert.equal(result.version, "0.4.0");
  assert.equal(result.marketplace, "0th-local");
  assert.equal(
    result.artifact_root,
    path.join(registryRoot, "plugins", "0th-skills", "releases", "0.4.0", "111111111111")
  );
  assert.equal(fs.existsSync(path.join(result.artifact_root, "scripts", "0th.mjs")), true);

  const marketplace = readJson(path.join(registryRoot, ".agents", "plugins", "marketplace.json"));
  assert.equal(marketplace.name, "0th-local");
  assert.equal(marketplace.plugins[0].name, "0th-skills");
  assert.equal(
    marketplace.plugins[0].source.path,
    "./plugins/0th-skills/releases/0.4.0/111111111111"
  );

  const status = readLocalReleaseStatus({ registryRoot, homeDir, env: {} });
  assert.equal(status.active_version, "0.4.0");
  assert.equal(status.active_commit, "1111111111111111111111111111111111111111");
  assert.equal(fs.realpathSync(status.runtime_link), fs.realpathSync(result.artifact_root));
  assert.match(status.integrity_sha256, /^[a-f0-9]{64}$/);
});

test("refuses to publish different content under an existing version", () => {
  const { registryRoot, homeDir } = temporaryReleaseState();
  const shared = { sourceRoot: repoRoot, registryRoot, homeDir, env: {} };

  publishLocalRelease({
    ...shared,
    commit: "1111111111111111111111111111111111111111"
  });

  assert.throws(
    () => publishLocalRelease({
      ...shared,
      commit: "2222222222222222222222222222222222222222"
    }),
    /0\.4\.0 is already published from commit 111111111111/i
  );
});

test("activation rolls the marketplace and runtime link back to a prior release", () => {
  const { registryRoot, homeDir } = temporaryReleaseState();
  const sourceRoot = path.join(path.dirname(registryRoot), "source");
  const shared = { sourceRoot, registryRoot, homeDir, env: {} };

  writeFixtureManifest(sourceRoot, "0.3.4");
  const first = publishLocalRelease({
    ...shared,
    commit: "1111111111111111111111111111111111111111"
  });
  writeFixtureManifest(sourceRoot, "0.4.0");
  publishLocalRelease({
    ...shared,
    commit: "2222222222222222222222222222222222222222"
  });

  const rollback = activateLocalRelease({
    registryRoot,
    homeDir,
    env: {},
    version: "0.3.4"
  });

  assert.equal(rollback.active_version, "0.3.4");
  assert.equal(fs.realpathSync(rollback.runtime_link), fs.realpathSync(first.artifact_root));
  const marketplace = readJson(path.join(registryRoot, ".agents", "plugins", "marketplace.json"));
  assert.equal(
    marketplace.plugins[0].source.path,
    "./plugins/0th-skills/releases/0.3.4/111111111111"
  );
});

test("installs the active release from the private marketplace and replaces a legacy selector", () => {
  const { registryRoot, homeDir } = temporaryReleaseState();
  const release = publishLocalRelease({
    sourceRoot: repoRoot,
    registryRoot,
    homeDir,
    env: {},
    commit: "1111111111111111111111111111111111111111"
  });
  const calls = [];
  let pluginListCalls = 0;
  const runner = (args) => {
    calls.push(args);
    if (args.join(" ") === "plugin marketplace list --json") {
      return {
        status: 0,
        stdout: JSON.stringify({ marketplaces: [] }),
        stderr: ""
      };
    }
    if (args.join(" ") === "plugin list --json") {
      pluginListCalls += 1;
      return {
        status: 0,
        stdout: JSON.stringify(pluginListCalls === 1
          ? {
              installed: [
                {
                  pluginId: "0th-skills@mini-local",
                  version: "0.3.4",
                  source: { path: "/legacy" }
                }
              ]
            }
          : {
              installed: [
                {
                  pluginId: "0th-skills@0th-local",
                  version: "0.4.0",
                  enabled: true,
                  source: { path: release.artifact_root }
                }
              ]
            }),
        stderr: ""
      };
    }
    return { status: 0, stdout: "{}\n", stderr: "" };
  };

  const installed = installActiveRelease({
    registryRoot,
    runner,
    replaceSelectors: ["0th-skills@mini-local"]
  });

  assert.equal(installed.selector, "0th-skills@0th-local");
  assert.equal(installed.version, "0.4.0");
  assert.deepEqual(calls, [
    ["plugin", "marketplace", "list", "--json"],
    ["plugin", "marketplace", "add", registryRoot, "--json"],
    ["plugin", "list", "--json"],
    ["plugin", "remove", "0th-skills@mini-local"],
    ["plugin", "add", "0th-skills@0th-local", "--json"],
    ["plugin", "list", "--json"]
  ]);
});

test("refuses to install when the private marketplace name points at another root", () => {
  const { registryRoot, homeDir } = temporaryReleaseState();
  publishLocalRelease({
    sourceRoot: repoRoot,
    registryRoot,
    homeDir,
    env: {},
    commit: "1111111111111111111111111111111111111111"
  });

  assert.throws(
    () => installActiveRelease({
      registryRoot,
      runner: (args) => {
        assert.deepEqual(args, ["plugin", "marketplace", "list", "--json"]);
        return {
          status: 0,
          stdout: JSON.stringify({
            marketplaces: [{ name: "0th-local", root: "/another/registry" }]
          }),
          stderr: ""
        };
      }
    }),
    /already registered at a different root/
  );
});

test("publish CLI requires a clean Git commit with a matching release tag", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "0th-local-release-cli-"));
  const sourceRoot = path.join(root, "source");
  const registryRoot = path.join(root, "registry");
  const stateRoot = path.join(root, "state");
  writeFixtureManifest(sourceRoot, "0.4.0");
  runGit(sourceRoot, ["init"]);
  runGit(sourceRoot, ["config", "user.name", "0th Test"]);
  runGit(sourceRoot, ["config", "user.email", "test@local.invalid"]);
  runGit(sourceRoot, ["add", "."]);
  runGit(sourceRoot, ["commit", "-m", "release fixture"]);

  const beforeTag = spawnSync(process.execPath, [
    releaseCliPath,
    "publish",
    "--source",
    sourceRoot,
    "--registry",
    registryRoot
  ], {
    encoding: "utf8",
    env: { ...process.env, OTH_SKILLS_STATE_DIR: stateRoot }
  });
  assert.equal(beforeTag.status, 1);
  assert.match(beforeTag.stderr, /must carry tag v0\.4\.0/);

  runGit(sourceRoot, ["tag", "v0.4.0"]);
  const published = spawnSync(process.execPath, [
    releaseCliPath,
    "publish",
    "--source",
    sourceRoot,
    "--registry",
    registryRoot
  ], {
    encoding: "utf8",
    env: { ...process.env, OTH_SKILLS_STATE_DIR: stateRoot }
  });
  assert.equal(published.status, 0, published.stderr);
  const result = JSON.parse(published.stdout);
  assert.equal(result.version, "0.4.0");
  assert.equal(result.published, true);
  assert.equal(fs.realpathSync(result.runtime_link), fs.realpathSync(result.artifact_root));
});
