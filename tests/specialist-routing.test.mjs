import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("specialist routing contract keeps 0th as the workflow orchestrator", () => {
  const source = read("references/specialist-routing.md");

  assert.match(source, /0th remains the workflow orchestrator/);
  assert.match(source, /route at the capability\/workflow boundary/);
  assert.match(source, /do not micromanage a plugin's internal skill sequence/);
  assert.match(source, /handoff envelope/);
  assert.match(source, /return receipt/);
  assert.match(source, /Routing is a subroutine, not a transfer of workflow ownership/);
  assert.match(source, /no-silent-downgrade/i);
});

test("specialist routing contract defines adapter states and fallback behavior", () => {
  const source = read("references/specialist-routing.md");

  for (const fragment of [
    "adapter_available",
    "adapter_unavailable",
    "adapter_ran_evidence_incomplete",
    "adapter_satisfied_contract",
    "native 0th fallback",
    "BLOCKED_REAL_ENV"
  ]) {
    assert.ok(source.includes(fragment), `routing contract should include "${fragment}"`);
  }
});

test("core workflow skills route specialists through the shared contract", () => {
  for (const skillName of ["think", "plan", "build", "ship"]) {
    const source = read(`skills/${skillName}/SKILL.md`);

    assert.match(
      source,
      /\.\.\/\.\.\/references\/specialist-routing\.md/,
      `${skillName} should link to the specialist routing contract`
    );
  }
});

test("specialist routing is guarded by build and ship gates", () => {
  const build = read("skills/build/SKILL.md");
  const ship = read("skills/ship/SKILL.md");

  assert.match(build, /specialist handoff envelope/);
  assert.match(build, /specialist return receipt/);
  assert.match(build, /re-run the proof and product acceptance gates/);
  assert.match(build, /does not satisfy proof by itself/);

  assert.match(ship, /specialist return receipts/);
  assert.match(ship, /proof contract depends on specialist evidence/);
  assert.match(ship, /adapter_unavailable/);
});

test("visual and frontend work route through adapter evidence instead of copied plugin internals", () => {
  const routing = read("references/specialist-routing.md");
  const build = read("skills/build/SKILL.md");

  for (const fragment of [
    "visual_product_design",
    "frontend_app_builder",
    "Product Design",
    "Build Web Apps",
    "visual target",
    "design QA",
    "browser QA",
    "screenshots"
  ]) {
    assert.ok(routing.includes(fragment), `visual/frontend routing should include "${fragment}"`);
  }

  assert.match(routing, /plugin-owned internal workflow/);
  assert.match(routing, /do not copy the plugin body/);
  assert.match(build, /visual target or frontend builder capability/);
  assert.match(build, /screenshots, design QA, or browser QA/);
});

test("iOS and SwiftUI work distinguish compile proof from simulator proof", () => {
  const routing = read("references/specialist-routing.md");
  const build = read("skills/build/SKILL.md");

  for (const fragment of [
    "ios_app_real_env_verification",
    "swiftui_ui_patterns",
    "Build iOS Apps",
    "XcodeBuildMCP",
    "simulator build/run/debug",
    "UI screenshots",
    "logs",
    "performance",
    "leak",
    "compile-only validation",
    "real app launch"
  ]) {
    assert.ok(routing.includes(fragment), `iOS routing should include "${fragment}"`);
  }

  assert.match(build, /iOS simulator capability/);
  assert.match(build, /compile\/test proof does not claim simulator proof/);
});

test("logged-in browser work preserves private-session evidence boundaries", () => {
  const routing = read("references/specialist-routing.md");
  const build = read("skills/build/SKILL.md");
  const research = read("skills/research/SKILL.md");

  for (const fragment of [
    "logged_in_browser_access",
    "session_backed_reading",
    "Browser Kit",
    "bb-browser",
    "OpenCLI",
    "current browser session",
    "tested URL or surface",
    "interaction/read evidence",
    "challenge_or_session_blocked",
    "adapter_unavailable",
    "daemon",
    "--cdp-port",
    "--daemon-port",
    "BROWSER_KIT_CDP_PORT",
    "BROWSER_KIT_DAEMON_PORT",
    "public search is not a substitute"
  ]) {
    assert.ok(routing.includes(fragment), `browser routing should include "${fragment}"`);
  }

  assert.match(build, /logged-in browser capability/);
  assert.match(build, /public search is not a substitute/);
  assert.match(research, /\.\.\/\.\.\/references\/specialist-routing\.md/);
  assert.match(research, /session-backed read receipt/);
  assert.match(research, /challenge_or_session_blocked/);
  assert.match(research, /fetch-only failure/);
  assert.match(research, /adapter_unavailable/);
  assert.match(research, /BROWSER_KIT_CDP_PORT/);
  assert.match(read("skills/build/references/verification-checklist.md"), /--cdp-port/);
  assert.match(read("agents/verifier.md"), /BROWSER_KIT_DAEMON_PORT/);
  assert.match(read("references/stack-minimums.md"), /localhost:19825/);
});

test("fetch-only research agents hand back session blockers instead of treating them as absence", () => {
  const claudeResearcher = read("agents/web-researcher.md");
  const codexResearcher = read(".codex/agents/0th-researcher.toml");

  for (const [name, source] of [
    ["Claude web-researcher", claudeResearcher],
    ["Codex 0th_researcher", codexResearcher]
  ]) {
    assert.match(source, /challenge_or_session_blocked/, `${name} should name the blocker`);
    assert.match(source, /OpenCLI/, `${name} should route parent toward OpenCLI`);
    assert.match(source, /Browser Kit\/BB Browser/, `${name} should route parent toward Browser Kit`);
    assert.match(source, /not negative evidence|not as evidence that the content is absent/, `${name} should not treat blocked fetch as absence`);
  }
});

test("host-facing docs and Codex wrappers expose the specialist routing contract compactly", () => {
  const claude = read("CLAUDE.md");
  const readme = read("README.md");

  assert.match(claude, /0th remains the workflow orchestrator/);
  assert.match(claude, /references\/specialist-routing\.md/);
  assert.match(readme, /Specialist Routing/);
  assert.match(readme, /capability\/workflow boundary/);

  for (const skillName of ["think", "plan", "build", "research", "ship"]) {
    const wrapper = read(`codex-skills/${skillName}/SKILL.md`);
    const shared = read(`skills/${skillName}/SKILL.md`);

    assert.match(wrapper, /shared workflow/);
    assert.match(shared, /\.\.\/\.\.\/references\/specialist-routing\.md/);
    assert.doesNotMatch(wrapper, /visual_product_design|ios_app_real_env_verification|logged_in_browser_access/);
  }
});
