#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { runOpenLoopBriefGeneration } from "./open-loop-brief.mjs";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { assertNoSecretLikeText } from "./lib/redaction.mjs";
import { resolveAllProjectStateDirs, resolveTaskPaths } from "./runtime-state.mjs";

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
  const evidenceIds = normalizeList(input.evidence_ids ?? input.evidence_id ?? input.evidenceId);
  const sourcePaths = normalizeList(input.source_paths ?? input.source_path ?? input.sourcePath);
  const createdAt = input.created_at ?? now.toISOString();
  const updatedAt = input.updated_at ?? createdAt;

  if (!title) throw new Error("title is required");
  if (!scope) throw new Error("scope is required");
  if (!nextAction) throw new Error("next_action is required");
  assertAllowed("scope", scope, OPEN_LOOP_SCOPES);
  assertAllowed("status", status, OPEN_LOOP_STATUSES);
  assertAllowed("priority", priority, OPEN_LOOP_PRIORITIES);
  if (!evidencePath && sourcePaths.length === 0 && evidenceIds.length === 0) {
    throw new Error("evidence_path, evidence_id, or at least one source_path is required");
  }

  // PR #21 review: open-loop records get the same secret-shape guard as
  // memory claims and evidence records. The `next_action` and `blocked_reason`
  // fields are the most common leak vector — a hurried agent jots
  // "rotate ghp_… and rerun" instead of using a reference.
  assertNoSecretLikeText([
    input.id,
    title,
    nextAction,
    evidencePath,
    maybeText(input.project),
    maybeText(input.repo),
    maybeText(input.owner),
    maybeText(input.blocked_reason ?? input.blockedReason),
    maybeText(input.drop_reason ?? input.dropReason),
    ...evidenceIds,
    ...sourcePaths
  ], "open loop contains secret-like content; redact it before writing");

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
    updated_at: updatedAt,
    history: [
      {
        at: createdAt,
        event: "created",
        status,
        next_action: nextAction
      }
    ]
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
  if (evidenceIds.length > 0) loop.evidence_ids = evidenceIds;
  if (sourcePaths.length > 0) loop.source_paths = sourcePaths;

  return loop;
}

function regenerateBrief({ cwd, taskFile, briefFile, updateBrief }) {
  if (!updateBrief) return null;
  return runOpenLoopBriefGeneration({ cwd, taskFile, outputFile: briefFile });
}

function regenerateBriefSafely({ cwd, taskFile, briefFile, updateBrief }) {
  let brief = null;
  let briefError = null;
  if (updateBrief) {
    try {
      brief = regenerateBrief({ cwd, taskFile, briefFile, updateBrief });
    } catch (err) {
      briefError = err.message;
    }
  }
  return { brief, briefError };
}

export function addOpenLoop({
  cwd = process.cwd(),
  taskFile = null,
  briefFile = null,
  input,
  now = new Date(),
  updateBrief = true
} = {}) {
  const defaults = resolveTaskPaths({ cwd });
  const resolvedTaskFile = taskFile ?? defaults.taskFile;
  const resolvedBriefFile = briefFile ?? (
    taskFile ? path.join(path.dirname(resolvedTaskFile), "brief.md") : defaults.briefFile
  );
  return withFileLock(resolvedTaskFile, (lockState) => {
    const existingLoops = readJsonl(resolvedTaskFile);
    const loop = normalizeOpenLoop(input, { existingLoops, now });
    writeJsonlAtomic(resolvedTaskFile, [...existingLoops, loop]);
    const { brief, briefError } = regenerateBriefSafely({
      cwd,
      taskFile: resolvedTaskFile,
      briefFile: resolvedBriefFile,
      updateBrief
    });

    return {
      task_file: resolvedTaskFile,
      brief_file: updateBrief ? resolvedBriefFile : null,
      id: loop.id,
      status: loop.status,
      priority: loop.priority,
      written: true,
      brief_updated: Boolean(brief),
      brief_error: briefError,
      lock: visibleLockState(lockState)
    };
  });
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
  taskFile = null,
  includeClosed = false,
  status = null,
  allProjects = false
} = {}) {
  const taskFiles = allProjects
    ? resolveAllProjectStateDirs().projectDirs
      .map((projectDir) => path.join(projectDir, "tasks", "open-loops.jsonl"))
      .filter((filePath) => fs.existsSync(filePath))
    : [taskFile ?? resolveTaskPaths({ cwd }).taskFile];
  const loops = taskFiles
    .flatMap((filePath) => readJsonl(filePath).map((loop) => ({ ...loop, task_file: filePath })))
    .filter((loop) => includeClosed || loop.status === "open" || loop.status === "blocked")
    .filter((loop) => !status || loop.status === status)
    .sort(sortLoops);

  return {
    task_file: allProjects ? null : taskFiles[0],
    task_files: taskFiles,
    loop_count: loops.length,
    loops
  };
}

