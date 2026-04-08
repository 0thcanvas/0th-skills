import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modulePath = path.resolve(__dirname, "..", "scripts", "counterpart-companion.mjs");

const {
  sanitizeKey,
  detectHost,
  loadAndValidateConfig,
  stripAnsi,
  stripPreamble,
  DRIVER_ALLOWLIST,
  KNOWN_HOSTS,
  DEFAULT_CONFIG
} = await import(modulePath);

// ---------------------------------------------------------------------------
// Helper: save/restore env vars for detectHost tests
// ---------------------------------------------------------------------------

const HOST_ENV_KEYS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "_",
  "CODEX_SANDBOX"
];

function saveEnv() {
  const saved = {};
  for (const key of HOST_ENV_KEYS) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved) {
  for (const key of HOST_ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
}

function clearHostEnv() {
  for (const key of HOST_ENV_KEYS) {
    delete process.env[key];
  }
}

function makeTmpDir(prefix = "counterpart-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ===========================================================================
// sanitizeKey
// ===========================================================================

test("sanitizeKey: replaces slashes with dashes", () => {
  assert.equal(sanitizeKey("ship/my-branch"), "ship-my-branch");
});

test("sanitizeKey: collapses consecutive dashes", () => {
  assert.equal(sanitizeKey("a---b"), "a-b");
});

test("sanitizeKey: strips leading and trailing dashes", () => {
  assert.equal(sanitizeKey("-abc-"), "abc");
});

test("sanitizeKey: handles mixed non-alphanumeric characters", () => {
  assert.equal(sanitizeKey("hello world!@#foo"), "hello-world-foo");
});

test("sanitizeKey: preserves dots and underscores", () => {
  assert.equal(sanitizeKey("v1.0_rc1"), "v1.0_rc1");
});

// ===========================================================================
// detectHost
// ===========================================================================

test("detectHost: CLAUDECODE=1 returns 'claude'", () => {
  const saved = saveEnv();
  try {
    clearHostEnv();
    process.env.CLAUDECODE = "1";
    assert.equal(detectHost(), "claude");
  } finally {
    restoreEnv(saved);
  }
});

test("detectHost: CLAUDE_CODE_ENTRYPOINT set returns 'claude'", () => {
  const saved = saveEnv();
  try {
    clearHostEnv();
    process.env.CLAUDE_CODE_ENTRYPOINT = "cli";
    assert.equal(detectHost(), "claude");
  } finally {
    restoreEnv(saved);
  }
});

test("detectHost: CODEX_SANDBOX set returns 'codex'", () => {
  const saved = saveEnv();
  try {
    clearHostEnv();
    process.env.CODEX_SANDBOX = "1";
    assert.equal(detectHost(), "codex");
  } finally {
    restoreEnv(saved);
  }
});

test("detectHost: no env vars returns null", () => {
  const saved = saveEnv();
  try {
    clearHostEnv();
    assert.equal(detectHost(), null);
  } finally {
    restoreEnv(saved);
  }
});

test("detectHost: CLAUDECODE=1 takes priority over CODEX_SANDBOX", () => {
  const saved = saveEnv();
  try {
    clearHostEnv();
    process.env.CLAUDECODE = "1";
    process.env.CODEX_SANDBOX = "1";
    assert.equal(detectHost(), "claude");
  } finally {
    restoreEnv(saved);
  }
});

// ===========================================================================
// loadAndValidateConfig
// ===========================================================================

test("loadAndValidateConfig: creates default config when file is missing", () => {
  const tmpDir = makeTmpDir();
  const cfgPath = path.join(tmpDir, "reviewer-config.json");

  const config = loadAndValidateConfig(cfgPath);
  assert.deepEqual(config, DEFAULT_CONFIG);

  // File should exist on disk now
  const onDisk = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  assert.deepEqual(onDisk, DEFAULT_CONFIG);
});

test("loadAndValidateConfig: accepts a valid config", () => {
  const tmpDir = makeTmpDir();
  const cfgPath = path.join(tmpDir, "reviewer-config.json");

  const valid = {
    version: 1,
    counterparts: {
      claude: "codex",
      codex: "claude"
    }
  };
  fs.writeFileSync(cfgPath, JSON.stringify(valid));

  const config = loadAndValidateConfig(cfgPath);
  assert.deepEqual(config, valid);
});

test("loadAndValidateConfig: rejects missing version", () => {
  const tmpDir = makeTmpDir();
  const cfgPath = path.join(tmpDir, "reviewer-config.json");

  fs.writeFileSync(cfgPath, JSON.stringify({ counterparts: { claude: "codex" } }));

  assert.throws(
    () => loadAndValidateConfig(cfgPath),
    /unsupported version/
  );
});

test("loadAndValidateConfig: rejects wrong version number", () => {
  const tmpDir = makeTmpDir();
  const cfgPath = path.join(tmpDir, "reviewer-config.json");

  fs.writeFileSync(cfgPath, JSON.stringify({ version: 2, counterparts: { claude: "codex" } }));

  assert.throws(
    () => loadAndValidateConfig(cfgPath),
    /unsupported version/
  );
});

test("loadAndValidateConfig: rejects host mapping to itself", () => {
  const tmpDir = makeTmpDir();
  const cfgPath = path.join(tmpDir, "reviewer-config.json");

  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ version: 1, counterparts: { claude: "claude" } })
  );

  assert.throws(
    () => loadAndValidateConfig(cfgPath),
    /must not map to itself/
  );
});

