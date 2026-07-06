# Source Routing

Use this file when you need concrete source-routing and query-shaping patterns beyond the core skill entrypoint.

## Query-Shaping Examples

- Brand name -> capability:
  `Canva Magic Grab` -> `object extraction from designed images`, `editable field extraction`, `template-aware segmentation`
- API question -> source buckets:
  primary docs, SDK examples, changelog, rate-limit docs, maintainer issues
- OSS landscape -> source buckets:
  GitHub repos, maintainer issues, benchmark pages, recent papers, practitioner writeups
- Practitioner/video research -> source buckets:
  YouTube or transcript sources for claim discovery, then primary docs/GitHub/marketplaces/forums for validation
- Technical, AI-agent, finance, or stock research -> source buckets:
  primary sources for truth, X/Twitter via OpenCLI for current practitioner and market discourse,
  GitHub/papers/docs/filings/direct artifacts for validation

## Re-query Patterns

- `site:github.com <task> <library family> example`
- `site:arxiv.org <task> <model family> benchmark`
- `site:docs.vendor.com <feature> limitations`
- `site:github.com <tool> issue <edge case>`
- `site:youtube.com <audience> <pain or workflow>`
- `site:youtube.com <capability> demo case study`
- `"<domain or tool>" "<pain or workflow>" "transcript"`
- OpenCLI X/Twitter reads: `twitter search <topic or ticker>`, `twitter tweets <account>`,
  `twitter thread <post-url-or-id>` when technical discourse, stock chatter, replies, or
  current names are part of the answer

## Anti-Bot And Session-Backed Reads

For Reddit, X/Twitter, private dashboards, app marketplaces, extension pages, and other surfaces
that often challenge generic fetches, choose the evidence lane before searching:

- Public claims: ordinary search/fetch can discover public sources and pointers.
- User-visible logged-in content: prefer OpenCLI when an adapter exists.
- Arbitrary page state, challenge diagnosis, or current tab state: use Browser Kit/BB Browser real
  Chrome, then computer-use when a real UI path is the only available route.

OpenCLI Browser Bridge owns `localhost:19825`. When both OpenCLI and Browser Kit are needed, move
Browser Kit with `--cdp-port <port> --daemon-port <port>` or `BROWSER_KIT_CDP_PORT` /
`BROWSER_KIT_DAEMON_PORT`; record the chosen ports in the receipt if a later agent must reproduce
the run.

If a fetch/open-web path returns a challenge page, CAPTCHA, verification page, 403/429, login wall,
or bot-block page, mark `challenge_or_session_blocked`. Re-route to a session-backed lane or report
the blocker with partial evidence. Do not treat the blocked response as proof that the content is
absent.

Re-query when:

- the first pass gives vendor language but not implementation language
- sources disagree and you need the primary artifact
- results are stale, shallow, or clearly SEO-shaped

## Source-Bucket Heuristics

- Primary docs for product truth, constraints, pricing, launch claims, and API shape
- GitHub for maintenance signals, real examples, issue heat, and implementation details
- Papers for algorithms, baselines, and benchmark framing
- Specs for standards behavior
- Video/transcript sources for demos, practitioner vocabulary, tool mentions, and workflow pain
- Blogs/forums for operational pain, workarounds, and edge cases
- X/Twitter via OpenCLI for live technical/AI-agent discourse, finance and stock-research
  chatter, active names, claim discovery, dissent, and post/reply/thread evidence

Primary sources should anchor the conclusion. Secondary sources should explain reality around them, not replace them.

When videos are a major source bucket, read `video-source-research.md`.
For the persisted findings shape, use `templates/raw-findings-note.md`.
