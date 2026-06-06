# Phase 3 — TUI Workspace

## Goal

Build the OpenTUI workspace for BlueNote on top of the local CLI/storage foundation.

The workspace is launched with `bn tui` and remains a presentation/input layer over existing BlueNote core services. It keeps note files as plain Markdown without required frontmatter and keeps canonical metadata in `.data/notes/` sidecars. Legacy `.state/notes/` sidecars are migration input only, not current TUI storage.

## Primary outcomes

- OpenTUI renderer/bootstrap flow reachable from the BlueNote entrypoint through `bn tui`
- separate **Manager**, **Editor**, and **Search Everything** screens instead of one overloaded pane
- Manager screen backed by the same note summaries, keys, paths, and selectors as the CLI
- Search Everything screen backed by the same contains-style search contract as `bn search`
- focused inline Editor screen for everyday writing, saving, cursor movement, Unicode text, wrap mode, find/replace, undo/redo, autosave, and dirty-state handling
- command discovery for working context-specific workspace actions
- graceful startup, no-root, no-TTY, unsupported-terminal, and shutdown behavior

## Screen model

### Manager

The Manager is the workspace home screen. It presents a minimal file-browser-like view with note and folder rows derived from existing note summaries and filesystem folders. It keeps empty user folders visible while hiding BlueNote internal folders. Right/open enters a folder or opens the selected note into the Editor; left/back or `Esc` returns to the previous folder or screen. `/` filters, `n` creates a new note through the same core service path as `bn new`, `d` deletes the focused note only after confirmation, and `Ctrl+P` opens Search Everything.

### Editor

The Editor is a focused note-body surface with topbar, editor body, and minimal bottombar/status chrome. Current wired behavior covers real editor body input, inline body editing, cursor-aware movement and edit operations, Unicode-safe changes, newline/backspace/delete, explicit `Ctrl+S` save, `Ctrl+F` find mode, `Ctrl+R` replace mode, `Ctrl+Z`/`Ctrl+Y` undo/redo, wrap mode, and 750 ms autosave.

Autosave and manual save use the same safe note-body write path. Failed saves keep the buffer dirty and retry later. The current save contract does not create recovery-copy, draft, startup prompt, or recovery-list workflows.

Terminal-visible copy/paste is terminal-native. BlueNote does not enable app mouse capture for normal editor use, so users can select rendered visible text in the terminal and use terminal copy/paste shortcuts. Whole-note clipboard operations are explicit Search Everything commands where available: `/copy-all`, `/replace-all`, and `/paste`.

### Search Everything

Search Everything is a global screen/overlay opened from the Manager or Editor with `Ctrl+P` and cancelled back to the invoking screen with `Esc`, `Ctrl+[`, or `Ctrl+P`. It uses a single input, result list, and preview to search notes by title/key/filename/path/description, content matches from the existing search index, folder/path results, and slash-prefixed command entries.

Context-filtered command rows expose wired actions only. Editor context exposes `/find`, `/replace`, `/save`, `/copy-all`, `/replace-all`, and `/paste`. Manager context exposes `/new` plus `/delete` when a note action is available. Unwired rows are omitted rather than shown as unavailable.

## Back and visual rules

`Escape` and `Ctrl+[` share one back rule across the workspace: close the active mode or overlay first, then navigate back through folders/screens toward the root manager. Quitting the workspace remains an explicit `q` or `Ctrl+C` action. TUI styling uses a restrained blue palette for focus, active items, muted metadata, and consistent top/bottom chrome; red is reserved for destructive confirmation and actual errors.

## Current status

The current import-only TUI smoke status is `tui-workspace-ready`; current follow-up metadata is `hardening-follow-up`.

## Non-goals

- no network sync, hosted backend, AI features, or cloud-only assumptions
- no independent TUI storage model; TUI remains a presentation/input layer over core services
- no hidden frontmatter or embedded BlueNote metadata in note files
