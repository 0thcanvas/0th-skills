# Source Routing

Use this file when you need concrete source-routing and query-shaping patterns beyond the core skill entrypoint.

## Query-Shaping Examples

- Brand name -> capability:
  `Canva Magic Grab` -> `object extraction from designed images`, `editable field extraction`, `template-aware segmentation`
- API question -> source buckets:
  official docs, SDK examples, changelog, rate-limit docs, maintainer issues
- OSS landscape -> source buckets:
  GitHub repos, maintainer issues, benchmark pages, recent papers, practitioner writeups

## Re-query Patterns

- `site:github.com <task> <library family> example`
- `site:arxiv.org <task> <model family> benchmark`
- `site:docs.vendor.com <feature> limitations`
- `site:github.com <tool> issue <edge case>`

Re-query when:

- the first pass gives vendor language but not implementation language
- sources disagree and you need the primary artifact
- results are stale, shallow, or clearly SEO-shaped

## Source-Bucket Heuristics

- Official docs for product truth, constraints, pricing, launch claims, and API shape
- GitHub for maintenance signals, real examples, issue heat, and implementation details
- Papers for algorithms, baselines, and benchmark framing
- Specs for standards behavior
- Blogs/forums/videos for operational pain, workarounds, and edge cases

Primary sources should anchor the conclusion. Secondary sources should explain reality around them, not replace them.

For the persisted findings shape, use `templates/raw-findings-note.md`.
