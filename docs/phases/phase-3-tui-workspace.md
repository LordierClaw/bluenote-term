# Phase 3 — TUI Workspace

## Goal

Build the first full OpenTUI workspace for BlueNote now that Phase 0 repository preparation, Phase 1 core CLI/storage, and Phase 2 CLI storage/UX pivot are complete.

## Primary outcomes

- OpenTUI renderer/bootstrap flow reachable from the BlueNote entrypoint
- beautiful, elegant full-screen layout with command/status chrome
- file/navigation pane backed by the same note list/selectors as the CLI
- search pane backed by the same indexed search service as `bn search`
- fully functional inline note editor for everyday writing, saving, undo/redo, cursor movement, paste, and dirty-state handling
- command palette or action layer covering the available CLI workflows: `new`, `list`, `show`, `search`, `edit`, `archive`, `delete --force`, `rebuild`, `migrate`, and completion/help discovery where applicable
- graceful startup, no-root, no-TTY, unsupported-terminal, and shutdown behavior

## Non-goals

- no network sync, hosted backend, AI features, or cloud-only assumptions
- no independent TUI storage model; TUI remains a presentation/input layer over core services
- no hidden frontmatter or embedded BlueNote metadata in note files
