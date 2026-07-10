#!/usr/bin/env node
// Audit (or propagate) the legacy canonical skill memory block. Skills moved
// to references/skills-kernel.md are excluded from this compatibility tool.
//
// Background: PR #19 introduced a ~1.5 KB "Repo Preflight + Memory Brief +
// Open Loop Brief + Memory Integration + Open Loop Integration" preamble
// embedded verbatim in nine SKILL.md files. The cross-review flagged the
// duplication as a maintenance-cost trap: there was no test enforcing
// identity, so a future edit to one file could silently leave the other
// eight contradicting it.
//
// This script gives the contributor two operations:
//   --check   exit 0 if every SKILL.md contains the canonical block
//             exit 1 with a per-file diff summary if any differ
//   --write   replace the in-file block in every SKILL.md with the
//             canonical one (used by humans after editing the reference)
//
// All model-invoked skills now use references/skills-kernel.md, so this tool
// remains only for auditing older checkouts during migration.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isInvokedAsCli } from "./lib/cli.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export const MIGRATED_SKILLS = [
  "build",
  "debug",
  "deep-research",
  "improve-architecture",
  "plan",
  "research",
  "retro",
  "ship",
  "think"
];

export const CORE_SKILLS = [];

const SECTION_HEADINGS = new Set([
  "Repo Preflight",
  "Memory Brief",
  "Open Loop Brief",
  "Memory Integration",
  "Open Loop Integration"
]);

/**
 * Extract the canonical block from references/skill-memory-block.md.
 * The reference file has an HTML comment header followed by the block.
 * Strip the comment and any leading/trailing blank lines.
 */
export function loadCanonicalBlock(root = repoRoot) {
  const refPath = path.join(root, "references", "skill-memory-block.md");
  const source = fs.readFileSync(refPath, "utf8");
  const withoutComment = source.replace(/<!--[\s\S]*?-->\s*\n/, "");
  return withoutComment.trim() + "\n";
}

/**
 * Return the contiguous run of `## <heading>\n\n<body>\n` blocks where the
 * heading is one of SECTION_HEADINGS. Stops at the first `## ` line that is
 * NOT one of the five memory headings (or end of file).
 */
export function extractBlockFromSkill(skillPath) {
  const lines = fs.readFileSync(skillPath, "utf8").split("\n");
  const collected = [];
  let inBlock = false;

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      if (SECTION_HEADINGS.has(headingMatch[1])) {
        inBlock = true;
      } else if (inBlock) {
        // First non-memory heading: end of block.
        break;
      }
    }
    if (inBlock) collected.push(line);
  }

  // Trim trailing blank lines, then re-add a single newline so the block
  // ends cleanly.
  while (collected.length > 0 && collected[collected.length - 1] === "") {
    collected.pop();
  }
  return collected.length ? collected.join("\n") + "\n" : "";
}

/**
 * Check every core SKILL.md against the canonical block. Returns an array
 * of { skill, status, actualBytes, canonicalBytes } records. `status` is
 * "ok", "missing" (no block found), or "diff".
 */
export function auditSkills({ root = repoRoot, canonical = loadCanonicalBlock(root) } = {}) {
  return CORE_SKILLS.map((skill) => {
    const skillPath = path.join(root, "skills", skill, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      return { skill, status: "missing", actualBytes: 0, canonicalBytes: canonical.length };
    }
    const actual = extractBlockFromSkill(skillPath);
    if (!actual) {
      return { skill, status: "missing", actualBytes: 0, canonicalBytes: canonical.length };
    }
    if (actual === canonical) {
      return { skill, status: "ok", actualBytes: actual.length, canonicalBytes: canonical.length };
    }
    return { skill, status: "diff", actualBytes: actual.length, canonicalBytes: canonical.length };
  });
}

/**
 * Replace each SKILL.md's block with the canonical one in place.
 * The block start is the first "## Repo Preflight" header; the block end
 * is the first "## " heading that is not one of the five memory sections.
 */
export function writeCanonicalIntoSkill(skillPath, canonical) {
  const source = fs.readFileSync(skillPath, "utf8");
  const lines = source.split("\n");
  let blockStart = -1;
  let blockEnd = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const headingMatch = lines[index].match(/^## (.+)$/);
    if (!headingMatch) continue;
    if (blockStart === -1 && headingMatch[1] === "Repo Preflight") {
      blockStart = index;
      continue;
    }
    if (blockStart !== -1 && !SECTION_HEADINGS.has(headingMatch[1])) {
      blockEnd = index;
      break;
    }
  }
  if (blockStart === -1) {
    throw new Error(`${skillPath} has no "## Repo Preflight" section to replace`);
  }
  // If the block extends to end of file, blockEnd stays -1 and we replace
  // through end of file. Preserve any trailing newline structure.
  const head = lines.slice(0, blockStart).join("\n");
  const tail = blockEnd === -1 ? "" : lines.slice(blockEnd).join("\n");
  const middle = canonical.replace(/\n+$/, "");
  const next = blockEnd === -1
    ? `${head}\n${middle}\n`
    : `${head}\n${middle}\n\n${tail}`;
  fs.writeFileSync(skillPath, next);
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--write") ? "write" : "check";
  const canonical = loadCanonicalBlock();
  const audit = auditSkills({ canonical });

  if (mode === "write") {
    let changed = 0;
    for (const entry of audit) {
      if (entry.status === "ok") continue;
      const skillPath = path.join(repoRoot, "skills", entry.skill, "SKILL.md");
      writeCanonicalIntoSkill(skillPath, canonical);
      process.stdout.write(`updated ${entry.skill}/SKILL.md\n`);
      changed += 1;
    }
    process.stdout.write(`skill-block-sync: ${changed} file(s) updated\n`);
    process.exit(0);
  }

  const failures = audit.filter((entry) => entry.status !== "ok");
  if (failures.length === 0) {
    process.stdout.write(`skill-block-sync: ${audit.length} file(s) in sync\n`);
    process.exit(0);
  }
  for (const entry of failures) {
    process.stderr.write(`skill-block-sync: ${entry.skill}/SKILL.md ${entry.status} (${entry.actualBytes}/${entry.canonicalBytes} bytes)\n`);
  }
  process.stderr.write(
    `skill-block-sync: re-run with --write to apply references/skill-memory-block.md to all SKILL.md files\n`
  );
  process.exit(1);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
