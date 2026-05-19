#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { isInvokedAsCli } from "./lib/cli.mjs";
import { readJsonl, writeJsonlAtomic } from "./lib/jsonl.mjs";
import { visibleLockState, withFileLock } from "./lib/lock.mjs";
import { emitBriefRegenerationFailed } from "./lib/diagnostics.mjs";
import { runBriefGeneration } from "./memory-brief.mjs";
import { normalizeMemoryClaim } from "./memory-write.mjs";
import { resolveMemoryPaths, resolveProjectIdentity } from "./runtime-state.mjs";

function normalizeIds(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))].sort();
}

function withOwnerContext(input, cwd) {
  const identity = resolveProjectIdentity({ cwd });
  return {
    ...input,
    owner_project_key: input.owner_project_key ?? identity.project_key,
    owner_project_root: input.owner_project_root ?? identity.repo_root,
    owner_project_identity: input.owner_project_identity ?? identity.identity
  };
}

export function compactMemoryClaims({
  cwd = process.cwd(),
  memoryFile = null,
  briefFile = null,
  ids = [],
  input,
  now = new Date(),
  updateBrief = true,
  dryRun = false
} = {}) {
  const compactedIds = normalizeIds(ids);
  if (compactedIds.length < 2) {
    throw new Error("at least two claim ids are required for compaction");
  }
  if (!input || typeof input !== "object") {
    throw new Error("summary memory claim input is required");
  }

  const scope = input.scope ?? "repo";
  const defaults = resolveMemoryPaths({ cwd, scope });
  if (scope === "global" && memoryFile && path.resolve(memoryFile) !== path.resolve(defaults.memoryFile)) {
    throw new Error("global memory compaction must use the global memory file; omit --memory-file for global writes");
  }
  const resolvedMemoryFile = memoryFile ?? defaults.memoryFile;
  const resolvedBriefFile = briefFile ?? (
    memoryFile ? path.join(path.dirname(resolvedMemoryFile), "brief.md") : defaults.briefFile
  );

  return withFileLock(resolvedMemoryFile, (lockState) => {
    const claims = readJsonl(resolvedMemoryFile);
    const byId = new Map(claims.map((claim) => [claim.id, claim]));
    const missingIds = compactedIds.filter((id) => !byId.has(id));
    if (missingIds.length > 0) {
      throw new Error(`cannot compact missing claim ids: ${missingIds.join(", ")}`);
    }

    const archivedIds = compactedIds.filter((id) => byId.get(id).lifecycle_state === "archived");
    if (archivedIds.length > 0) {
      throw new Error(`cannot compact archived claim ids: ${archivedIds.join(", ")}`);
    }

    const createdAt = now.toISOString();
    const summaryInput = withOwnerContext({
      ...input,
      lifecycle_state: input.lifecycle_state ?? "active",
      supersedes: normalizeIds([...(input.supersedes ?? []), ...compactedIds])
    }, cwd);
    const summary = normalizeMemoryClaim(summaryInput, { existingClaims: claims, now });

    const nextClaims = claims.map((claim) => {
      if (!compactedIds.includes(claim.id)) return claim;
      return {
        ...claim,
        lifecycle_state: "superseded",
        superseded_by: normalizeIds([...(claim.superseded_by ?? []), summary.id]),
        compacted_at: createdAt
      };
    });
    nextClaims.push(summary);

    let brief = null;
    let briefError = null;
    if (!dryRun) {
      writeJsonlAtomic(resolvedMemoryFile, nextClaims);
      if (updateBrief) {
        try {
          brief = runBriefGeneration({
            cwd,
            memoryFile: resolvedMemoryFile,
            outputFile: resolvedBriefFile,
            scope
          });
        } catch (err) {
          briefError = err.message;
          emitBriefRegenerationFailed(err);
        }
      }
    }

    return {
      memory_file: resolvedMemoryFile,
      brief_file: resolvedBriefFile,
      dry_run: dryRun,
      summary_id: summary.id,
      compacted_ids: compactedIds,
      written: !dryRun,
      brief_updated: Boolean(brief),
      brief_error: briefError,
      lock: visibleLockState(lockState)
    };
  });
}

function parseArgs(argv) {
  const options = {
    input: {}
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--ids") {
      options.ids = argv[++index];
      continue;
    }
    if (token === "--memory-file") {
      options.memoryFile = argv[++index];
      continue;
    }
    if (token === "--brief-file") {
      options.briefFile = argv[++index];
      continue;
    }
    if (token === "--type") {
      options.input.type = argv[++index];
      continue;
    }
    if (token === "--claim") {
      options.input.claim = argv[++index];
      continue;
    }
    if (token === "--scope") {
      options.input.scope = argv[++index];
      continue;
    }
    if (token === "--evidence-path") {
      options.input.evidence_path = argv[++index];
      continue;
    }
    if (token === "--evidence-id") {
      options.input.evidence_ids = [...(options.input.evidence_ids ?? []), argv[++index]];
      continue;
    }
    if (token === "--source-path") {
      options.input.source_paths = [...(options.input.source_paths ?? []), argv[++index]];
      continue;
    }
    if (token === "--confidence") {
      options.input.confidence = argv[++index];
      continue;
    }
    if (token === "--review-caveat") {
      options.input.review_caveat = argv[++index];
      continue;
    }
    if (token === "--source-id") {
      options.input.source_id = argv[++index];
      continue;
    }
    if (token === "--subject-key") {
      options.input.subject_key = argv[++index];
      continue;
    }
    if (token === "--topic") {
      options.input.topic = argv[++index];
      continue;
    }
    if (token === "--no-brief") {
      options.updateBrief = false;
      continue;
    }
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }
  return options;
}

function main() {
  const result = compactMemoryClaims({ cwd: process.cwd(), ...parseArgs(process.argv.slice(2)) });
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
