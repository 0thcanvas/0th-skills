#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { emitBriefRegenerationFailed, writeStderrLine } from "./lib/diagnostics.mjs";
import { runBriefGeneration } from "./memory-brief.mjs";
import { resolveGlobalSourcePaths, resolveMemoryPaths, resolveRepoStatePaths, resolveTaskPaths } from "./runtime-state.mjs";

const gitFailuresLogged = new Set();

function runGit(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch (err) {
    const code = err?.code ?? "UNKNOWN";
    const key = `${code}:${args[0] ?? "git"}`;
    if (!gitFailuresLogged.has(key)) {
      gitFailuresLogged.add(key);
      const reason = code === "ENOENT"
        ? "`git` binary not found on PATH"
        : `git ${args[0] ?? ""} failed (${code})`;
      writeStderrLine(`warning: ${reason}; repo_drift signal will be incomplete.`);
    }
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

function missingGlobalSourceCandidates(cwd, records) {
  return records.flatMap((record) => {
    const pointers = [
      ...(record.evidence_path ? [record.evidence_path] : []),
      ...(record.evidence_paths ?? []),
      ...(record.source_paths ?? [])
    ];
    return pointers
      .filter((pointer) => !String(pointer).startsWith("sources/"))
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

function daysElapsed(since, maintainedAt) {
  const start = Date.parse(String(since ?? ""));
  const end = Date.parse(String(maintainedAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return (end - start) / (24 * 60 * 60 * 1000);
}

function staleClaimCandidates(claims, maintainedAt) {
  return claims
    .filter((claim) => !["archived", "superseded"].includes(claim.lifecycle_state))
    .map((claim) => {
      const staleAfterDays = Number(claim.stale_after_days ?? claim.review_after_days);
      const elapsed = daysElapsed(claim.last_confirmed_at ?? claim.created_at, maintainedAt);
      if (!Number.isFinite(staleAfterDays) || elapsed == null || elapsed <= staleAfterDays) return null;
      return {
        id: claim.id,
        stale_after_days: staleAfterDays,
        last_confirmed_at: claim.last_confirmed_at ?? claim.created_at,
        days_elapsed: Math.floor(elapsed)
      };
    })
    .filter(Boolean);
}

function expiredSourcePackCandidates(sourcePacks, maintainedAt) {
  return sourcePacks
    .map((pack) => {
      const staleAfterDays = Number(pack.stale_after_days);
      const elapsed = daysElapsed(pack.updated_at ?? pack.created_at, maintainedAt);
      if (!Number.isFinite(staleAfterDays) || elapsed == null || elapsed <= staleAfterDays) return null;
      return {
        id: pack.id,
        source_id: pack.source_id,
        stale_after_days: staleAfterDays,
        updated_at: pack.updated_at ?? pack.created_at,
        days_elapsed: Math.floor(elapsed)
      };
    })
    .filter(Boolean);
}

function orphanLinkCandidates(records, knownIds) {
  return records.flatMap((record) => normalizeIds(record.related_ids)
    .filter((id) => !knownIds.has(id))
    .map((id) => ({ id: record.id, missing_id: id })));
}

function normalizeIds(value) {
  if (value == null) return [];
  const list = Array.isArray(value) ? value : [value];
  return [...new Set(list.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function conflictCandidates(claims) {
  const bySubject = new Map();
  for (const claim of claims) {
    if (!claim.subject_key || ["archived", "superseded"].includes(claim.lifecycle_state)) continue;
    const key = String(claim.subject_key);
    bySubject.set(key, [...(bySubject.get(key) ?? []), claim]);
  }

  return [...bySubject.entries()]
    .map(([subjectKey, group]) => {
      const distinct = new Set(group.map((claim) => String(claim.claim ?? "").trim().toLowerCase()));
      if (group.length < 2 || distinct.size < 2) return null;
      return {
        subject_key: subjectKey,
        ids: group.map((claim) => claim.id).sort(),
        reason: "matching subject_key with different claim text"
      };
    })
    .filter(Boolean);
}

function addReason(reasonsById, id, reason) {
  if (!id) return;
  reasonsById.set(id, new Set([...(reasonsById.get(id) ?? []), reason]));
}

function markNeedsReview({
  claims,
  reasonsById,
  maintainedAt,
  actions
}) {
  let mutated = false;
  const nextClaims = claims.map((claim) => {
    const reasons = reasonsById.get(claim.id);
    if (!reasons) return claim;
    const reason = [...reasons].sort().join("+");
    if (claim.lifecycle_state === "needs_review" && claim.review?.reason === reason) return claim;
    mutated = true;
    actions.push({ action: "marked_needs_review", id: claim.id, reason });
    return {
      ...claim,
      lifecycle_state: "needs_review",
      review: {
        reason,
        marked_at: maintainedAt
      }
    };
  });
  return { mutated, claims: nextClaims };
}

function globalMaintenanceFindings({
  cwd,
  globalClaims,
  sourcePacks,
  maintainedAt
}) {
  const knownIds = new Set([
    ...globalClaims.map((claim) => claim.id).filter(Boolean),
    ...sourcePacks.map((pack) => pack.id).filter(Boolean)
  ]);
  return {
    stale_claims: staleClaimCandidates(globalClaims, maintainedAt),
    duplicate_candidates: duplicateCandidates(globalClaims),
    missing_sources: missingGlobalSourceCandidates(cwd, globalClaims),
    expired_source_packs: expiredSourcePackCandidates(sourcePacks, maintainedAt),
    orphan_links: orphanLinkCandidates(globalClaims, knownIds),
    conflicts: conflictCandidates(globalClaims)
  };
}

export function runMemoryMaintain({
  cwd = process.cwd(),
  memoryFile = null,
  taskFile = null,
  briefFile = null,
  repoStateFile = null,
  globalMemoryFile = null,
  globalBriefFile = null,
  sourceIndexFile = null,
  includeGlobal = true,
  apply = false,
  maintainedAt = new Date().toISOString()
} = {}) {
  const memoryDefaults = resolveMemoryPaths({ cwd });
  const globalMemoryDefaults = resolveMemoryPaths({ cwd, scope: "global" });
  const globalSourceDefaults = resolveGlobalSourcePaths();
  const taskDefaults = resolveTaskPaths({ cwd });
  const resolvedMemoryFile = memoryFile ?? memoryDefaults.memoryFile;
  const resolvedGlobalMemoryFile = globalMemoryFile ?? globalMemoryDefaults.memoryFile;
  const resolvedTaskFile = taskFile ?? taskDefaults.taskFile;
  const resolvedBriefFile = briefFile ?? (
    memoryFile ? path.join(path.dirname(resolvedMemoryFile), "brief.md") : memoryDefaults.briefFile
  );
  const resolvedGlobalBriefFile = globalBriefFile ?? (
    globalMemoryFile ? path.join(path.dirname(resolvedGlobalMemoryFile), "brief.md") : globalMemoryDefaults.briefFile
  );
  const resolvedSourceIndexFile = sourceIndexFile ?? globalSourceDefaults.sourceIndexFile;
  const resolvedRepoStateFile = repoStateFile ?? resolveRepoStatePaths({ cwd }).repoStateFile;

  return withFileLock(resolvedMemoryFile, (lockState) => {
    const claims = readJsonl(resolvedMemoryFile);
    const loops = readJsonl(resolvedTaskFile);
    const globalClaims = includeGlobal ? readJsonl(resolvedGlobalMemoryFile) : [];
    const sourcePacks = includeGlobal ? readJsonl(resolvedSourceIndexFile) : [];
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
    let globalBrief = null;
    let globalBriefError = null;
    let globalLock = null;
    const globalFindings = includeGlobal
      ? globalMaintenanceFindings({
        cwd,
        globalClaims,
        sourcePacks,
        maintainedAt
      })
      : {
        stale_claims: [],
        duplicate_candidates: [],
        missing_sources: [],
        expired_source_packs: [],
        orphan_links: [],
        conflicts: []
      };

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
          emitBriefRegenerationFailed(err);
        }
      }
    }

    if (apply && includeGlobal) {
      globalLock = withFileLock(resolvedGlobalMemoryFile, (innerLockState) => {
        const latestGlobalClaims = readJsonl(resolvedGlobalMemoryFile);
        const latestSourcePacks = readJsonl(resolvedSourceIndexFile);
        const latestFindings = globalMaintenanceFindings({
          cwd,
          globalClaims: latestGlobalClaims,
          sourcePacks: latestSourcePacks,
          maintainedAt
        });
        const reasonsById = new Map();

        for (const entry of latestFindings.stale_claims) addReason(reasonsById, entry.id, "stale_global_claim");
        for (const entry of latestFindings.duplicate_candidates) {
          for (const id of entry.ids.slice(1)) addReason(reasonsById, id, "duplicate_candidate");
        }
        for (const entry of latestFindings.missing_sources) addReason(reasonsById, entry.id, "missing_source");
        for (const entry of latestFindings.orphan_links) addReason(reasonsById, entry.id, "orphan_link");
        for (const entry of latestFindings.conflicts) {
          for (const id of entry.ids) addReason(reasonsById, id, "subject_key_conflict");
        }

        const marked = markNeedsReview({
          claims: latestGlobalClaims,
          reasonsById,
          maintainedAt,
          actions
        });
        if (marked.mutated) {
          writeJsonlAtomic(resolvedGlobalMemoryFile, marked.claims);
          try {
            globalBrief = runBriefGeneration({
              cwd,
              memoryFile: resolvedGlobalMemoryFile,
              outputFile: resolvedGlobalBriefFile,
              scope: "global"
            });
          } catch (err) {
            globalBriefError = err.message;
            emitBriefRegenerationFailed(err);
          }
        }
        return visibleLockState(innerLockState);
      });
    }

    return {
      memory_file: resolvedMemoryFile,
      global_memory_file: includeGlobal ? resolvedGlobalMemoryFile : null,
      source_index_file: includeGlobal ? resolvedSourceIndexFile : null,
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
        repo_drift: drift ? [drift] : [],
        global: globalFindings
      },
      actions,
      brief_updated: Boolean(brief),
      brief_error: briefError,
      global_brief_updated: Boolean(globalBrief),
      global_brief_error: globalBriefError,
      lock: visibleLockState(lockState),
      global_lock: globalLock
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
    if (token === "--global-memory-file") {
      options.globalMemoryFile = argv[++index];
      continue;
    }
    if (token === "--global-brief-file") {
      options.globalBriefFile = argv[++index];
      continue;
    }
    if (token === "--source-index-file") {
      options.sourceIndexFile = argv[++index];
      continue;
    }
    if (token === "--no-global") {
      options.includeGlobal = false;
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
