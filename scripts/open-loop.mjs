#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { runOpenLoopBriefGeneration } from "./open-loop-brief.mjs";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";

export const OPEN_LOOP_STATUSES = ["open", "blocked", "done", "dropped"];
export const OPEN_LOOP_PRIORITIES = ["P0", "P1", "P2", "P3"];
export const OPEN_LOOP_SCOPES = ["repo", "project", "global"];

const PRIORITY_ORDER = new Map(OPEN_LOOP_PRIORITIES.map((priority, index) => [priority, index]));

function normalizeList(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "open-loop";
}

function datePart(value) {
  return String(value).slice(0, 10);
}

function assertAllowed(name, value, allowed) {
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
}

function uniqueId({ id, title, scope, createdAt, existingLoops }) {
  const existingIds = new Set(existingLoops.map((entry) => entry.id).filter(Boolean));
  if (id) {
    if (existingIds.has(id)) throw new Error(`open loop id already exists: ${id}`);
    return id;
  }

  const base = `${datePart(createdAt)}-${scope}-${slugify(title)}`;
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function maybeText(value) {
  const text = value == null ? "" : String(value).trim();
  return text || "";
}

export function normalizeOpenLoop(input, {
  existingLoops = [],
  now = new Date()
} = {}) {
  if (!input || typeof input !== "object") {
    throw new Error("input open loop is required");
  }

  const title = maybeText(input.title);
  const scope = maybeText(input.scope);
  const status = maybeText(input.status) || "open";
  const priority = maybeText(input.priority) || "P2";
  const nextAction = maybeText(input.next_action ?? input.nextAction);
  const evidencePath = maybeText(input.evidence_path ?? input.evidencePath);
  const sourcePaths = normalizeList(input.source_paths ?? input.source_path ?? input.sourcePath);
  const createdAt = input.created_at ?? now.toISOString();
  const updatedAt = input.updated_at ?? createdAt;

  if (!title) throw new Error("title is required");
  if (!scope) throw new Error("scope is required");
  if (!nextAction) throw new Error("next_action is required");
  assertAllowed("scope", scope, OPEN_LOOP_SCOPES);
  assertAllowed("status", status, OPEN_LOOP_STATUSES);
  assertAllowed("priority", priority, OPEN_LOOP_PRIORITIES);
  if (!evidencePath && sourcePaths.length === 0) {
    throw new Error("evidence_path or at least one source_path is required");
  }

  const loop = {
    id: uniqueId({
      id: input.id,
      title,
      scope,
      createdAt,
      existingLoops
    }),
    title,
    scope,
    status,
    priority,
    next_action: nextAction,
    created_at: createdAt,
    updated_at: updatedAt
  };

  for (const [key, value] of [
    ["project", input.project],
    ["repo", input.repo],
    ["owner", input.owner],
    ["due_at", input.due_at ?? input.dueAt],
    ["blocked_reason", input.blocked_reason ?? input.blockedReason],
    ["drop_reason", input.drop_reason ?? input.dropReason],
    ["closed_at", input.closed_at ?? input.closedAt],
    ["dropped_at", input.dropped_at ?? input.droppedAt]
  ]) {
    const text = maybeText(value);
    if (text) loop[key] = text;
  }

  if (evidencePath) loop.evidence_path = evidencePath;
  if (sourcePaths.length > 0) loop.source_paths = sourcePaths;

  return loop;
}

function regenerateBrief({ cwd, taskFile, briefFile, updateBrief }) {
  if (!updateBrief) return null;
  return runOpenLoopBriefGeneration({ cwd, taskFile, outputFile: briefFile });
}

export function addOpenLoop({
  cwd = process.cwd(),
  taskFile = path.join(cwd, ".0th", "tasks", "open-loops.jsonl"),
  briefFile = path.join(cwd, ".0th", "tasks", "brief.md"),
  input,
  now = new Date(),
  updateBrief = true
} = {}) {
  const existingLoops = readJsonl(taskFile);
  const loop = normalizeOpenLoop(input, { existingLoops, now });
  writeJsonlAtomic(taskFile, [...existingLoops, loop]);
  const brief = regenerateBrief({ cwd, taskFile, briefFile, updateBrief });

  return {
    task_file: taskFile,
    brief_file: updateBrief ? briefFile : null,
    id: loop.id,
    status: loop.status,
    priority: loop.priority,
    written: true,
    brief_updated: Boolean(brief)
  };
}

function sortLoops(left, right) {
  const statusOrder = { open: 0, blocked: 1, done: 2, dropped: 3 };
  const statusDelta = (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99);
  if (statusDelta !== 0) return statusDelta;
  const priorityDelta = (PRIORITY_ORDER.get(left.priority) ?? 99) - (PRIORITY_ORDER.get(right.priority) ?? 99);
  if (priorityDelta !== 0) return priorityDelta;
  const updatedDelta = String(left.updated_at ?? "").localeCompare(String(right.updated_at ?? ""));
  if (updatedDelta !== 0) return updatedDelta;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

export function listOpenLoops({
  cwd = process.cwd(),
  taskFile = path.join(cwd, ".0th", "tasks", "open-loops.jsonl"),
  includeClosed = false,
  status = null
} = {}) {
  const loops = readJsonl(taskFile)
    .filter((loop) => includeClosed || loop.status === "open" || loop.status === "blocked")
    .filter((loop) => !status || loop.status === status)
    .sort(sortLoops);

  return {
    task_file: taskFile,
    loop_count: loops.length,
    loops
  };
}

function mergeSourcePaths(existing, next) {
  return normalizeList([...normalizeList(existing), ...normalizeList(next)]);
}

export function updateOpenLoopStatus({
  cwd = process.cwd(),
  taskFile = path.join(cwd, ".0th", "tasks", "open-loops.jsonl"),
  briefFile = path.join(cwd, ".0th", "tasks", "brief.md"),
  id,
  status,
  blockedReason = null,
  dropReason = null,
  nextAction = null,
  evidencePath = null,
  sourcePaths = [],
  now = new Date(),
  updateBrief = true
} = {}) {
  if (!id) throw new Error("id is required");
  assertAllowed("status", status, OPEN_LOOP_STATUSES);

  const loops = readJsonl(taskFile);
  const index = loops.findIndex((loop) => loop.id === id);
  if (index === -1) throw new Error(`open loop not found: ${id}`);

  const updatedAt = now.toISOString();
  const current = loops[index];
  const next = {
    ...current,
    status,
    updated_at: updatedAt
  };

  const nextActionText = maybeText(nextAction);
  if (nextActionText) next.next_action = nextActionText;

  const blockedReasonText = maybeText(blockedReason);
  if (status === "blocked") {
    if (!blockedReasonText && !next.blocked_reason) {
      throw new Error("blocked_reason is required when blocking an open loop");
    }
    if (blockedReasonText) next.blocked_reason = blockedReasonText;
  } else if (status === "open") {
    delete next.blocked_reason;
  }

  if (status === "done") {
    next.closed_at = updatedAt;
    delete next.blocked_reason;
  }

  const dropReasonText = maybeText(dropReason);
  if (status === "dropped") {
    if (!dropReasonText && !next.drop_reason) {
      throw new Error("drop_reason is required when dropping an open loop");
    }
    if (dropReasonText) next.drop_reason = dropReasonText;
    next.dropped_at = updatedAt;
    delete next.blocked_reason;
  }

  const evidencePathText = maybeText(evidencePath);
  if (evidencePathText) next.evidence_path = evidencePathText;
  const mergedSourcePaths = mergeSourcePaths(next.source_paths, sourcePaths);
  if (mergedSourcePaths.length > 0) next.source_paths = mergedSourcePaths;

  loops[index] = next;
  writeJsonlAtomic(taskFile, loops);
  const brief = regenerateBrief({ cwd, taskFile, briefFile, updateBrief });

  // Echo back the lifecycle-relevant reason/action fields so the CLI's JSON
  // output self-documents what was recorded; previously the user had to
  // re-read the JSONL to confirm their --blocked-reason / --drop-reason
  // actually landed. This also makes --json-driven invocations testable
  // without coupling tests to the on-disk format.
  return {
    task_file: taskFile,
    brief_file: updateBrief ? briefFile : null,
    id: next.id,
    status: next.status,
    updated: true,
    brief_updated: Boolean(brief),
    blocked_reason: next.blocked_reason ?? null,
    drop_reason: next.drop_reason ?? null,
    next_action: next.next_action ?? null
  };
}

function readJsonArg(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pushListOption(options, key, value) {
  options[key] = [...(options[key] ?? []), value];
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    input: {},
    explicitInput: {},
    updateBrief: true,
    includeClosed: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.input = { ...options.input, ...readJsonArg(rest[++index]) };
      continue;
    }
    if (token === "--task-file") {
      options.taskFile = rest[++index];
      continue;
    }
    if (token === "--brief-output") {
      options.briefFile = rest[++index];
      continue;
    }
    if (token === "--no-brief") {
      options.updateBrief = false;
      continue;
    }
    if (token === "--all") {
      options.includeClosed = true;
      continue;
    }
    if (token === "--status") {
      options.status = rest[++index];
      continue;
    }
    if (token === "--id") {
      options.explicitInput.id = rest[++index];
      options.id = options.explicitInput.id;
      continue;
    }
    if (token === "--title") {
      options.explicitInput.title = rest[++index];
      continue;
    }
    if (token === "--scope") {
      options.explicitInput.scope = rest[++index];
      continue;
    }
    if (token === "--project") {
      options.explicitInput.project = rest[++index];
      continue;
    }
    if (token === "--repo") {
      options.explicitInput.repo = rest[++index];
      continue;
    }
    if (token === "--owner") {
      options.explicitInput.owner = rest[++index];
      continue;
    }
    if (token === "--priority") {
      options.explicitInput.priority = rest[++index];
      continue;
    }
    if (token === "--next-action") {
      options.explicitInput.next_action = rest[++index];
      options.nextAction = options.explicitInput.next_action;
      continue;
    }
    if (token === "--due-at") {
      options.explicitInput.due_at = rest[++index];
      continue;
    }
    if (token === "--evidence-path") {
      options.explicitInput.evidence_path = rest[++index];
      options.evidencePath = options.explicitInput.evidence_path;
      continue;
    }
    if (token === "--source-path") {
      pushListOption(options.explicitInput, "source_paths", rest[++index]);
      options.sourcePaths = options.explicitInput.source_paths;
      continue;
    }
    if (token === "--blocked-reason") {
      options.explicitInput.blocked_reason = rest[++index];
      options.blockedReason = options.explicitInput.blocked_reason;
      continue;
    }
    if (token === "--drop-reason") {
      options.explicitInput.drop_reason = rest[++index];
      options.dropReason = options.explicitInput.drop_reason;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  options.input = { ...options.input, ...options.explicitInput };
  return options;
}

function helpText() {
  return [
    "Usage: node scripts/open-loop.mjs <add|list|block|close|drop> [options]",
    "",
    "add requires --title, --scope, --next-action, and --evidence-path or --source-path.",
    "block requires --id and --blocked-reason. drop requires --id and --drop-reason.",
    "The generated .0th/tasks/brief.md is updated unless --no-brief is passed.",
    ""
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.command || options.help) {
    process.stdout.write(helpText());
    return;
  }

  if (options.command === "add") {
    const result = addOpenLoop({ cwd: process.cwd(), input: options.input, ...options });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (options.command === "list") {
    const result = listOpenLoops({
      cwd: process.cwd(),
      taskFile: options.taskFile,
      includeClosed: options.includeClosed,
      status: options.status
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  // For status-change subcommands, accept fields from either the explicit
  // --<flag> (which sets options.<key>) OR from the --json payload (which
  // populates options.input.<snake_case>). Explicit flags ALWAYS win on
  // conflict, regardless of argv order: an explicit flag sets both
  // options.<key> and options.input.<key>, while --json only updates
  // options.input.<key>. The coalesce below preserves the "explicit
  // beats JSON" rule. If you want JSON to win, omit the explicit flag.
  //
  // The previous version only looked at options.<key>, so `open-loop block
  // --json blk.json` failed with "id is required" even when blk.json
  // contained the id — the JSON value never reached updateOpenLoopStatus.
  const fromInput = options.input ?? {};
  const id = options.id ?? fromInput.id;
  const blockedReason = options.blockedReason ?? fromInput.blocked_reason;
  const dropReason = options.dropReason ?? fromInput.drop_reason;
  const nextAction = options.nextAction ?? fromInput.next_action;
  const evidencePath = options.evidencePath ?? fromInput.evidence_path;
  const sourcePaths = options.sourcePaths ?? fromInput.source_paths;

  if (options.command === "block") {
    const result = updateOpenLoopStatus({
      cwd: process.cwd(),
      ...options,
      id,
      status: "blocked",
      blockedReason,
      nextAction,
      evidencePath,
      sourcePaths
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (options.command === "close") {
    const result = updateOpenLoopStatus({
      cwd: process.cwd(),
      ...options,
      id,
      status: "done",
      evidencePath,
      sourcePaths
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (options.command === "drop") {
    const result = updateOpenLoopStatus({
      cwd: process.cwd(),
      ...options,
      id,
      status: "dropped",
      dropReason,
      evidencePath,
      sourcePaths
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  throw new Error(`Unknown command: ${options.command}`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
