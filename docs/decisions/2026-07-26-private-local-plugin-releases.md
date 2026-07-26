# Keep Plugin Releases Private and Versioned Locally

**Date:** 2026-07-26
**Status:** active
**Durable:** yes

## Context
The runtime packager already creates immutable commit-addressed artifacts, but merged changes were
reinstalled under the unchanged `0.3.4` manifest version. One version could therefore identify
different contents, and rollback depended on remembering old paths.

## Decision
Use SemVer as the release identity and a commit as the artifact identity.
Publish only to a dedicated private local marketplace named `0th-local`; keep source, PRs, and
release tags in the existing GitHub repository. Never submit this plugin to the public directory.
Experiment codenames such as `workflow-vnext` are not plugin release names.

## Consequences
- A released version may identify only one commit; changed content requires a version bump.
- Local release metadata records version, commit, artifact path, time, and SHA-256 integrity.
- Activation atomically repoints the marketplace and shared runtime link; prior releases remain
  available for rollback.
- Formal publishing requires a clean checkout with a matching `v<version>` Git tag.

## Not Doing
- Publishing to the universal Plugin Directory or another public registry.
- Treating a mutable `current` directory or a bare commit hash as the release version.
