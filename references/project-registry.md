# Project Registry Contract

Use an optional `project_registry` to discover which projects and source sets exist before asking a
knowledge provider or opening repositories. It is a catalog, not a code index, wiki, workflow
memory, or authority source.

## Request

Send bounded task keywords plus any known project, service, UI, team, or dependency names. Request
read-only catalog access and a versioned result.

## Result

Require:

- canonical project or bounded-context identifiers and aliases;
- source or repository locator without embedded credentials;
- relationships such as caller, dependency, owner, or deployment unit when known;
- current catalog revision or fingerprint and observation time;
- pointers to project instructions, current docs, or an optional `knowledge_provider`;
- ambiguous matches and missing source access.

Use the registry to choose the next read, not to assert current code behavior. Confirm behavior in
current source or a fresh versioned knowledge receipt. Missing registry access never blocks a task
whose relevant source can be found directly.

Keep one canonical catalog. Do not copy its entries into workflow memory, planning documents, or a
second wiki; store only a pointer when continuity requires one.
