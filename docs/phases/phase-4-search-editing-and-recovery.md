# Phase 4 — Search, Editing, and Recovery Hardening

## Goal

Harden day-to-day CLI/TUI workflows after the TUI workspace is usable while keeping notes plain Markdown.

## Primary outcomes

- canonical BlueNote metadata sidecars under `.data/notes/`, with legacy `.state/` used only as safe migration input
- rebuildable derived artifacts under `.data/`, including `.data/metadata.sqlite` and `.data/search-index.json`
- contains-style search semantics across `bn search`, Manager filtering, Search Everything, and slash-command discovery; query `123` only matches actual fields or content containing `123`
- Search Everything readability and responsive preview behavior
- editor input, cursor, find/replace, undo/redo, wrap, and terminal-native paste/copy expectations
- autosave and manual `Ctrl+S` through the same safe note-body write path
- failed saves keeping the buffer dirty and retryable
- no recovery-copy, draft, startup prompt, or recovery-list workflow in the current save contract
- Manager performance/responsive layout behavior, current-folder context, filtered-count/status display, and create/delete prompts
- future hardening space for scratch/today/template flows, broader crash recovery, and archive/history polish

## Current status

Phase 4 work established the current `.data` storage foundation, contains-style search contract, editor input/cursor behavior, Manager/Search Everything readability, autosave atomicity, and TUI cleanup behavior. Current public docs should describe these as baseline behavior rather than active old subphase markers.

The current import-only TUI smoke status is `tui-workspace-ready`; current follow-up metadata is `hardening-follow-up`.

## Non-goals

- no AI features
- no sync or hosted backend
- no embedded BlueNote metadata frontmatter as canonical storage
- no required manual visual/computer-use verification for ordinary console-environment changes
