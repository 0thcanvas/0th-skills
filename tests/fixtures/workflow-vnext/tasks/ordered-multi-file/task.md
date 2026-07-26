Add optional expiration support across the configuration, policy, and formatting seams.

- `parseRecord(input)` accepts `{ id, expiresAt? }`, requires a non-empty string `id`, and when
  present requires `expiresAt` to be a valid ISO date-time string. It returns a normalized record.
- `isRecordActive(record, now)` returns false at or after the expiration instant. `now` may be a
  `Date` or ISO string and invalid values throw `TypeError`.
- `formatRecordStatus(record, now)` returns exactly `<id>: active` or `<id>: expired`.
- Preserve records without `expiresAt` as active.

Run `npm test`. Do not change the public function names or test files.
