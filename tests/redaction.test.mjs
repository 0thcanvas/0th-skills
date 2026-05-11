import test from "node:test";
import assert from "node:assert/strict";
import { assertNoSecretLikeText, SECRET_PATTERNS } from "../scripts/lib/redaction.mjs";

const join = (...parts) => parts.join("");
const SECRETS = {
  githubClassic: join("ghp", "_", "1234567890abcdefABCDEF1234567890abcdef"),
  githubFineGrained: join("github_pat", "_", "11AAAA0Aa0AaAaaAAaAaAa", "_", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
  gitlab: join("glpat", "-", "1234567890abcdef12345678"),
  slack: join("xoxb", "-", "1234567890", "-", "1234567890123", "-", "AbCdEfGhIjKlMnOpQrStUvWx"),
  awsAccessKey: join("AKIA", "IOSFODNN7EXAMPLE"),
  awsTemporaryKey: join("ASIA", "IOSFODNN7EXAMPLE"),
  jwt: join("eyJhbGciOiJIUzI1NiJ9", ".", "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0", ".", "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
  rsaPrivateKeyMarker: join("-----BEGIN ", "RSA PRIVATE KEY-----"),
  openSshPrivateKeyMarker: join("-----BEGIN ", "OPENSSH PRIVATE KEY-----"),
  basicAuthUrl: join("https://user", ":", "pa55w0rd123", "@example.com/x"),
  envApiKey: join("FOO_API_KEY", "=", "mySuperSecretValue123"),
  letterOnlyPassword: join("password", "=", "correcthorsebattery"),
  letterOnlyApiKey: join("API_KEY", "=", "abcdefghijklmnopqrstuv"),
  dopplerToken: join("dp", ".", "pt", ".", "AbCdEfGhIjKlMnOpQrStUvWxYz1234567890"),
  vaultToken: join("hvs", ".", "AbCdEfGhIjKlMnOpQrStUvWxYz1234567890"),
  bearerToken: join("Authorization: Bearer ", "eyJabcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJ"),
  passwordAssignment: join("password", "=", "Tr0ub4dor&3xtra")
};

// Adversarial corpus — every entry MUST be detected as a secret-like leak.
// If any of these slip through, the redactor is back-sliding. Each label is the
// real-world format an agent or human is most likely to paste into evidence,
// claims, or open-loop notes.
const ADVERSARIAL = [
  ["GitHub fine-grained PAT (classic prefix)", SECRETS.githubClassic],
  ["GitHub new-format PAT", SECRETS.githubFineGrained],
  ["GitLab personal access token", SECRETS.gitlab],
  ["Slack bot token", SECRETS.slack],
  ["AWS access key id", SECRETS.awsAccessKey],
  ["AWS temporary access key", SECRETS.awsTemporaryKey],
  ["JWT (base64url with dots)", SECRETS.jwt],
  ["PEM private key marker", SECRETS.rsaPrivateKeyMarker],
  ["OpenSSH private key marker", SECRETS.openSshPrivateKeyMarker],
  ["HTTP basic auth in URL", SECRETS.basicAuthUrl],
  ["Env-style uppercase API key", SECRETS.envApiKey],
  ["Letter-only password assignment", SECRETS.letterOnlyPassword],
  ["Letter-only API key assignment", SECRETS.letterOnlyApiKey],
  ["Doppler token", SECRETS.dopplerToken],
  ["Vault token", SECRETS.vaultToken],
  ["Bearer token in header", SECRETS.bearerToken],
  ["password= assignment", SECRETS.passwordAssignment]
];

// Innocuous corpus — every entry MUST be accepted. These are the
// false-positive regression fixtures from PR #19/#20/#21.
const INNOCUOUS = [
  ["40-char git SHA", "commit 0123456789abcdef0123456789abcdef01234567"],
  ["Docker image digest", "image@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd"],
  ["1Password reference", "op://Engineering/MyService/api_key"],
  ["Doppler reference (no secret)", "doppler://my-project/dev/MY_KEY"],
  ["Plain English about a secret", "We rotated the database password yesterday during incident response."],
  ["Plain English with 'key' word", "Use the public key for signing the manifest"],
  ["Markdown link to docs", "https://docs.example.com/api/keys#how-to-create-one"],
  // PR #21 verifier follow-up: doc/spec placeholders that the previous
  // env-style and Bearer regexes false-positive-matched. Real secrets
  // contain entropy (letters AND digits); these placeholders do not.
  ["Schema placeholder — api_key required", "api_key: required"],
  ["Schema placeholder — password optional", "password: optional"],
  ["Doc placeholder — Bearer prompt", "Authorization: Bearer replace-with-your-token"],
  ["Doc placeholder — secret_key string", "secret_key: <your-value-here>"],
  ["Doc placeholder — password: TODO", "password: TODO-on-deploy"]
];

test("redaction blocks every adversarial secret format", () => {
  for (const [label, value] of ADVERSARIAL) {
    assert.throws(
      () => assertNoSecretLikeText([value]),
      /secret-like/,
      `${label} leaked: ${value.slice(0, 60)}`
    );
  }
});

test("redaction permits innocuous fixtures that look secret-ish", () => {
  for (const [label, value] of INNOCUOUS) {
    assert.doesNotThrow(
      () => assertNoSecretLikeText([value]),
      `${label} false-positive: ${value.slice(0, 60)}`
    );
  }
});

test("redaction message can be customized", () => {
  assert.throws(
    () => assertNoSecretLikeText([SECRETS.githubClassic], "boom"),
    /boom/
  );
});

test("SECRET_PATTERNS is non-empty and frozen-ish", () => {
  assert.ok(Array.isArray(SECRET_PATTERNS));
  assert.ok(SECRET_PATTERNS.length >= 5, "expected ≥5 patterns covering modern secret formats");
});

test("redaction op:// substitution does not unmask raw secrets in the same string", () => {
  // Pre-PR #21 the op:// replace happened first; we want to keep that behavior
  // but ensure a real secret tacked onto an op:// line still trips the guard.
  assert.throws(
    () => assertNoSecretLikeText([
      `op://Vault/Item/field plus ${SECRETS.githubClassic}`
    ]),
    /secret-like/
  );
});

test("redaction handles null/empty/whitespace inputs without crashing", () => {
  assert.doesNotThrow(() => assertNoSecretLikeText([null, undefined, "", "  "]));
  assert.doesNotThrow(() => assertNoSecretLikeText([]));
});

test("open-loop status updates (block/drop/close) refuse secret-like reasons", async () => {
  // PR #21 verifier C-partial: status updates (block, close, drop, reopen)
  // previously accepted user reason text without the redaction guard. The
  // most common leak vector is a hurried "rotate ghp_… and rerun" block
  // reason. Pin the guard via the canonical addOpenLoop + updateOpenLoopStatus
  // flow.
  const { default: fs } = await import("node:fs");
  const { default: os } = await import("node:os");
  const { default: path } = await import("node:path");
  const { addOpenLoop, updateOpenLoopStatus } = await import("../scripts/open-loop.mjs");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "open-loop-secret-"));
  const taskFile = path.join(dir, "tasks.jsonl");
  const briefFile = path.join(dir, "brief.md");

  const added = addOpenLoop({
    cwd: dir,
    taskFile,
    briefFile,
    updateBrief: false,
    input: {
      title: "Rotate the API key",
      scope: "repo",
      next_action: "rotate without leaking the value",
      evidence_path: "tests/redaction.test.mjs"
    }
  });

  assert.throws(
    () => updateOpenLoopStatus({
      cwd: dir,
      taskFile,
      briefFile,
      updateBrief: false,
      id: added.id,
      status: "blocked",
      blockedReason: `Waiting on rotation of ${SECRETS.githubClassic} in CI`,
    }),
    /secret-like/
  );

  assert.throws(
    () => updateOpenLoopStatus({
      cwd: dir,
      taskFile,
      briefFile,
      updateBrief: false,
      id: added.id,
      status: "dropped",
      dropReason: `no longer relevant; ${SECRETS.awsAccessKey} deactivated upstream`,
    }),
    /secret-like/
  );
});

