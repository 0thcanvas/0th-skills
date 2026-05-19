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
import { aggregate as aggregateRetroIncidents } from "./retro-aggregator.mjs";
import { resolveGlobalSourcePaths, resolveMemoryPaths, resolveProjectIdentity, resolveRepoStatePaths, resolveStateRoot, resolveTaskPaths } from "./runtime-state.mjs";

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

function readOwnerRoot(record, {
  env = process.env,
  homeDir = os.homedir()
} = {}) {
  if (record.owner_project_root) return String(record.owner_project_root);
  if (!record.owner_project_key) return null;
  const repoStateFile = path.join(
    resolveStateRoot({ env, homeDir }),
    "projects",
    String(record.owner_project_key),
    "repo",
    "state.json"
  );
  try {
    const state = JSON.parse(fs.readFileSync(repoStateFile, "utf8"));
    return state.repo_root ?? null;
  } catch {
    return null;
  }
}

function ownerContextFor(cwd, record) {
  const ownerRoot = readOwnerRoot(record);
  return {
    owner_project_key: record.owner_project_key ?? null,
    owner_project_root: ownerRoot,
    owner_project_identity: record.owner_project_identity ?? null,
    fallback_cwd: path.resolve(cwd)
  };
}

function sourcePointer(pointer) {
  return /^https?:\/\//.test(pointer)
    || pointer.startsWith("op://")
    || pointer.startsWith("doppler://")
    || pointer.startsWith("sources/");
}

function resolvePointerPath(cwd, record, pointer) {
  if (!pointer || sourcePointer(String(pointer))) {
    return {
      exists: true,
      absolute: null,
      base: null,
      owner_context: ownerContextFor(cwd, record)
    };
  }
  const expanded = expandHome(String(pointer));
  const normalized = normalizePathPointer(expanded);
  const ownerRoot = readOwnerRoot(record);
  const base = path.isAbsolute(normalized) ? null : ownerRoot ?? path.resolve(cwd);
  const absolute = path.isAbsolute(normalized) ? normalized : path.join(base, normalized);
  return {
    exists: fs.existsSync(absolute),
    absolute,
    base,
    owner_context: ownerContextFor(cwd, record)
  };
}

function archivedRawCandidate(absolutePath) {
  if (!absolutePath) return null;
  const normalized = path.normalize(absolutePath);
  const marker = `${path.sep}raw${path.sep}`;
  if (!normalized.includes(marker) || normalized.includes(`${path.sep}raw${path.sep}archived${path.sep}`)) return null;
  const candidate = normalized.replace(marker, `${path.sep}raw${path.sep}archived${path.sep}`);
  return fs.existsSync(candidate) ? candidate : null;
}

function displayPointerFor(originalPointer, absolutePath) {
  if (path.isAbsolute(String(originalPointer))) return absolutePath;
  return String(originalPointer).replace(/(^|\/)raw\//, "$1raw/archived/");
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

function compactableClaims(claims) {
  return claims.filter((claim) => !["archived", "superseded"].includes(claim.lifecycle_state));
}

function compactionCandidates(claims) {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const candidates = [];
  const seen = new Set();
  const activeClaims = compactableClaims(claims);

  for (const entry of duplicateCandidates(activeClaims)) {
    const ids = entry.ids.sort();
    const key = ids.join("\0");
    seen.add(key);
    candidates.push({
      reason: "duplicate_claim_text",
      ids,
      suggested_type: byId.get(ids[0])?.type ?? "observation",
      suggested_evidence_path: byId.get(ids.at(-1))?.evidence_path ?? byId.get(ids[0])?.evidence_path ?? null
    });
  }

  for (const claim of activeClaims) {
    const supersedes = normalizeIds(claim.supersedes);
    if (supersedes.length === 0) continue;
    const activeSupersededIds = supersedes
      .filter((id) => byId.has(id))
      .filter((id) => !["archived", "superseded"].includes(byId.get(id).lifecycle_state));
    if (activeSupersededIds.length === 0) continue;
    const ids = [...new Set([...activeSupersededIds, claim.id])].sort();
    const key = ids.join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      reason: "declared_supersession_chain",
      ids,
      suggested_type: claim.type,
      suggested_evidence_path: claim.evidence_path ?? null
    });
  }

  return candidates.sort((a, b) => a.reason.localeCompare(b.reason) || a.ids.join(",").localeCompare(b.ids.join(",")));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "incident-pattern";
}

function pointerEntries(record) {
  return [
    ...(record.evidence_path ? [{ field: "evidence_path", pointer: record.evidence_path }] : []),
    ...((record.evidence_paths ?? []).map((pointer) => ({ field: "evidence_paths", pointer }))),
    ...((record.source_paths ?? []).map((pointer) => ({ field: "source_paths", pointer })))
  ];
}

