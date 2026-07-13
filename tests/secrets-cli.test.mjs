import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  checkSecrets,
  cleanSecrets,
  loadSecretsManifest,
  runSecretsCommand,
  syncSecrets,
  validateReferenceTemplate
} from "../scripts/secrets.mjs";

const temporaryDirectories = [];

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "0th-secrets-"));
  temporaryDirectories.push(root);
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  fs.writeFileSync(path.join(root, ".gitignore"), ".env.*\n");
  fs.writeFileSync(path.join(root, ".0th-secrets.json"), JSON.stringify({
    schema_version: 1,
    environments: {
      api: { references: ".env.api.1password", output: ".env.api.local" }
    }
  }));
  fs.writeFileSync(path.join(root, ".env.api.1password"), "API_KEY={{ op://Development/API/key }}\n", { mode: 0o600 });
  return root;
}

test.afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("manifest resolves project cache paths and rejects traversal", () => {
  const root = fixtureRepo();
  const canonicalRoot = fs.realpathSync(root);
  const manifest = loadSecretsManifest({ cwd: root });
  assert.equal(manifest.environments.api.references, path.join(canonicalRoot, ".env.api.1password"));
  assert.equal(manifest.environments.api.output, path.join(canonicalRoot, ".env.api.local"));

  fs.writeFileSync(path.join(root, ".0th-secrets.json"), JSON.stringify({
    schema_version: 1,
    environments: { api: { references: "../refs", output: ".env.api.local" } }
  }));
  assert.throws(() => loadSecretsManifest({ cwd: root }), /relative|project|traversal/i);
});

test("reference templates contain only op references and reject wallet material", () => {
  assert.deepEqual(
    validateReferenceTemplate("API_KEY={{ op://Development/API/key }}\n"),
    ["API_KEY"]
  );
  assert.throws(() => validateReferenceTemplate("API_KEY=plaintext\n"), /op:\/\//i);
  assert.throws(
    () => validateReferenceTemplate("SIGNER_PRIVATE_KEY={{ op://Development/Wallet/key }}\n"),
    /wallet material|private key/i
  );
});

test("sync injects to a protected temporary path and atomically installs output", () => {
  const root = fixtureRepo();
  const calls = [];
  syncSecrets({
    cwd: root,
    names: ["api"],
    inject(command, args) {
      calls.push({ command, args });
      const output = args[args.indexOf("--out-file") + 1];
      fs.writeFileSync(output, "API_KEY=fixture\n", { mode: 0o600 });
    }
  });
  const output = path.join(root, ".env.api.local");
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  assert.equal(calls[0].command, "op");
  assert.deepEqual(calls[0].args.slice(0, 2), ["inject", "--in-file"]);
  assert.match(calls[0].args[calls[0].args.indexOf("--out-file") + 1], /\.env\.api\.local\.tmp-/);

  cleanSecrets({ cwd: root, names: ["api"] });
  assert.equal(fs.existsSync(output), false);
});

test("public 0th secrets commands expose metadata without reading generated values", () => {
  const root = fixtureRepo();
  const lines = [];
  assert.equal(runSecretsCommand(["paths"], { cwd: root, write: line => lines.push(line) }), 0);
  assert.match(lines.join("\n"), /api.*references.*output/i);
  assert.doesNotMatch(lines.join("\n"), /op:\/\//i);
  lines.length = 0;
  assert.equal(runSecretsCommand(["output", "api"], { cwd: root, write: line => lines.push(line) }), 0);
  assert.deepEqual(lines, [path.join(fs.realpathSync(root), ".env.api.local")]);
});

test("linked worktrees validate shared cache ignores from the storage checkout", () => {
  const root = fixtureRepo();
  execFileSync("git", ["add", ".gitignore", ".0th-secrets.json"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=0th Secrets Test",
      "-c",
      "user.email=secrets-test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture"
    ],
    { cwd: root }
  );
  const linkedRoot = `${root}-linked`;
  temporaryDirectories.push(linkedRoot);
  execFileSync("git", ["worktree", "add", "--quiet", "--detach", linkedRoot], { cwd: root });
  fs.writeFileSync(path.join(root, ".env.api.local"), "API_KEY=fixture\n", { mode: 0o600 });

  assert.equal(checkSecrets({ cwd: linkedRoot, names: ["api"] }), true);
});
