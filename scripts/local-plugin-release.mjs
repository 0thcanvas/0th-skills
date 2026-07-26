#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { isInvokedAsCli } from "./lib/cli.mjs";
import {
  currentRuntimeLinkPath,
  packageRuntimePlugin,
  registerCurrentRuntime
} from "./package-runtime-plugin.mjs";

export const LOCAL_MARKETPLACE_NAME = "0th-local";
export const LOCAL_PLUGIN_NAME = "0th-skills";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
}

function normalizedRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function releaseLedgerPath(registryRoot) {
  return path.join(registryRoot, "releases", `${LOCAL_PLUGIN_NAME}.json`);
}

function marketplacePath(registryRoot) {
  return path.join(registryRoot, ".agents", "plugins", "marketplace.json");
}

function emptyLedger() {
  return {
    schema_version: 1,
    plugin: LOCAL_PLUGIN_NAME,
    marketplace: LOCAL_MARKETPLACE_NAME,
    active_version: null,
    active_commit: null,
    releases: []
  };
}

function readLedger(registryRoot) {
  const filePath = releaseLedgerPath(registryRoot);
  if (!fs.existsSync(filePath)) return emptyLedger();
  const ledger = readJson(filePath);
  if (
    ledger.schema_version !== 1
    || ledger.plugin !== LOCAL_PLUGIN_NAME
    || ledger.marketplace !== LOCAL_MARKETPLACE_NAME
    || !Array.isArray(ledger.releases)
  ) {
    throw new Error(`invalid local release ledger: ${filePath}`);
  }
  return ledger;
}

function manifestVersion(sourceRoot) {
  const codexPath = path.join(sourceRoot, ".codex-plugin", "plugin.json");
  const claudePath = path.join(sourceRoot, ".claude-plugin", "plugin.json");
  const codexVersion = readJson(codexPath).version;
  const claudeVersion = readJson(claudePath).version;
  if (codexVersion !== claudeVersion) {
    throw new Error(
      `plugin manifest versions differ: Codex=${codexVersion}, Claude=${claudeVersion}`
    );
  }
  if (!SEMVER_PATTERN.test(codexVersion)) {
    throw new Error(`plugin version must be SemVer: ${codexVersion}`);
  }
  return codexVersion;
}

function artifactRootFor(registryRoot, version, commit) {
  return path.join(
    registryRoot,
    "plugins",
    LOCAL_PLUGIN_NAME,
    "releases",
    version,
    commit.slice(0, 12)
  );
}

function artifactRelativePath(registryRoot, artifactRoot) {
  return `./${normalizedRelative(registryRoot, artifactRoot)}`;
}

function listFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(absolute);
    }
  }
  walk(root);
  return files.sort((left, right) =>
    normalizedRelative(root, left).localeCompare(normalizedRelative(root, right))
  );
}