function sourceFindings(cwd, records) {
  return records.flatMap((record) => {
    return pointerEntries(record).flatMap(({ field, pointer }) => {
      const resolved = resolvePointerPath(cwd, record, pointer);
      if (resolved.exists) return [];
      const relocatedAbsolute = archivedRawCandidate(resolved.absolute);
      const base = {
        id: record.id,
        field,
        missing_path: pointer,
        resolved_path: resolved.absolute,
        owner_context: resolved.owner_context
      };
      if (relocatedAbsolute) {
        return [{
          ...base,
          relocated_path: displayPointerFor(pointer, relocatedAbsolute),
          relocated_absolute_path: relocatedAbsolute
        }];
      }
      return [base];
    });
  });
}

function ancestorDirs(start) {
  const dirs = [];
  let current = path.resolve(start);
  const home = os.homedir();
  while (true) {
    dirs.push(current);
    if (current === home || current === path.dirname(current)) break;
    current = path.dirname(current);
  }
  return dirs;
}

function ownerContextRepairCandidates(cwd, missingSources) {
  return missingSources.flatMap((entry) => {
    const pointer = String(entry.missing_path ?? "");
    if (!pointer || path.isAbsolute(pointer) || sourcePointer(pointer)) return [];
    if (entry.owner_context?.owner_project_root) return [];
    const normalized = normalizePathPointer(expandHome(pointer));
    return ancestorDirs(cwd).flatMap((candidateRoot) => {
      const resolvedPath = path.join(candidateRoot, normalized);
      if (!fs.existsSync(resolvedPath)) return [];
      if (path.resolve(candidateRoot) === path.resolve(cwd)) return [];
      const identity = resolveProjectIdentity({ cwd: candidateRoot });
      return [{
        id: entry.id,
        field: entry.field,
        missing_path: entry.missing_path,
        owner_project_key: identity.project_key,
        owner_project_root: identity.repo_root,
        owner_project_identity: identity.identity,
        resolved_path: resolvedPath
      }];
    });
  });
}

function applyOwnerContextRepairs({ claims, repairs, actions }) {
  if (repairs.length === 0) return { mutated: false, claims };
  const byId = new Map();
  for (const repair of repairs) {
    if (!byId.has(repair.id)) byId.set(repair.id, repair);
  }
  let mutated = false;
  const nextClaims = claims.map((claim) => {
    const repair = byId.get(claim.id);
    if (!repair) return claim;
    mutated = true;
    actions.push({
      action: "repaired_owner_context",
      id: claim.id,
      owner_project_root: repair.owner_project_root,
      evidence_path: repair.missing_path
    });
    return {
      ...claim,
      owner_project_key: repair.owner_project_key,
      owner_project_root: repair.owner_project_root,
      owner_project_identity: repair.owner_project_identity
    };
  });
  return { mutated, claims: nextClaims };
}

function missingSourceCandidates(cwd, records) {
  return sourceFindings(cwd, records).filter((entry) => !entry.relocated_path);
}

function relocationCandidates(cwd, records) {
  return sourceFindings(cwd, records).filter((entry) => entry.relocated_path);
}

function missingGlobalSourceCandidates(cwd, records) {
  return missingSourceCandidates(cwd, records);
}

function globalRelocationCandidates(cwd, records) {
  return relocationCandidates(cwd, records);
}

function rewritePointer(record, entry) {
  if (entry.field === "evidence_path") {
    return { ...record, evidence_path: entry.relocated_path };
  }
  const current = record[entry.field] ?? [];
  return {
    ...record,
    [entry.field]: current.map((pointer) => pointer === entry.missing_path ? entry.relocated_path : pointer)
  };
}

function applyRelocations({ claims, relocations, actions }) {
  if (relocations.length === 0) return { mutated: false, claims };
  const byId = new Map();
  for (const entry of relocations) {
    byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry]);
  }
  let mutated = false;
  const nextClaims = claims.map((claim) => {
    let next = claim;
    for (const entry of byId.get(claim.id) ?? []) {
      next = rewritePointer(next, entry);
      mutated = true;
      actions.push({
        action: "repaired_evidence_pointer",
        id: claim.id,
        field: entry.field,
        from: entry.missing_path,
        to: entry.relocated_path
      });
    }
    return next;
  });
  return { mutated, claims: nextClaims };
}

function defaultIncidentDir(env = process.env) {
  return env.KB_ROOT ? path.join(env.KB_ROOT, "learning", "skill-incidents") : null;
}

