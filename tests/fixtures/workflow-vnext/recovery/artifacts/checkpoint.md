# State checkpoint

Current conclusion:
- `claim-current`: the current release record is authoritative for the supported behavior.
- `claim-superseded`: an older note describes behavior that the current release replaced.

Evidence:
- `source-authoritative`: current release record.
- `source-old`: older design note retained for history.

Limits:
- `caveat-scope`: the result applies only to the named runtime and version.

Contradiction:
- `conflict-version`: the older note conflicts with the current release record; retain both until
  the supersession chain is audited.

Open loop:
- `gap-runtime`: live runtime behavior has not yet been observed.

Next read:
- `read-release-record`: inspect the signed release record before implementation.
