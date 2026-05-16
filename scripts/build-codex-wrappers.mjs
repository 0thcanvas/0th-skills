#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, "skills");
const codexSkillsRoot = path.join(repoRoot, "codex-skills");

const codexDescriptions = {
  build: "Use when coding a known change with TDD.",
  debug: "Use when failures need root cause before fixes.",
  "deep-research": "Use when hard questions need deeper research.",
  "improve-architecture": "Use when code needs architecture cleanup.",
  plan: "Use when decisions need build slices.",
  research: "Use when answers need external sources.",
  retro: "Use when session lessons need logging.",
  ship: "Use when work needs PR shipping.",
  think: "Use when ideas need decisions.",
  "zoom-out": "Use when asked to map unfamiliar code."
};

const codexWrapperNotes = {
  research: [
    "Codex dispatch note: use `spawn_agent` for research subquestions. If `0th_researcher` is not an `agent_type`, use `agent_type: default`, `model: gpt-5.4`, and `reasoning_effort: medium` with a self-contained `0th_researcher fallback` prompt.",
    "Do not continue in the main thread solely because the named agent is unavailable; main-thread search is only for when `spawn_agent` fails."
  ],
  "deep-research": [
    "Codex dispatch note: phases 1, 2, 5, and 6 dispatch subagents. If named `0th_*` agents are not `agent_type` choices, use `spawn_agent` fallback roles from the shared workflow with `model: gpt-5.4` and explicit `reasoning_effort` pins.",
    "Do not continue in the main thread solely because a named agent is unavailable; main-thread execution is only for when `spawn_agent` fails."
  ]
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listSkillNames() {
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function parseFrontmatter(source, skillName) {
  const match = source.replace(/\r\n?/g, "\n").match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    fail(`skills/${skillName}/SKILL.md is missing frontmatter.`);
  }

  const data = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const fieldMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!fieldMatch) {
      fail(`Unsupported frontmatter line in skills/${skillName}/SKILL.md: ${line}`);
    }
    data[fieldMatch[1]] = fieldMatch[2];
  }
  return data;
}

function titleFor(skillName) {
  return skillName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function generateWrapper(skillName) {
  const source = read(path.join(skillsRoot, skillName, "SKILL.md"));
  const frontmatter = parseFrontmatter(source, skillName);
  const name = frontmatter.name?.replace(/^"|"$/g, "") || skillName;
  const description = codexDescriptions[skillName];
  if (!description) {
    fail(`Missing compact Codex description for ${skillName} in scripts/build-codex-wrappers.mjs.`);
  }

  const lines = [
    "---",
    `name: ${name}`,
    `description: "${description}"`
  ];
  if (frontmatter["disable-model-invocation"]) {
    lines.push(`disable-model-invocation: ${frontmatter["disable-model-invocation"]}`);
  }
  lines.push(
    "---",
    "",
    `# ${titleFor(name)}`,
    "",
    `Read the [shared workflow](../../skills/${name}/SKILL.md) before acting. It is the source of truth; this Codex wrapper omits Claude-only \`argument-hint\`.`
  );
  for (const note of codexWrapperNotes[skillName] ?? []) {
    lines.push("", note);
  }
  lines.push("");
  return `${lines.join("\n")}`;
}

function readCurrent(skillName) {
  const filePath = path.join(codexSkillsRoot, skillName, "SKILL.md");
  return fs.existsSync(filePath) ? read(filePath) : null;
}

function writeWrapper(skillName, source) {
  const dirPath = path.join(codexSkillsRoot, skillName);
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(path.join(dirPath, "SKILL.md"), source);
}

function parseArgs(argv) {
  const options = { check: false, dryRun: false };
  for (const arg of argv) {
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write("Usage: node scripts/build-codex-wrappers.mjs [--check|--dry-run]\n");
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const skillNames = listSkillNames();
  const generated = new Map(skillNames.map((skillName) => [skillName, generateWrapper(skillName)]));

  if (options.dryRun) {
    for (const [skillName, source] of generated) {
      process.stdout.write(`# codex-skills/${skillName}/SKILL.md\n${source}`);
    }
    return;
  }

  if (options.check) {
    const drift = [];
    for (const [skillName, source] of generated) {
      if (readCurrent(skillName) !== source) {
        drift.push(skillName);
      }
    }
    if (fs.existsSync(codexSkillsRoot)) {
      const expected = new Set(skillNames);
      for (const entry of fs.readdirSync(codexSkillsRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && !expected.has(entry.name)) {
          drift.push(`${entry.name} (orphan)`);
        }
      }
    }
    if (drift.length > 0) {
      fail(`Codex wrappers are out of date:\n${drift.map((name) => `- ${name}`).join("\n")}\nRun: node scripts/build-codex-wrappers.mjs`);
    }
    process.stdout.write(`Codex wrappers are in sync (${generated.size} skills).\n`);
    return;
  }

  let wrote = 0;
  for (const [skillName, source] of generated) {
    if (readCurrent(skillName) === source) continue;
    writeWrapper(skillName, source);
    wrote += 1;
  }
  process.stdout.write(
    wrote === 0
      ? `No changes; ${generated.size} Codex wrappers already in sync.\n`
      : `Regenerated ${wrote} of ${generated.size} Codex wrappers.\n`
  );
}

main();
