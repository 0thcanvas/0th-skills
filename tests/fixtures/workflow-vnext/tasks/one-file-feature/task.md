Implement `normalizeTag(value)` in `src/normalize-tag.mjs`.

Required behavior:
- reject non-string input with `TypeError`;
- trim outer whitespace;
- lowercase using JavaScript's normal Unicode-aware lowercase conversion;
- convert every run of whitespace, underscore, or hyphen separators to one `-`;
- remove leading/trailing separators;
- preserve non-separator Unicode characters.

Run `npm test`.
