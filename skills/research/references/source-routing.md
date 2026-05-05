# Source Routing

Use this file when you need concrete source-routing and query-shaping patterns beyond the core skill entrypoint.

## Query-Shaping Examples

- Brand name -> capability:
  `Canva Magic Grab` -> `object extraction from designed images`, `editable field extraction`, `template-aware segmentation`
- API question -> source buckets:
  official docs, SDK examples, changelog, rate-limit docs, maintainer issues
- OSS landscape -> source buckets:
  GitHub repos, maintainer issues, benchmark pages, recent papers, practitioner writeups
- Practitioner/video research -> source buckets:
  YouTube or transcript sources for claim discovery, then official docs/GitHub/marketplaces/forums for validation

## Re-query Patterns

- `site:github.com <task> <library family> example`
- `site:arxiv.org <task> <model family> benchmark`
- `site:docs.vendor.com <feature> limitations`
- `site:github.com <tool> issue <edge case>`
- `site:youtube.com <audience> <pain or workflow>`
- `site:youtube.com <capability> demo case study`
- `"<domain or tool>" "<pain or workflow>" "transcript"`

Re-query when:

- the first pass gives vendor language but not implementation language
- sources disagree and you need the primary artifact
- results are stale, shallow, or clearly SEO-shaped

## Source-Bucket Heuristics

- Official docs for product truth, constraints, pricing, launch claims, and API shape
- GitHub for maintenance signals, real examples, issue heat, and implementation details
- Papers for algorithms, baselines, and benchmark framing
- Specs for standards behavior
- Video/transcript sources for demos, practitioner vocabulary, tool mentions, and workflow pain
- Blogs/forums for operational pain, workarounds, and edge cases

Primary sources should anchor the conclusion. Secondary sources should explain reality around them, not replace them.

When videos are a major source bucket, read `video-source-research.md`.
For the persisted findings shape, use `templates/raw-findings-note.md`.