function incidentPatternCandidates({ incidentDir, maintainedAt }) {
  if (!incidentDir || !fs.existsSync(incidentDir)) return [];
  const result = aggregateRetroIncidents({
    directoryPath: incidentDir,
    currentRunAt: maintainedAt
  });
  return result.patterns.map((pattern) => ({
    ...pattern,
    id: `incident-pattern-${slugify(`${pattern.bucketType}-${pattern.bucketKey}`)}`
  }));
}

function importIncidentPatterns({ claims, patterns, maintainedAt, actions }) {
  const existingIds = new Set(claims.map((claim) => claim.id));
  const imported = [];
  for (const pattern of patterns) {
    if (existingIds.has(pattern.id)) continue;
    const sourcePaths = pattern.priorEntries ?? [];
    if (sourcePaths.length === 0) continue;
    imported.push({
      id: pattern.id,
      type: "incident",
      claim: `Recurring incident pattern: ${pattern.bucketKey} crossed ${pattern.count} entries (${pattern.bucketType}).`,
      scope: "repo",
      lifecycle_state: "active",
      created_at: maintainedAt,
      last_confirmed_at: maintainedAt,
      confidence: "medium",
      source_paths: sourcePaths
    });
    actions.push({ action: "imported_incident_pattern", id: pattern.id, bucket_key: pattern.bucketKey });
    existingIds.add(pattern.id);
  }
  return {
    mutated: imported.length > 0,
    claims: imported.length > 0 ? [...claims, ...imported] : claims
  };
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

function instructionDriftFindings(cwd) {
  return ["CLAUDE.md", "AGENTS.md"]
    .map((name) => path.join(cwd, name))
    .filter((filePath) => fs.existsSync(filePath))
    .flatMap((filePath) => {
      let text = "";
      try {
        text = fs.readFileSync(filePath, "utf8");
      } catch {
        return [];
      }
      const requiresLegacyKbStart = /Read\s+`?index\.md`?.{0,80}(session start|every session|Always)/is.test(text)
        || /read the KB index at every session/i.test(text);
      const namesMemoryV2 = /Memory v2 runtime is the canonical agent recall path/i.test(text)
        || /generated briefs before browsing indexes/i.test(text);
      if (!requiresLegacyKbStart || namesMemoryV2) return [];
      return [{
        file: filePath,
        reason: "legacy_kb_startup_before_memory_v2",
        recommendation: "Align startup instructions with the shared Memory v2 block: generated briefs first, markdown KB as fallback/source evidence."
      }];
    });
}

function isGitTracked(cwd, relativePath) {
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", relativePath], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}

function isGitIgnored(cwd, relativePath) {
  try {
    execFileSync("git", ["check-ignore", "--quiet", relativePath], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}

function localArtifactFindings(cwd) {
  const candidates = ["error.log"];
  return candidates
    .filter((relativePath) => fs.existsSync(path.join(cwd, relativePath)))
    .filter((relativePath) => !isGitTracked(cwd, relativePath))
    .filter((relativePath) => !isGitIgnored(cwd, relativePath))
    .map((relativePath) => ({
      path: path.join(cwd, relativePath),
      reason: "generated_local_log",
      recommendation: "Move generated tool logs to the Memory v2 state root or add an explicit ignore rule if this artifact is expected."
    }));
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
  const missingSources = missingGlobalSourceCandidates(cwd, globalClaims);
  return {
    stale_claims: staleClaimCandidates(globalClaims, maintainedAt),
    duplicate_candidates: duplicateCandidates(globalClaims),
    compaction_candidates: compactionCandidates(globalClaims),
    missing_sources: missingSources,
    owner_context_candidates: ownerContextRepairCandidates(cwd, missingSources),
    relocatable_sources: globalRelocationCandidates(cwd, globalClaims),
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
  incidentDir = null,
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
  const resolvedIncidentDir = incidentDir ?? defaultIncidentDir();

  return withFileLock(resolvedMemoryFile, (lockState) => {
    const claims = readJsonl(resolvedMemoryFile);
    const loops = readJsonl(resolvedTaskFile);
    const globalClaims = includeGlobal ? readJsonl(resolvedGlobalMemoryFile) : [];
    const sourcePacks = includeGlobal ? readJsonl(resolvedSourceIndexFile) : [];
    const duplicates = duplicateCandidates(claims);
    const compactable = compactionCandidates(claims);
    const missingSources = missingSourceCandidates(cwd, claims);
    const relocatableSources = relocationCandidates(cwd, claims);
    const ownerContextCandidates = ownerContextRepairCandidates(cwd, missingSources);
    const incidentPatterns = incidentPatternCandidates({ incidentDir: resolvedIncidentDir, maintainedAt });
    const orphanOpenLoops = openLoopFindings(cwd, loops);
    const drift = repoDrift({ cwd, repoStateFile: resolvedRepoStateFile });
    const instructionDrift = instructionDriftFindings(cwd);
    const localArtifacts = localArtifactFindings(cwd);
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
        compaction_candidates: [],
        missing_sources: [],
        owner_context_candidates: [],
        relocatable_sources: [],
        expired_source_packs: [],
        orphan_links: [],
        conflicts: []
      };

    if (apply && relocatableSources.length > 0) {
      const relocated = applyRelocations({
        claims: updatedClaims,
        relocations: relocatableSources,
        actions
      });
      if (relocated.mutated) {
        updatedClaims = relocated.claims;
        writeJsonlAtomic(resolvedMemoryFile, updatedClaims);
        try {
          brief = runBriefGeneration({ cwd, memoryFile: resolvedMemoryFile, outputFile: resolvedBriefFile });
        } catch (err) {
          briefError = err.message;
          emitBriefRegenerationFailed(err);
        }
      }
    }

    if (apply && ownerContextCandidates.length > 0) {
      const repaired = applyOwnerContextRepairs({
        claims: updatedClaims,
        repairs: ownerContextCandidates,
        actions
      });
      if (repaired.mutated) {
        updatedClaims = repaired.claims;
        writeJsonlAtomic(resolvedMemoryFile, updatedClaims);
        try {
          brief = runBriefGeneration({ cwd, memoryFile: resolvedMemoryFile, outputFile: resolvedBriefFile });
        } catch (err) {
          briefError = err.message;
          emitBriefRegenerationFailed(err);
        }
      }
    }

    if (apply && incidentPatterns.length > 0) {
      const imported = importIncidentPatterns({
        claims: updatedClaims,
        patterns: incidentPatterns,
        maintainedAt,
        actions
      });
      if (imported.mutated) {
        updatedClaims = imported.claims;
        writeJsonlAtomic(resolvedMemoryFile, updatedClaims);
        try {
          brief = runBriefGeneration({ cwd, memoryFile: resolvedMemoryFile, outputFile: resolvedBriefFile });
        } catch (err) {
          briefError = err.message;
          emitBriefRegenerationFailed(err);
        }
      }
    }

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
      updatedClaims = updatedClaims.map((claim) => {
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
        const relocated = applyRelocations({
          claims: latestGlobalClaims,
          relocations: latestFindings.relocatable_sources,
          actions
        });
        let workingGlobalClaims = latestGlobalClaims;
        if (relocated.mutated) {
          workingGlobalClaims = relocated.claims;
          writeJsonlAtomic(resolvedGlobalMemoryFile, workingGlobalClaims);
        }
        const repairedOwners = applyOwnerContextRepairs({
          claims: workingGlobalClaims,
          repairs: latestFindings.owner_context_candidates,
          actions
        });
        const repairedOwnerIds = new Set(latestFindings.owner_context_candidates.map((entry) => entry.id));
        if (repairedOwners.mutated) {
          workingGlobalClaims = repairedOwners.claims;
          writeJsonlAtomic(resolvedGlobalMemoryFile, workingGlobalClaims);
        }
        const reasonsById = new Map();

        for (const entry of latestFindings.stale_claims) addReason(reasonsById, entry.id, "stale_global_claim");
        for (const entry of latestFindings.duplicate_candidates) {
          for (const id of entry.ids.slice(1)) addReason(reasonsById, id, "duplicate_candidate");
        }
        for (const entry of latestFindings.missing_sources) {
          if (!repairedOwnerIds.has(entry.id)) addReason(reasonsById, entry.id, "missing_source");
        }
        for (const entry of latestFindings.orphan_links) addReason(reasonsById, entry.id, "orphan_link");
        for (const entry of latestFindings.conflicts) {
          for (const id of entry.ids) addReason(reasonsById, id, "subject_key_conflict");
        }

        const marked = markNeedsReview({
          claims: workingGlobalClaims,
          reasonsById,
          maintainedAt,
          actions
        });
        if (marked.mutated || relocated.mutated || repairedOwners.mutated) {
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
      incident_dir: resolvedIncidentDir,
      task_file: resolvedTaskFile,
      repo_state_file: resolvedRepoStateFile,
      checked_at: maintainedAt,
      apply,
      findings: {
        needs_review: needsReview,
        duplicate_candidates: duplicates,
        compaction_candidates: compactable,
        missing_sources: missingSources,
        owner_context_candidates: ownerContextCandidates,
        relocatable_sources: relocatableSources,
        incident_patterns: incidentPatterns,
        orphan_open_loops: orphanOpenLoops,
        supersession_candidates: supersessionCandidates,
        repo_drift: drift ? [drift] : [],
        instruction_drift: instructionDrift,
        local_artifacts: localArtifacts,
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
    if (token === "--incident-dir") {
      options.incidentDir = argv[++index];
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
