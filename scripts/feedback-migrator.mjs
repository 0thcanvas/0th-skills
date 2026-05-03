import fs from "node:fs";
import path from "node:path";

function readLinesIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8").split("\n");
}

function buildTrimmedSet(lines) {
  const set = new Set();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    set.add(trimmed);
  }
  return set;
}

export function computeNonTemplateLines({ feedbackPath, examplePath }) {
  if (!fs.existsSync(feedbackPath)) return [];
  const feedbackLines = readLinesIfExists(feedbackPath);
  const exampleSet = buildTrimmedSet(readLinesIfExists(examplePath));

  const result = [];
  const seen = new Set();
  for (const line of feedbackLines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (exampleSet.has(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function migrate({ feedbackPath, examplePath, destinationPath, dryRun = false }) {
  const nonTemplate = computeNonTemplateLines({ feedbackPath, examplePath });
  if (nonTemplate.length === 0) {
    return { needed: false, missingLines: [], appendedLines: null };
  }

  const destSet = buildTrimmedSet(readLinesIfExists(destinationPath));
  const missing = nonTemplate.filter((line) => !destSet.has(line));

  if (missing.length === 0) {
    return { needed: false, missingLines: [], appendedLines: null };
  }

  if (dryRun) {
    return { needed: true, missingLines: missing, appendedLines: null };
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const existed = fs.existsSync(destinationPath);
  const appendBlock = (existed ? "" : "") + missing.join("\n") + "\n";
  fs.appendFileSync(destinationPath, appendBlock);

  return { needed: true, missingLines: missing, appendedLines: missing };
}

function parseCliArgs(argv) {
  const args = { feedback: null, example: null, dest: null, dryRun: false, showLines: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--feedback") args.feedback = value;
    else if (flag === "--example") args.example = value;
    else if (flag === "--dest") args.dest = value;
    else if (flag === "--dry-run") args.dryRun = true;
    else if (flag === "--show-lines") args.showLines = true;
  }
  return args;
}

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMainModule) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.feedback || !args.example || !args.dest) {
    console.error(
      "Usage: feedback-migrator.mjs --feedback <path> --example <path> --dest <path> [--dry-run]"
    );
    process.exit(2);
  }
  const result = migrate({
    feedbackPath: args.feedback,
    examplePath: args.example,
    destinationPath: args.dest,
    dryRun: args.dryRun,
  });
  // By default, the CLI emits counts only — feedback content (which the user wrote
  // in their own repo) should not leak through stdout into transcripts or
  // counterpart-review prompts. `--show-lines` is the explicit opt-in for debugging.
  const output = {
    needed: result.needed,
    missingCount: result.missingLines.length,
    appendedCount: result.appendedLines ? result.appendedLines.length : null,
  };
  if (args.showLines) {
    output.missingLines = result.missingLines;
    output.appendedLines = result.appendedLines;
  }
  console.log(JSON.stringify(output, null, 2));
}