export function integritySha256(root) {
  const digest = crypto.createHash("sha256");
  for (const filePath of listFiles(root)) {
    const relative = normalizedRelative(root, filePath);
    digest.update(relative);
    digest.update("\0");
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) digest.update(fs.readlinkSync(filePath));
    else digest.update(fs.readFileSync(filePath));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function marketplaceManifest(artifactPath) {
  return {
    name: LOCAL_MARKETPLACE_NAME,
    interface: {
      displayName: "0th Local Releases"
    },
    plugins: [
      {
        name: LOCAL_PLUGIN_NAME,
        source: {
          source: "local",
          path: artifactPath
        },
        policy: {
          installation: "AVAILABLE",
          authentication: "ON_INSTALL"
        },
        category: "Coding"
      }
    ]
  };
}

function activateRecord({
  registryRoot,
  ledger,
  record,
  env,
  homeDir
}) {
  const artifactRoot = path.resolve(registryRoot, record.artifact_path);
  if (!fs.existsSync(artifactRoot)) {
    throw new Error(`release artifact is missing: ${artifactRoot}`);
  }
  const actualIntegrity = integritySha256(artifactRoot);
  if (actualIntegrity !== record.integrity_sha256) {
    throw new Error(
      `release artifact integrity mismatch for ${record.version} (${record.commit.slice(0, 12)})`
    );
  }

  const nextLedger = {
    ...ledger,
    active_version: record.version,
    active_commit: record.commit
  };
  writeJsonAtomic(
    marketplacePath(registryRoot),
    marketplaceManifest(artifactRelativePath(registryRoot, artifactRoot))
  );
  writeJsonAtomic(releaseLedgerPath(registryRoot), nextLedger);
  const runtimeLink = registerCurrentRuntime({
    runtimeRoot: artifactRoot,
    env,
    homeDir
  });

  return {
    marketplace: LOCAL_MARKETPLACE_NAME,
    plugin: LOCAL_PLUGIN_NAME,
    active_version: record.version,
    active_commit: record.commit,
    artifact_root: artifactRoot,
    integrity_sha256: record.integrity_sha256,
    runtime_link: runtimeLink
  };
}

export function publishLocalRelease({
  sourceRoot = process.cwd(),
  registryRoot = resolveRegistryRoot(),
  commit,
  now = new Date(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const source = path.resolve(sourceRoot);
  const registry = path.resolve(registryRoot);
  const version = manifestVersion(source);
  if (!/^[a-f0-9]{12,64}$/i.test(commit ?? "")) {
    throw new Error("release commit must be a 12-64 character hexadecimal Git commit");
  }

  const ledger = readLedger(registry);
  const existing = ledger.releases.find((release) => release.version === version);
  if (existing && existing.commit !== commit) {
    throw new Error(
      `${version} is already published from commit ${existing.commit.slice(0, 12)}; bump the plugin version`
    );
  }
  if (existing) {
    return {
      version,
      published: false,
      ...activateRecord({
        registryRoot: registry,
        ledger,
        record: existing,
        env,
        homeDir
      })
    };
  }

  const artifactRoot = artifactRootFor(registry, version, commit);
  packageRuntimePlugin({
    sourceRoot: source,
    outputRoot: artifactRoot,
    registerCurrent: false,
    env,
    homeDir
  });
  const record = {
    version,
    commit,
    artifact_path: artifactRelativePath(registry, artifactRoot),
    integrity_sha256: integritySha256(artifactRoot),
    created_at: now.toISOString()
  };
  const nextLedger = {
    ...ledger,
    releases: [...ledger.releases, record]
  };

  return {
    version,
    published: true,
    ...activateRecord({
      registryRoot: registry,
      ledger: nextLedger,
      record,
      env,
      homeDir
    })
  };
}

export function activateLocalRelease({
  registryRoot = resolveRegistryRoot(),
  version,
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const registry = path.resolve(registryRoot);
  const ledger = readLedger(registry);
  const record = ledger.releases.find((release) => release.version === version);
  if (!record) throw new Error(`local release is not available: ${version}`);
  return activateRecord({
    registryRoot: registry,
    ledger,
    record,
    env,
    homeDir
  });
}

export function readLocalReleaseStatus({
  registryRoot = resolveRegistryRoot(),
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  const registry = path.resolve(registryRoot);
  const ledger = readLedger(registry);
  const active = ledger.releases.find(
    (release) =>
      release.version === ledger.active_version && release.commit === ledger.active_commit
  );
  const runtimeLink = currentRuntimeLinkPath({ env, homeDir });
  return {
    marketplace: LOCAL_MARKETPLACE_NAME,
    plugin: LOCAL_PLUGIN_NAME,
    registry_root: registry,
    active_version: ledger.active_version,
    active_commit: ledger.active_commit,
    artifact_root: active ? path.resolve(registry, active.artifact_path) : null,
    integrity_sha256: active?.integrity_sha256 ?? null,
    runtime_link: runtimeLink,
    releases: ledger.releases
  };
}

export function resolveRegistryRoot({
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  if (env.OTH_PLUGIN_REGISTRY) return path.resolve(env.OTH_PLUGIN_REGISTRY);
  return path.join(homeDir, ".0th", "plugins", "marketplace");
}

function defaultCodexRunner(codexBin) {
  return (args) => spawnSync(codexBin, args, { encoding: "utf8" });
}

function runCodex(runner, args, { json = false } = {}) {
  const result = runner(args);
  if (result.status !== 0) {
    throw new Error(
      result.stderr?.trim()
      || result.stdout?.trim()
      || `codex ${args.join(" ")} failed`
    );
  }
  if (!json) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`codex ${args.join(" ")} returned invalid JSON`);
  }
}

export function installActiveRelease({
  registryRoot = resolveRegistryRoot(),
  codexBin = "codex",
  runner = defaultCodexRunner(codexBin),
  replaceSelectors = []
} = {}) {
  const registry = path.resolve(registryRoot);
  const status = readLocalReleaseStatus({ registryRoot: registry });
  if (!status.active_version || !status.artifact_root) {
    throw new Error("no active local release to install");
  }

  const marketplaceList = runCodex(
    runner,
    ["plugin", "marketplace", "list", "--json"],
    { json: true }
  );
  const configured = marketplaceList.marketplaces?.find(
    (marketplace) => marketplace.name === LOCAL_MARKETPLACE_NAME
  );
  if (configured && path.resolve(configured.root) !== registry) {
    throw new Error(
      `${LOCAL_MARKETPLACE_NAME} is already registered at a different root: ${configured.root}`
    );
  }
  if (!configured) {
    runCodex(
      runner,
      ["plugin", "marketplace", "add", registry, "--json"],
      { json: true }
    );
  }

  const installedBefore = runCodex(runner, ["plugin", "list", "--json"], { json: true });
  const installedIds = new Set(
    (installedBefore.installed ?? []).map((plugin) => plugin.pluginId)
  );
  const selector = `${LOCAL_PLUGIN_NAME}@${LOCAL_MARKETPLACE_NAME}`;
  for (const oldSelector of [...new Set(replaceSelectors)]) {
    if (oldSelector !== selector && installedIds.has(oldSelector)) {
      runCodex(runner, ["plugin", "remove", oldSelector]);
    }
  }
  if (installedIds.has(selector)) {
    runCodex(runner, ["plugin", "remove", selector]);
  }
  runCodex(runner, ["plugin", "add", selector, "--json"], { json: true });

  const installedAfter = runCodex(runner, ["plugin", "list", "--json"], { json: true });
  const installed = (installedAfter.installed ?? []).find(
    (plugin) => plugin.pluginId === selector
  );
  if (!installed) throw new Error(`Codex did not report ${selector} as installed`);
  if (installed.version !== status.active_version) {
    throw new Error(
      `installed version mismatch: expected ${status.active_version}, got ${installed.version}`
    );
  }
  if (path.resolve(installed.source?.path ?? "") !== path.resolve(status.artifact_root)) {
    throw new Error(
      `installed artifact mismatch: expected ${status.artifact_root}, got ${installed.source?.path}`
    );
  }

  return {
    marketplace: LOCAL_MARKETPLACE_NAME,
    selector,
    version: installed.version,
    artifact_root: installed.source.path,
    installed: true,
    enabled: installed.enabled
  };
}

function runGit(sourceRoot, args) {
  const result = spawnSync("git", ["-C", sourceRoot, ...args], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function releaseCommit(sourceRoot, { allowUntagged = false } = {}) {
  const dirty = runGit(sourceRoot, ["status", "--porcelain"]);
  if (dirty) throw new Error("local release source must be a clean Git checkout");
  const commit = runGit(sourceRoot, ["rev-parse", "HEAD"]);
  if (!allowUntagged) {
    const version = manifestVersion(sourceRoot);
    const tags = runGit(sourceRoot, ["tag", "--points-at", "HEAD"]).split("\n").filter(Boolean);
    if (!tags.includes(`v${version}`)) {
      throw new Error(`release commit must carry tag v${version}`);
    }
  }
  return commit;
}

function parseArgs(argv) {
  const options = {
    command: argv[0],
    sourceRoot: process.cwd(),
    registryRoot: resolveRegistryRoot(),
    allowUntagged: false,
    install: false,
    replaceSelectors: []
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source") options.sourceRoot = path.resolve(argv[++index]);
    else if (token === "--registry") options.registryRoot = path.resolve(argv[++index]);
    else if (token === "--version") options.version = argv[++index];
    else if (token === "--allow-untagged") options.allowUntagged = true;
    else if (token === "--install") options.install = true;
    else if (token === "--replace-selector") options.replaceSelectors.push(argv[++index]);
    else if (token === "--codex-bin") options.codexBin = argv[++index];
    else throw new Error(`unknown local release option: ${token}`);
  }
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/local-plugin-release.mjs <publish|activate|install|status> [options]",
    "",
    "publish options: --source PATH --registry PATH [--install] [--allow-untagged]",
    "activate options: --registry PATH --version SEMVER [--install]",
    "install options: --registry PATH [--replace-selector PLUGIN@MARKETPLACE]",
    "status options: --registry PATH",
    "",
    "Formal publish requires a clean checkout tagged v<manifest-version>.",
    "--allow-untagged is for isolated staging verification only.",
    ""
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.command === "help" || options.command === "--help") {
    process.stdout.write(helpText());
    return;
  }

  let result;
  if (options.command === "publish") {
    result = publishLocalRelease({
      sourceRoot: options.sourceRoot,
      registryRoot: options.registryRoot,
      commit: releaseCommit(options.sourceRoot, { allowUntagged: options.allowUntagged })
    });
    if (options.install) {
      result.install = installActiveRelease({
        registryRoot: options.registryRoot,
        codexBin: options.codexBin,
        replaceSelectors: options.replaceSelectors
      });
    }
  } else if (options.command === "activate") {
    if (!options.version) throw new Error("activate requires --version");
    result = activateLocalRelease({
      registryRoot: options.registryRoot,
      version: options.version
    });
    if (options.install) {
      result.install = installActiveRelease({
        registryRoot: options.registryRoot,
        codexBin: options.codexBin,
        replaceSelectors: options.replaceSelectors
      });
    }
  } else if (options.command === "install") {
    result = installActiveRelease({
      registryRoot: options.registryRoot,
      codexBin: options.codexBin,
      replaceSelectors: options.replaceSelectors
    });
  } else if (options.command === "status") {
    result = readLocalReleaseStatus({ registryRoot: options.registryRoot });
  } else {
    throw new Error(`unknown local release command: ${options.command}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
