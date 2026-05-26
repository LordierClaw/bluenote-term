# Phase 3 — TUI Workspace

## Goal

Build the first full OpenTUI workspace for BlueNote now that Phase 0 repository preparation, Phase 1 core CLI/storage, and Phase 2 CLI storage/UX pivot are complete.

The workspace is launched with `bn tui` and remains a presentation/input layer over the existing BlueNote core services. It must keep note files as plain Markdown without required frontmatter and keep canonical metadata in `.state/notes/` sidecars.

## Primary outcomes

- OpenTUI renderer/bootstrap flow reachable from the BlueNote entrypoint through `bn tui`
- beautiful, elegant full-screen layout with command/status chrome
- separate **Manager**, **Editor**, and **Search Everything** screens instead of one overloaded pane
- Manager screen backed by the same note list/selectors as the CLI
- Search Everything screen backed by the same indexed search service as `bn search`, including notes, content excerpts, folders/paths, and slash-prefixed command entries
- focused inline Editor screen for everyday writing, saving, Unicode text, and dirty-state handling, with tested adapter/controller groundwork for selection, cut/copy/paste, and find/replace
- command discovery for available CLI-shaped workflows, with only `/save` wired as a built-in TUI action until the remaining command handlers are connected
- graceful startup, no-root, no-TTY, unsupported-terminal, and shutdown behavior

## Screen model

### Manager

The Manager is the workspace home screen. It presents note and folder rows derived from existing note summaries and paths, tracks the focused item, and opens selected notes into the Editor. Navigation stays selector-compatible with the CLI by using note keys and relative paths.

### Editor

The Editor is a focused note-body surface with only the TUI topbar, editor body, and bottombar/status chrome. Current wired Phase 3 behavior covers inline body editing, Unicode-safe changes, saving, and dirty-state protection. Selection, cut/copy/paste, and find/replace are tested in the adapter/controller layer and reserved for follow-on runtime wiring. The Editor writes the selected note body back to the same plain Markdown file; it does not add frontmatter or create a TUI-only storage format.

### Search Everything

Search Everything is a global screen/overlay that can be opened from the Manager or Editor and cancelled back to the invoking screen. It searches notes by title/key/filename/path/description, content matches from the existing search index, folder/path results, and slash-prefixed command entries such as `/new`, `/archive`, `/delete`, `/rebuild`, `/migrate`, `/find`, `/replace`, and `/save`. These entries support command discovery; in the current runtime, only `/save` is wired as a built-in action and the others need explicit command handlers before they mutate notes.

## Completion boundary

CLI completion remains shell setup, not a TUI action. Users install completions through `bn completion <bash|zsh|fish>` and source or save the generated script in their shell. Search Everything may expose command discovery, but it does not replace shell completion generation.

## Non-goals

- no network sync, hosted backend, AI features, or cloud-only assumptions
- no independent TUI storage model; TUI remains a presentation/input layer over core services
- no hidden frontmatter or embedded BlueNote metadata in note files