test("writers scan persisted ids and provenance references", async () => {
  const { default: fs } = await import("node:fs");
  const { default: os } = await import("node:os");
  const { default: path } = await import("node:path");
  const { appendMemoryClaim } = await import("../scripts/memory-write.mjs");
  const { addEvidenceRecord } = await import("../scripts/evidence.mjs");
  const { addOpenLoop, updateOpenLoopStatus } = await import("../scripts/open-loop.mjs");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "writer-secret-fields-"));
  const memoryFile = path.join(dir, "claims.jsonl");
  const evidenceFile = path.join(dir, "events.jsonl");
  const taskFile = path.join(dir, "tasks.jsonl");
  const briefFile = path.join(dir, "brief.md");

  const baseClaim = {
    type: "decision",
    claim: "Store only safe provenance pointers.",
    scope: "repo",
    evidence_path: "tests/redaction.test.mjs",
    confidence: "high"
  };

  assert.throws(
    () => appendMemoryClaim({
      cwd: dir,
      memoryFile,
      updateBrief: false,
      input: { ...baseClaim, id: SECRETS.githubClassic }
    }),
    /secret-like/
  );
  assert.throws(
    () => appendMemoryClaim({
      cwd: dir,
      memoryFile,
      updateBrief: false,
      input: { ...baseClaim, evidence_id: SECRETS.githubClassic }
    }),
    /secret-like/
  );
  assert.throws(
    () => appendMemoryClaim({
      cwd: dir,
      memoryFile,
      updateBrief: false,
      input: { ...baseClaim, supersedes: [SECRETS.githubClassic] }
    }),
    /secret-like/
  );

  assert.throws(
    () => addEvidenceRecord({
      cwd: dir,
      evidenceFile,
      input: {
        id: SECRETS.githubClassic,
        event_type: "research",
        scope: "repo",
        summary: "Safe summary.",
        source_path: "tests/redaction.test.mjs"
      }
    }),
    /secret-like/
  );

  assert.throws(
    () => addOpenLoop({
      cwd: dir,
      taskFile,
      briefFile,
      updateBrief: false,
      input: {
        id: SECRETS.githubClassic,
        title: "Safe title",
        scope: "repo",
        next_action: "Use safe pointers.",
        evidence_path: "tests/redaction.test.mjs"
      }
    }),
    /secret-like/
  );
  assert.throws(
    () => addOpenLoop({
      cwd: dir,
      taskFile,
      briefFile,
      updateBrief: false,
      input: {
        title: "Safe title",
        scope: "repo",
        next_action: "Use safe pointers.",
        evidence_id: SECRETS.githubClassic
      }
    }),
    /secret-like/
  );

  const added = addOpenLoop({
    cwd: dir,
    taskFile,
    briefFile,
    updateBrief: false,
    input: {
      id: "safe-loop",
      title: "Safe title",
      scope: "repo",
      next_action: "Use safe pointers.",
      evidence_path: "tests/redaction.test.mjs"
    }
  });
  assert.throws(
    () => updateOpenLoopStatus({
      cwd: dir,
      taskFile,
      briefFile,
      updateBrief: false,
      id: added.id,
      status: "open",
      evidenceIds: SECRETS.githubClassic
    }),
    /secret-like/
  );
});
