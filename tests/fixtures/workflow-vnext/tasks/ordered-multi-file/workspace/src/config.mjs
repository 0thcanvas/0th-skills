export function parseRecord(input) {
  if (!input || typeof input.id !== "string" || !input.id.trim()) {
    throw new TypeError("id must be a non-empty string");
  }
  return { id: input.id.trim() };
}
