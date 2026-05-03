import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { aggregate } from "../scripts/retro-aggregator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeIncidentDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "retro-aggregator-"));
}

function writeIncident(dir, filename, frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => JSON.stringify(v)).join(", ")}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---", "", "## What user wanted", "placeholder", "");
  fs.writeFileSync(path.join(dir, filename), lines.join("\n"));
}

test("under threshold: 2 entries in the same bucket surface no patterns", () => {
  const dir = makeIncidentDir();
  writeIncident(dir, "2026-05-01-a.md", {
    date: "2026-05-01T10:00:00-05:00",
    skill: "/build",
    classification: "verification-skipped",
  });
  writeIncident(dir, "2026-05-02-b.md", {
    date: "2026-05-02T10:00:00-05:00",
    skill: "/build",
    classification: "verification-skipped",
  });

  const result = aggregate({ directoryPath: dir, currentRunAt: "2026-05-03T12:00:00-05:00" });
  assert.deepEqual(result.patterns, []);
});

test("exactly 3 in (classification × skill) fires; just-written entry is excluded from prior-entry links", () => {
  const dir = makeIncidentDir();
  writeIncident(dir, "2026-05-01-a.md", {
    date: "2026-05-01T10:00:00-05:00",
    skill: "/build",
    classification: "verification-skipped",
  });
  writeIncident(dir, "2026-05-02-b.md", {
    date: "2026-05-02T10:00:00-05:00",
    skill: "/build",
    classification: "verification-skipped",
  });
  writeIncident(dir, "2026-05-03-just-written.md", {
    date: "2026-05-03T10:00:00-05:00",
    skill: "/build",
    classification: "verification-skipped",
  });

  const result = aggregate({
    directoryPath: dir,
    currentRunAt: "2026-05-03T12:00:00-05:00",
    justWrittenPath: path.join(dir, "2026-05-03-just-written.md"),
  });

  const pattern = result.patterns.find(
    (p) => p.bucketType === "classification-x-skill"
  );
  assert.ok(pattern, "should surface the (classification × skill) bucket");
  assert.equal(pattern.count, 3, "count includes the just-written entry");
  assert.equal(pattern.priorEntries.length, 2, "prior-entries link list excludes the just-written entry");
  assert.ok(
    !pattern.priorEntries.some((p) => p.endsWith("just-written.md")),
    "just-written entry should not appear in prior-entries"
  );
});

