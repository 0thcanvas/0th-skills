import fs from "node:fs";
import path from "node:path";

const THRESHOLD = 3;
const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;

    const key = m[1];
    let value = m[2].trim();

    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      if (inner === "") {
        fields[key] = [];
      } else {
        fields[key] = inner.split(",").map((s) => {
          const trimmed = s.trim();
          if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
              (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1);
          }
          return trimmed;
        });
      }
    } else {
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      fields[key] = value;
    }
  }
  return fields;
}

function loadIncidents(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];

  const incidents = [];
  // Sort filenames so directory iteration order doesn't leak into output ordering.
  const entries = fs.readdirSync(directoryPath).sort();
  for (const filename of entries) {
    if (!filename.endsWith(".md")) continue;
    const filePath = path.join(directoryPath, filename);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    // Read only enough bytes to capture the frontmatter block. The aggregator
    // never needs the body and should not load potentially-sensitive evidence
    // sections into process memory or downstream tooling.
    const fd = fs.openSync(filePath, "r");
    let head = "";
    try {
      const buf = Buffer.alloc(8 * 1024);
      const bytes = fs.readSync(fd, buf, 0, buf.length, 0);
      head = buf.subarray(0, bytes).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
    const fields = parseFrontmatter(head);
    if (!fields) continue;
    if (!fields.date || !fields.classification) continue;

    incidents.push({
      filePath,
      date: fields.date,
      skill: fields.skill || "none",
      classification: fields.classification,
      tags: Array.isArray(fields.tags) ? fields.tags : [],
    });
  }
  return incidents;
}

// The schema requires "ISO 8601 timestamp with timezone" — match either a `Z`
// suffix or an explicit ±HH:MM offset. Date.parse will silently accept
// timezone-less strings using the local runtime zone, which would make
// recent-cluster windowing non-deterministic across machines.
const TIMEZONE_AWARE = /(Z|[+-]\d{2}:\d{2})$/;

function isRecent(incident, currentRunAtMs) {
  if (!TIMEZONE_AWARE.test(incident.date)) return false;
  const incidentMs = Date.parse(incident.date);
  if (Number.isNaN(incidentMs)) return false;
  const delta = currentRunAtMs - incidentMs;
  return delta >= 0 && delta <= RECENT_WINDOW_MS;
}

function buildBucket(bucketType, bucketKey, entries, justWrittenPath, currentRunAtMs) {
  const priorEntries = entries
    .filter((e) => e.filePath !== justWrittenPath)
    .map((e) => e.filePath)
    .sort();
  const recentCount = entries.filter((e) => isRecent(e, currentRunAtMs)).length;
  return {
    bucketType,
    bucketKey,
    count: entries.length,
    priorEntries,
    recentCluster: recentCount >= THRESHOLD,
  };
}

function parseCliArgs(argv) {
  const args = { dir: null, now: null, justWritten: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--dir") args.dir = value;
    else if (flag === "--now") args.now = value;
    else if (flag === "--just-written") args.justWritten = value;
  }
  return args;
}

export function aggregate({ directoryPath, currentRunAt, justWrittenPath = null }) {
  const currentRunAtMs = Date.parse(currentRunAt);
  if (Number.isNaN(currentRunAtMs)) {
    throw new Error(`Invalid currentRunAt: ${currentRunAt}`);
  }

  const incidents = loadIncidents(directoryPath);
  const patterns = [];

  const cxsBuckets = new Map();
  const classBuckets = new Map();
  const tagBuckets = new Map();

  for (const incident of incidents) {
    const cxsKey = `${incident.classification} × ${incident.skill}`;
    if (!cxsBuckets.has(cxsKey)) cxsBuckets.set(cxsKey, []);
    cxsBuckets.get(cxsKey).push(incident);

    const classKey = incident.classification;
    if (!classBuckets.has(classKey)) classBuckets.set(classKey, []);
    classBuckets.get(classKey).push(incident);

    const seenTags = new Set();
    for (const tag of incident.tags) {
      if (seenTags.has(tag)) continue;
      seenTags.add(tag);
      if (!tagBuckets.has(tag)) tagBuckets.set(tag, []);
      tagBuckets.get(tag).push(incident);
    }
  }

  for (const [key, entries] of cxsBuckets) {
    if (entries.length >= THRESHOLD) {
      patterns.push(buildBucket("classification-x-skill", key, entries, justWrittenPath, currentRunAtMs));
    }
  }
  for (const [key, entries] of classBuckets) {
    if (entries.length >= THRESHOLD) {
      patterns.push(buildBucket("classification", key, entries, justWrittenPath, currentRunAtMs));
    }
  }
  for (const [key, entries] of tagBuckets) {
    if (entries.length >= THRESHOLD) {
      patterns.push(buildBucket("tag", key, entries, justWrittenPath, currentRunAtMs));
    }
  }

  // Sort patterns deterministically so identical inputs produce identical output.
  patterns.sort((a, b) => {
    if (a.bucketType !== b.bucketType) return a.bucketType.localeCompare(b.bucketType);
    return a.bucketKey.localeCompare(b.bucketKey);
  });

  return { patterns };
}

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url.endsWith(path.basename(process.argv[1]));

if (isMainModule) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.dir || !args.now) {
    console.error("Usage: retro-aggregator.mjs --dir <path> --now <ISO> [--just-written <path>]");
    process.exit(2);
  }
  const result = aggregate({
    directoryPath: args.dir,
    currentRunAt: args.now,
    justWrittenPath: args.justWritten,
  });
  console.log(JSON.stringify(result, null, 2));
}
