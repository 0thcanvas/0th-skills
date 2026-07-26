# OpenCLI Provider Guide

Load this guide only when the active runtime profile resolves `session_backed_reading` to `opencli`.

- Prefer a named read adapter for the target surface before arbitrary browser inspection.
- Use read-only commands unless the user separately authorizes a write.
- Treat challenge pages, login walls, missing pagination, and adapter errors as access limitations,
  not negative evidence.
- Return the adapter command shape, account or query, source URL or surface, pagination limits,
  user-visible/session evidence, and sanitized errors.
- If the adapter cannot answer because arbitrary page state is required, resolve
  `logged_in_browser`; do not claim the source lacks evidence.
