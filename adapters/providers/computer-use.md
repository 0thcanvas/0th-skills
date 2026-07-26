# Computer Use Provider Guide

Load this guide only when the active runtime profile resolves `browser_ui_fallback` to
`computer-use`.

- Target the exact desktop application and identity required by the TaskSpec.
- Inspect existing windows before opening a new one.
- Use this provider only after the primary session-backed capability cannot perform a required UI
  action and one safe recovery has failed.
- Obtain confirmation immediately before any provider-defined consequential action.
- Return the application, window or surface, action, confirmation boundary, and observed result.
- Close only windows or tabs created during the current task.
