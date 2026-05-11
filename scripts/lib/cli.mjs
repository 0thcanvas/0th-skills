// Shared CLI-entrypoint guard.
//
// Every workflow script has a `main()` block guarded by
//   `if (import.meta.url === \`file://${process.argv[1]}\`) main();`
//
// That equality check silently breaks under macOS's `/tmp` -> `/private/tmp`
// symlink resolution (and any other symlinked invocation path): the URL
// resolves to the canonical path while argv[1] keeps the symlinked form,
// and the script imports cleanly as a module but never runs `main()`. The
// The PR #19 counterpart review surfaced this as a silent no-op for
// users who run the scripts from inside /tmp scratch dirs.
//
// `isInvokedAsCli` normalizes both inputs through realpathSync so the
// equality is canonical-form-to-canonical-form.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} importMetaUrl  Pass `import.meta.url` from the caller.
 * @param {string|undefined} argv1 Pass `process.argv[1]`.
 * @returns {boolean} True when this module is the script being invoked.
 */
export function isInvokedAsCli(importMetaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    // Realpath BOTH sides: macOS turns /tmp into /private/tmp and /var into
    // /private/var only when the symlink is traversed. fileURLToPath returns
    // the literal path encoded in the URL (which may already be canonical,
    // or may still carry the symlinked prefix). Without realpathing both,
    // a script in /var/folders/... compared to argv1 in /private/var/...
    // would fail to match.
    return fs.realpathSync(fileURLToPath(importMetaUrl)) === fs.realpathSync(argv1);
  } catch {
    // realpathSync can throw if a path doesn't resolve (deleted file, broken
    // symlink). Fall back to the byte-equality check so we never become
    // less permissive than the old behaviour.
    return importMetaUrl === `file://${argv1}`;
  }
}
