import process from "node:process";

export function writeStderrLine(message) {
  try {
    process.stderr.write(`${message}\n`);
  } catch {
    // Stderr may be unavailable in embedded runners; diagnostics are best effort.
  }
}

export function emitBriefRegenerationFailed(error) {
  const message = error?.message ?? String(error ?? "unknown error");
  writeStderrLine(`brief-regeneration-failed: ${message}`);
}