test("loadAndValidateConfig: rejects unknown driver value", () => {
  const tmpDir = makeTmpDir();
  const cfgPath = path.join(tmpDir, "reviewer-config.json");

  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ version: 1, counterparts: { claude: "gpt" } })
  );

  assert.throws(
    () => loadAndValidateConfig(cfgPath),
    /unknown driver "gpt"/
  );
});

test("loadAndValidateConfig: rejects unknown host key", () => {
  const tmpDir = makeTmpDir();
  const cfgPath = path.join(tmpDir, "reviewer-config.json");

  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ version: 1, counterparts: { unknown: "codex" } })
  );

  assert.throws(
    () => loadAndValidateConfig(cfgPath),
    /unknown host "unknown"/
  );
});

// ===========================================================================
// stripAnsi
// ===========================================================================

test("stripAnsi: removes ANSI color codes", () => {
  assert.equal(stripAnsi("\x1b[31mred\x1b[0m"), "red");
});

test("stripAnsi: passes clean text through unchanged", () => {
  assert.equal(stripAnsi("clean text"), "clean text");
});

test("stripAnsi: removes bold sequences", () => {
  assert.equal(stripAnsi("\x1b[1mbold\x1b[0m"), "bold");
});

test("stripAnsi: removes multiple ANSI codes", () => {
  assert.equal(stripAnsi("\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m"), "red and green");
});

// ===========================================================================
// stripPreamble
// ===========================================================================

test("stripPreamble: strips leading preamble lines", () => {
  const text = [
    "Current version: 1.2.3",
    "Latest version: 1.2.4",
    "Executing prompt: review this",
    "",
    "BLOCKERS",
    "- Missing null check"
  ].join("\n");

  assert.equal(stripPreamble(text), "BLOCKERS\n- Missing null check");
});

test("stripPreamble: preserves body lines that match preamble patterns", () => {
  const text = [
    "Warning: helper emitted a preamble",
    "BLOCKERS",
    "- Current version: field is missing",
    "- Warning: unhandled error"
  ].join("\n");

  assert.equal(
    stripPreamble(text),
    "BLOCKERS\n- Current version: field is missing\n- Warning: unhandled error"
  );
});

test("stripPreamble: returns full text when no preamble present", () => {
  const text = "BLOCKERS\n- A real issue";
  assert.equal(stripPreamble(text), "BLOCKERS\n- A real issue");
});

test("stripPreamble: handles AGENT RESPONSE header", () => {
  const text = "AGENT RESPONSE\nBLOCKERS\n- Bug";
  assert.equal(stripPreamble(text), "BLOCKERS\n- Bug");
});

// ===========================================================================
// Constants
// ===========================================================================

test("DRIVER_ALLOWLIST contains codex and claude", () => {
  assert.ok(DRIVER_ALLOWLIST.includes("codex"));
  assert.ok(DRIVER_ALLOWLIST.includes("claude"));
});

test("DRIVER_ALLOWLIST has exactly 2 entries", () => {
  assert.equal(DRIVER_ALLOWLIST.length, 2);
});

test("KNOWN_HOSTS contains the supported hosts", () => {
  assert.ok(KNOWN_HOSTS.includes("claude"));
  assert.ok(KNOWN_HOSTS.includes("codex"));
  assert.equal(KNOWN_HOSTS.length, 2);
});

test("DEFAULT_CONFIG has version 1", () => {
  assert.equal(DEFAULT_CONFIG.version, 1);
});

test("DEFAULT_CONFIG maps claude to codex and codex to claude", () => {
  assert.equal(DEFAULT_CONFIG.counterparts.claude, "codex");
  assert.equal(DEFAULT_CONFIG.counterparts.codex, "claude");
});
