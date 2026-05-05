const REDACTION_PATTERNS = [
  {
    pattern: /\bAuthorization\s*:\s*(?:Bearer|Basic|Digest|Token)\s+[^\r\n\s]+/gi,
    replacement: "Authorization: [REDACTED_AUTHORIZATION]"
  },
  {
    pattern: /\b(?:Cookie|Set-Cookie)\s*:\s*[^\r\n]+/gi,
    replacement: (match) => `${match.split(":", 1)[0]}: [REDACTED_COOKIE]`
  },
  {
    pattern: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: "[REDACTED_JWT]"
  },
  {
    pattern: /\b(?:api[_-]?key|token|secret|password|passwd|sessionid|csrftoken)\s*=\s*[^;\s&]+/gi,
    replacement: (match) => `${match.split("=", 1)[0]}=[REDACTED_SECRET]`
  },
  {
    pattern: /\b(?:api[_-]?key|token|secret|password|passwd|sessionid|csrftoken)\s*:\s*["']?[^"',\s}]+["']?/gi,
    replacement: (match) => `${match.split(":", 1)[0]}: [REDACTED_SECRET]`
  }
];

export function redactSensitiveText(text) {
  let redacted = text;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}