test("recent-cluster: 3 entries all within 30 days are flagged as a recent cluster", () => {
  const dir = makeIncidentDir();
  writeIncident(dir, "2026-04-15-a.md", {
    date: "2026-04-15T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });
  writeIncident(dir, "2026-04-25-b.md", {
    date: "2026-04-25T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });
  writeIncident(dir, "2026-05-03-c.md", {
    date: "2026-05-03T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });

  const result = aggregate({ directoryPath: dir, currentRunAt: "2026-05-03T12:00:00-05:00" });
  const pattern = result.patterns.find((p) => p.bucketType === "classification-x-skill");
  assert.ok(pattern, "should surface the bucket");
  assert.equal(pattern.recentCluster, true, "≥ 3 entries within 30 days = recent cluster");
});

test("recent-cluster: stale entries (>30d) fire but are not flagged as recent", () => {
  const dir = makeIncidentDir();
  writeIncident(dir, "2025-08-01-a.md", {
    date: "2025-08-01T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });
  writeIncident(dir, "2025-12-01-b.md", {
    date: "2025-12-01T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });
  writeIncident(dir, "2026-03-01-c.md", {
    date: "2026-03-01T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });

  const result = aggregate({ directoryPath: dir, currentRunAt: "2026-05-03T12:00:00-05:00" });
  const pattern = result.patterns.find((p) => p.bucketType === "classification-x-skill");
  assert.ok(pattern, "should surface the bucket (lifetime threshold met)");
  assert.equal(pattern.recentCluster, false, "no entries within 30 days = not a recent cluster");
});

test("multi-bucket: two buckets crossing ≥ 3 simultaneously are both surfaced", () => {
  const dir = makeIncidentDir();
  for (let i = 0; i < 3; i++) {
    writeIncident(dir, `verification-${i}.md`, {
      date: `2026-04-${10 + i}T10:00:00-05:00`,
      skill: "/build",
      classification: "verification-skipped",
    });
    writeIncident(dir, `skill-issue-${i}.md`, {
      date: `2026-04-${20 + i}T10:00:00-05:00`,
      skill: "/think",
      classification: "skill-issue",
    });
  }

  const result = aggregate({ directoryPath: dir, currentRunAt: "2026-05-03T12:00:00-05:00" });
  const cxs = result.patterns.filter((p) => p.bucketType === "classification-x-skill");
  assert.equal(cxs.length, 2, "both (classification × skill) buckets should be surfaced");
  const keys = cxs.map((p) => p.bucketKey).sort();
  assert.deepEqual(keys, ["skill-issue × /think", "verification-skipped × /build"]);
});

test("related_skills does NOT fan out into the (classification × skill) buckets", () => {
  const dir = makeIncidentDir();
  // Two real /build incidents
  writeIncident(dir, "build-1.md", {
    date: "2026-05-01T10:00:00-05:00",
    skill: "/build",
    classification: "verification-skipped",
  });
  writeIncident(dir, "build-2.md", {
    date: "2026-05-02T10:00:00-05:00",
    skill: "/build",
    classification: "verification-skipped",
  });
  // One /think incident that mentions /build via related_skills — must NOT count toward /build's bucket
  writeIncident(dir, "think-with-related.md", {
    date: "2026-05-03T10:00:00-05:00",
    skill: "/think",
    related_skills: ["/build"],
    classification: "verification-skipped",
  });

  const result = aggregate({ directoryPath: dir, currentRunAt: "2026-05-03T12:00:00-05:00" });
  const buildBucket = result.patterns.find(
    (p) => p.bucketType === "classification-x-skill" && p.bucketKey === "verification-skipped × /build"
  );
  assert.equal(
    buildBucket,
    undefined,
    "(verification-skipped × /build) should be 2 (not 3) — related_skills must not fan out into bucket counts"
  );
});

test("tags surface one bucket per distinct tag value when each crosses threshold", () => {
  const dir = makeIncidentDir();
  for (let i = 0; i < 3; i++) {
    writeIncident(dir, `confab-${i}.md`, {
      date: `2026-05-0${i + 1}T10:00:00-05:00`,
      skill: "/think",
      classification: "verification-skipped",
      tags: ["confabulation", "scope-creep"],
    });
  }

  const result = aggregate({ directoryPath: dir, currentRunAt: "2026-05-03T12:00:00-05:00" });
  const tagPatterns = result.patterns.filter((p) => p.bucketType === "tag");
  const tagKeys = tagPatterns.map((p) => p.bucketKey).sort();
  assert.deepEqual(tagKeys, ["confabulation", "scope-creep"], "each distinct tag value gets its own bucket");
});

test("frontmatter date (not filename) is used for the recent-cluster window", () => {
  const dir = makeIncidentDir();
  // Filename is recent (2026-05-01) but frontmatter date is from a year ago
  writeIncident(dir, "2026-05-01-a.md", {
    date: "2025-05-01T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });
  writeIncident(dir, "2026-05-02-b.md", {
    date: "2025-06-01T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });
  writeIncident(dir, "2026-05-03-c.md", {
    date: "2025-07-01T10:00:00-05:00",
    skill: "/think",
    classification: "skill-issue",
  });

  const result = aggregate({ directoryPath: dir, currentRunAt: "2026-05-03T12:00:00-05:00" });
  const pattern = result.patterns.find((p) => p.bucketType === "classification-x-skill");
  assert.ok(pattern, "should surface (lifetime threshold)");
  assert.equal(
    pattern.recentCluster,
    false,
    "frontmatter dates are all > 30 days old; filename dates must NOT be used"
  );
});

test("missing directory returns empty patterns (no throw)", () => {
  const result = aggregate({
    directoryPath: "/nonexistent/path/that/cannot/exist",
    currentRunAt: "2026-05-03T12:00:00-05:00",
  });
  assert.deepEqual(result.patterns, []);
});
