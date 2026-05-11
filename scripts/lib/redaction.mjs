// Single source of truth for secret-shape detection across every JSONL writer
// in the project. The contract (`references/memory-contract.md`) requires that
// memory claims, open-loop records, evidence records, and read-set
// reconciliation evidence never carry raw secret values. Before PR #21 review,
// this enforcement lived only in `scripts/evidence.mjs` with a tiny three-pattern
// regex set that missed every modern token shape an agent or human is likely to
// paste (GitHub `ghp_`/`github_pat_`, GitLab `glpat-`, Slack `xoxb-`, AWS
// `AKIA…`, JWT `eyJ…`, PEM private-key markers, HTTP basic-auth URLs,
// `FOO_API_KEY=…` env assignments, Doppler `dp.pt.…`, Vault `hvs.…`, and
// `Bearer eyJ…` headers). An adversarial probe confirmed all 10 formats above
// were silently accepted; see `tests/redaction.test.mjs` for the corpus.
//
// Design constraints:
//   1. Both adversarial detection AND innocuous-fixture acceptance must be
//      pinned by tests. The legitimate cases we must NOT block include:
//        - 40-char git SHAs (commit hashes the user pastes into evidence)
//        - Docker image digests (`sha256:…`)
//        - 1Password / Doppler references (`op://…`, `doppler://…`) — secrets
//          BY REFERENCE, not by value
//        - Plain English mentioning "password", "key", etc.
//   2. The same function must be callable from any writer (`memory-write.mjs`,
//      `open-loop.mjs`, `read-set-reconcile.mjs`, `evidence.mjs`) so the
//      contract is one-sided: zero call sites = zero protection.
//   3. The check is an ASSERTION, not a redaction. Returning a redacted string
//      tempts callers to silently mutate their own input. Throwing forces the
//      caller to make the policy decision (rotate, abort, or rewrite) before
//      the bad value lands on disk.

export const SECRET_PATTERNS = [
  // GitHub fine-grained PAT and the legacy `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`
  // family. Real tokens use `_` after the prefix; the pre-PR-21 regex
  // demanded `-` and matched nothing.
  /\b(?:gh[pousr])_[A-Za-z0-9]{16,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,

  // GitLab and Slack — both use the `prefix-` separator. Anchored on `\b` to
  // avoid catching innocuous `glpat-help` or `xoxb-info` mentions in prose
  // (length floor of 20 weeds those out).
  /\bglpat-[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}-[A-Za-z0-9-]{10,}\b/,

  // OpenAI / Anthropic / generic `sk-`/`rk-` API keys.
  /\b(?:sk|rk)-[A-Za-z0-9_-]{20,}\b/,

  // AWS access key id family (full enumeration of documented prefixes).
  /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA|APKA)[A-Z0-9]{16}\b/,

  // JWT — three base64url segments separated by dots, leading segment must
  // begin `eyJ` (the literal `{"` base64url-encoded). Length floors prevent
  // matching `eyJ.A.B` toy strings.
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b/,

  // PEM private-key markers. Whether RSA, EC, DSA, OPENSSH, or unprefixed,
  // the literal `BEGIN ... PRIVATE KEY` is the unambiguous signal.
  /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/,

  // HTTP basic auth in a URL — `https://user:password@host`. We require both
  // a user and a non-empty password segment with at least one non-letter so
  // that markdown anchors like `https://docs.example.com/api/keys#how-to:get`
  // are not mistaken for credentials. The `(?!op:)` lookahead skips
  // 1Password references that happen to embed `:` (none in URL form, but
  // future-proofing).
  /\bhttps?:\/\/(?!op:)[A-Za-z0-9._~-]+:[^@\s/]*[^A-Za-z\s][^@\s/]*@/,

  // Env-style `FOO_API_KEY=secret` or `password=secret`. The key half must be
  // either uppercase-with-underscore (real env vars) or one of the canonical
  // lowercase words. The value half must:
  //   - be at least 8 chars,
  //   - NOT be an `op://`/`doppler://` reference (non-secret pointer),
  //   - NOT be one of the common documentation placeholders below. We do not
  //     require digits because human-picked passwords and legacy tokens can be
  //     letter-only; placeholders are a narrower and safer allowlist.
  /\b(?:[A-Z][A-Z0-9_]*_)?(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET[_-]?KEY|SECRET|PASSWORD|PASSWD|PRIVATE[_-]?KEY)\s*[:=]\s*["']?(?!op:\/\/|doppler:\/\/)(?!(?:required|optional|redacted|example|placeholder|changeme|replace-with-your-token|todo(?:[-_][A-Za-z0-9-]+)?)(?:["']?(?:\s|$)))[^\s"'`<>]{8,}/i,

  // Doppler and Vault runtime tokens (the *values* shipped to client apps,
  // not the project-references that look like `doppler://…`). Both use a
  // distinctive prefix-then-payload shape with high entropy.
  /\bdp\.(?:pt|st|ct|sa|sv)\.[A-Za-z0-9_-]{20,}\b/,
  /\bhvs\.[A-Za-z0-9_-]{20,}\b/,

  // Authorization headers carrying long opaque tokens. Restricting to
  // `Bearer ` + at least 20 chars AND an entropy floor (digit + letter)
  // keeps doc placeholders like `Bearer replace-with-your-token` from
  // tripping the guard while still matching every realistic opaque token
  // (JWTs, GitHub PATs, generic 20+ char alphanumeric bearer tokens).
  /\bBearer\s+(?!op:\/\/|doppler:\/\/)(?=[A-Za-z0-9._~+/=-]*[A-Za-z])(?=[A-Za-z0-9._~+/=-]*\d)[A-Za-z0-9._~+/=-]{20,}\b/i
];

// Returns the text we actually scan. We always neutralize `op://…` and
// `doppler://…` references first because they are explicit pointers, not
// secrets. After substitution we still scan in case the same string mixes a
// reference with a raw secret tacked on the end.
function neutralizeReferences(text) {
  return text
    .replace(/op:\/\/\S+/g, "op://reference")
    .replace(/doppler:\/\/\S+/g, "doppler://reference");
}

/**
 * Throw if any input string matches a known secret shape.
 *
 * @param {Array<string|null|undefined>} values - Strings to scan. Null/empty
 *   entries are ignored so callers can pass optional fields without guarding
 *   each one.
 * @param {string} [message] - Custom error message; defaults to a generic one
 *   that points the caller at the contract.
 */
export function assertNoSecretLikeText(values, message = "record contains secret-like content; redact it before writing") {
  if (!Array.isArray(values)) return;
  const joined = values
    .filter((value) => value != null && String(value).length > 0)
    .map((value) => String(value))
    .join("\n");
  if (!joined.trim()) return;

  const scannable = neutralizeReferences(joined);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(scannable)) {
      throw new Error(message);
    }
  }
}
