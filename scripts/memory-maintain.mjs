#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { runBriefGeneration } from "./memory-brief.mjs";
import { resolveMemoryPaths, resolveRepoStatePaths, resolveTaskPaths } from "./runtime-state.mjs";

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function normalizePathPointer(pointer) {
  return String(pointer)
    .replace(/#.*$/, "")
    .replace(/:\d+(?::\d+)?$/, "")
    .replace(/^\.\//, "");
}

function expandHome(pointer) {
  // PR #21 review (claude code-reviewer #8): pre-fix, `~/.0th/x.md` was
  // joined with cwd and reported as missing. Workflow agents that
  // legitimately wrote home-relative paths to evidence saw false-positive
  // `missing_sources` findings. Expand only a leading `~/` (or bare `~`)
  // because POSIX shells do not expand `~` mid-path.
  if (pointer === "~" || pointer === "~/") return os.homedir();
  if (pointer.startsWith("~/")) return path.join(os.homedir(), pointer.slice(2));
  return pointer;
}

function pathExists(cwd, pointer) {
  if (!pointer || /^https?:\/\//.test(pointer) || pointer.startsWith("op://") || pointer.startsWith("doppler://")) return true;
  const expanded = expandHome(String(pointer));
  const normalized = normalizePathPointer(expanded);
  const absolute = path.isAbsolute(normalized) ? normalized : path.join(cwd, normalized);
  return fs.existsSync(absolute);
}

function duplicateCandidates(claims) {
  const byText = new Map();
  for (const claim of claims) {
    const key = String(claim.claim ?? "").trim().toLowerCase();
    if (!key) continue;
    byText.set(key, [...(byText.get(key) ?? []), claim.id]);
  }
  return [...byText.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([claim, ids]) => ({ claim, ids }));
}

function missingSourceCandidates(cwd, records) {
  return records.flatMap((record) => {
    const pointers = [
      ...(record.evidence_path ? [record.evidence_path] : []),
      ...(record.evidence_paths ?? []),
      ...(record.source_paths ?? [])
    ];
    return pointers
      .filter((pointer) => !pathExists(cwd, pointer))
      .map((pointer) => ({ id: record.id, missing_path: pointer }));
  });
}

function repoDrift({ cwd, repoStateFile }) {
  if (!fs.existsSync(repoStateFile)) return null;
  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(repoStateFile, "utf8"));
  } catch {
    return { reason: "repo_state_unreadable", repo_state_file: repoStateFile };
  }
  const currentHead = runGit(cwd, ["rev-parse", "HEAD"]);
  if (!currentHead || !state.last_seen_head || state.last_seen_head === currentHead) return null;
  return {
    reason: "head_changed_since_last_preflight",
    last_seen_head: state.last_seen_head,
    current_head: currentHead,
    repo_state_file: repoStateFile
  };
}

function openLoopFindings(cwd, loops) {
  return loops
    .filter((loop) => loop.status === "open" || loop.status === "blocked")
    .flatMap((loop) => {
      const missing = missingSourceCandidates(cwd, [loop]);
      if (missing.length === 0) return [];
      return missing.map((entry) => ({
        ...entry,
        status: loop.status,
        title: loop.title
      }));
    });
}

export function runMemoryMaintain({
  cwd = process.cwd(),
  memoryFile = null,
  taskFile = null,
  briefFile = null,
  repoStateFile = null,
  apply = false,
  maintainedAt = new Date().toISOString()
} = {}) {
  const memoryDefaults = resolveMemoryPaths({ cwd });
  const taskDefaults = resolveTaskPaths({ cwd });
  const resolvedMemoryFile = memoryFile ?? memoryDefaults.memoryFile;
  const resolvedTaskFile = taskFile ?? taskDefaults.taskFile;
  const resolvedBriefFile = briefFile ?? (
    memoryFile ? path.join(path.dirname(resolvedMemoryFile), "brief.md") : memoryDefaults.briefFile
  );
  const resolvedRepoStateFile = repoStateFile ?? resolveRepoStatePaths({ cwd }).repoStateFile;

  return withFileLock(resolvedMemoryFile, (lockState) => {
    const claims = readJsonl(resolvedMemoryFile);
    const loops = readJsonl(resolvedTaskFile);
    const duplicates = duplicateCandidates(claims);
    const missingSources = missingSourceCandidates(cwd, claims);
    const orphanOpenLoops = openLoopFindings(cwd, loops);
    const drift = repoDrift({ cwd, repoStateFile: resolvedRepoStateFile });
    const needsReview = claims
      .filter((claim) => claim.lifecycle_state === "needs_review")
      .map((claim) => ({ id: claim.id, reason: claim.review?.reason ?? claim.review_caveat ?? "needs_review" }));
    const supersessionCandidates = claims
      .filter((claim) => (claim.supersedes ?? []).length > 0 || (claim.superseded_by ?? []).length > 0)
      .map((claim) => ({
        id: claim.id,
        supersedes: claim.supersedes ?? [],
        superseded_by: claim.superseded_by ?? []
      }));

    const actions = [];
    let updatedClaims = claims;
    let brief = null;
    let briefError = null;

    if (apply && duplicates.length > 0) {
      // PR #21 review NEW1: pre-fix, every duplicate tail was
      // re-marked and `review.marked_at` was overwritten on every apply.
      // Running `memory maintain --apply` twice in a row pushed the same
      // action twice and made `marked_at` an unreliable freshness signal.
      // Fix: skip claims that are already `needs_review` with the same
      // reason — that means a previous apply already handled them and there
      // is no work to do.
      const duplicateIds = new Set(duplicates.flatMap((entry) => entry.ids.slice(1)));
      let mutated = false;
      updatedClaims = claims.map((claim) => {
        if (!duplicateIds.has(claim.id)) return claim;
        if (
          claim.lifecycle_state === "needs_review"
          && claim.review?.reason === "duplicate_candidate"
        ) {
          // Already marked by a previous apply — no-op for idempotency.
          return claim;
        }
        mutated = true;
        actions.push({ action: "marked_needs_review", id: claim.id, reason: "duplicate_candidate" });
        return {
          ...claim,
          lifecycle_state: "needs_review",
          review: {
            reason: "duplicate_candidate",
            marked_at: maintainedAt
          }
        };
      });

      if (mutated) {
        writeJsonlAtomic(resolvedMemoryFile, updatedClaims);
        try {
          brief = runBriefGeneration({ cwd, memoryFile: resolvedMemoryFile, outputFile: resolvedBriefFile });
        } catch (err) {
          briefError = err.message;
        }
      }
    }

    return {
      memory_file: resolvedMemoryFile,
      task_file: resolvedTaskFile,
      repo_state_file: resolvedRepoStateFile,
      checked_at: maintainedAt,
      apply,
      findings: {
        needs_review: needsReview,
        duplicate_candidates: duplicates,
        missing_sources: missingSources,
        orphan_open_loops: orphanOpenLoops,
        supersession_candidates: supersessionCandidates,
        repo_drift: drift ? [drift] : []
      },
      actions,
      brief_updated: Boolean(brief),
      brief_error: briefError,
      lock: visibleLockState(lockState)
    };
  });
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--memory-file") {
      options.memoryFile = argv[++index];
      continue;
    }
    if (token === "--task-file") {
      options.taskFile = argv[++index];
      continue;
    }
    if (token === "--repo-state-file") {
      options.repoStateFile = argv[++index];
      continue;
    }
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function main() {
  const result = runMemoryMaintain({ cwd: process.cwd(), ...parseArgs(process.argv.slice(2)) });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isInvokedAsCli(import.meta.url)) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