function mergeSourcePaths(existing, next) {
  return normalizeList([...normalizeList(existing), ...normalizeList(next)]);
}

export function updateOpenLoopStatus({
  cwd = process.cwd(),
  taskFile = null,
  briefFile = null,
  id,
  status,
  blockedReason = null,
  dropReason = null,
  nextAction = null,
  evidencePath = null,
  evidenceIds = [],
  sourcePaths = [],
  now = new Date(),
  updateBrief = true
} = {}) {
  if (!id) throw new Error("id is required");
  assertAllowed("status", status, OPEN_LOOP_STATUSES);

  const defaults = resolveTaskPaths({ cwd });
  const resolvedTaskFile = taskFile ?? defaults.taskFile;
  const resolvedBriefFile = briefFile ?? (
    taskFile ? path.join(path.dirname(resolvedTaskFile), "brief.md") : defaults.briefFile
  );
  return withFileLock(resolvedTaskFile, (lockState) => {
    const loops = readJsonl(resolvedTaskFile);
    const index = loops.findIndex((loop) => loop.id === id);
    if (index === -1) throw new Error(`open loop not found: ${id}`);

    // PR #21 review verifier finding C-partial: pre-fix, only the
    // `add` path scanned for secret shapes. Status updates (`block`, `close`,
    // `drop`, `reopen`) accepted `blocked_reason` / `drop_reason` /
    // `next_action` / `evidence_path` / `source_paths` from the caller and
    // wrote them straight into the loop record + history without the
    // redaction guard. The most common leak vector is a hurried `block`
    // reason like "rotate ghp_… and rerun".
    assertNoSecretLikeText([
      maybeText(blockedReason),
      maybeText(dropReason),
      maybeText(nextAction),
      maybeText(evidencePath),
      ...normalizeList(evidenceIds),
      ...normalizeList(sourcePaths)
    ], "open-loop status update contains secret-like content; redact it before writing");

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
      delete next.closed_at;
      delete next.dropped_at;
      delete next.drop_reason;
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
    const mergedEvidenceIds = mergeSourcePaths(next.evidence_ids, evidenceIds);
    if (mergedEvidenceIds.length > 0) next.evidence_ids = mergedEvidenceIds;
    const mergedSourcePaths = mergeSourcePaths(next.source_paths, sourcePaths);
    if (mergedSourcePaths.length > 0) next.source_paths = mergedSourcePaths;

    next.history = [
      ...(Array.isArray(current.history) ? current.history : []),
      {
        at: updatedAt,
        event: status === "open" ? "reopened" : status,
        status,
        blocked_reason: next.blocked_reason,
        drop_reason: next.drop_reason,
        next_action: next.next_action
      }
    ];

    loops[index] = next;
    writeJsonlAtomic(resolvedTaskFile, loops);
    const { brief, briefError } = regenerateBriefSafely({
      cwd,
      taskFile: resolvedTaskFile,
      briefFile: resolvedBriefFile,
      updateBrief
    });

    // Echo back the lifecycle-relevant reason/action fields so the CLI's JSON
    // output self-documents what was recorded; previously the user had to
    // re-read the JSONL to confirm their --blocked-reason / --drop-reason
    // actually landed. This also makes --json-driven invocations testable
    // without coupling tests to the on-disk format.
    return {
      task_file: resolvedTaskFile,
      brief_file: updateBrief ? resolvedBriefFile : null,
      id: next.id,
      status: next.status,
      updated: true,
      brief_updated: Boolean(brief),
      brief_error: briefError,
      blocked_reason: next.blocked_reason ?? null,
      drop_reason: next.drop_reason ?? null,
      next_action: next.next_action ?? null,
      lock: visibleLockState(lockState)
    };
  });
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
    if (token === "--all-projects") {
      options.allProjects = true;
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
    if (token === "--evidence-id") {
      pushListOption(options.explicitInput, "evidence_ids", rest[++index]);
      options.evidenceIds = options.explicitInput.evidence_ids;
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
    "Usage: node scripts/open-loop.mjs <add|list|block|close|drop|reopen> [options]",
    "",
    "add requires --title, --scope, --next-action, and --evidence-path, --source-path, or --evidence-id.",
    "block requires --id and --blocked-reason. drop requires --id and --drop-reason.",
    "The generated task brief in the user-level runtime state directory is updated unless --no-brief is passed.",
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
      status: options.status,
      allProjects: options.allProjects
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
  const evidenceIds = options.evidenceIds ?? fromInput.evidence_ids;
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
      evidenceIds,
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
      evidenceIds,
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
      evidenceIds,
      sourcePaths
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (options.command === "reopen") {
    const result = updateOpenLoopStatus({
      cwd: process.cwd(),
      ...options,
      id,
      status: "open",
      nextAction,
      evidencePath,
      evidenceIds,
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
