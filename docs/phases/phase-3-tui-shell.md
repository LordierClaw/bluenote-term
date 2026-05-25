# Phase 3 — TUI Shell

## Goal

Establish the OpenTUI application shell and editor-first layout, then polish the delivered runtime so the exposed `bn tui` path matches the verified interaction contract.

## Primary outcomes

- renderer/bootstrap flow
- live runtime launch path for `bn tui`
- layout primitives and screen regions
- input/keymap baseline
- graceful startup/fallback behavior
- initial navigation/editor mode split
- return path from note view back to navigation
- inline editor wiring for `Backspace` and `Delete` through the shared shell keymap
- CLI exposure through `bn tui` without renaming or removing the Phase 2 command surface
- friendly missing-root startup messaging that guides users to `bn init` instead of crashing
