# Phase 3 TUI Workspace Design

Date: 2026-05-26
Status: Draft for approval
Scope: BlueNote Phase 3 OpenTUI workspace

## Context

Phase 0 repository preparation, Phase 1 core CLI/storage groundwork, and the Phase 2 CLI storage/UX pivot are complete. Phase 2 established the current storage contract: plain Markdown note files under `notes/`, sidecar metadata under `.state/notes/`, rebuildable indexes under `.state/`, and key/path selectors for the visible CLI commands.

The roadmap has been reindexed so the former `phase-2-tui-shell` work is now **Phase 3 — TUI Workspace**. The TUI should not introduce a new storage model; it should present and orchestrate the existing core workflows.

## User goal

Build a beautiful, elegant TUI with three primary screens: a note/file manager, a focused editor, and an always-available Search Everything palette. The editor must be fully functional for daily writing, navigation, Unicode text, selection, clipboard operations, find, and find/replace.

## OpenTUI research notes

- Use `createCliRenderer({ screenMode: "alternate-screen", exitOnCtrlC: true })` for a full-screen terminal app and always destroy the renderer on shutdown.
- Compose the workspace from `Box` and `Text` renderables with Yoga/Flexbox layout; listen for `resize` for responsive panel changes.
- Use `renderer.keyInput.on("keypress", ...)` for global command routing and mode/overlay handling.
- Use `TextareaRenderable` for the inline editor because it already supports multiline editing, cursor movement, selection, paste, undo/redo, custom keybindings, submit hooks, `plainText`, cursor status, and editor traits.
- Use `InputRenderable` for Search Everything, find, find/replace, command prompts, and focused forms.
- Model the app as separate screens rather than a multi-pane all-at-once workspace: Manager, Editor, and Search Everything overlay/screen.
- Prefer reusable TUI state adapters over direct component file I/O, preserving the project rule that TUI is presentation/input only.

## Approaches considered

### A. Minimal TUI shell first, editor later

Deliver a polished shell, note list, read-only preview, and search prompt, then defer inline editing.

**Pros**
- lower risk for first OpenTUI integration
- easier smoke testing

**Cons**
- misses the requested fully functional editor goal
- creates a second design cycle for core interaction patterns

### B. Service-backed workspace with inline editor — recommended

Build a TUI app controller over existing core services. The TUI owns interaction state, panels, keybindings, dirty state, and presentation. Core services continue to own storage, search, selection, archive/delete/rebuild/migrate behavior.

**Pros**
- matches the requested TUI goal
- keeps storage/index behavior shared with CLI
- makes command parity testable through adapters
- lets `TextareaRenderable` provide real editor behavior without writing a full text engine

**Cons**
- larger Phase 3 than a shell-only slice
- requires careful test seams for OpenTUI/runtime behavior

### C. Spawn CLI commands from the TUI

Render a TUI around subprocess calls to `bn` for every action.

**Pros**
- maximum literal CLI parity
- quick for simple actions

**Cons**
- brittle, slower, harder to test
- duplicates parsing/formatting concerns
- makes inline editing and dirty-state handling awkward

## Recommended architecture

Use approach B: a service-backed OpenTUI workspace.

```text
bin/bn.ts / package script
  ↓
src/tui/app.ts
  - TUI bootstrap and no-TTY/renderer lifecycle
  ↓
src/tui/workspace-controller.ts
  - active note, mode, focus, dirty state, status messages
  - maps key/actions to service calls
  ↓
src/tui/adapters/*.ts
  - note list/search/editor/save/archive/delete/rebuild/migrate adapters
  - convert core results/errors into TUI view models
  ↓
src/core/*, src/storage/*, src/index/*
  - existing Phase 2 source of truth
```

## Editing model to approve

The design locks Phase 3 on **true inline editing with `TextareaRenderable`**, not external-editor handoff as the primary TUI editor.

- `enter`/`o` from the manager: open selected note into the dedicated editor screen
- printable text and Unicode input/paste: edits the inline buffer without corrupting grapheme width/cursor behavior
- `ctrl+s`: save current buffer through a TUI adapter that updates the note file and refreshes metadata/indexes through existing services or small service extraction where needed
- manager/editor switch shortcut: jump between note manager and current editor without losing editor dirty state
- dirty-state guard: warn before switching notes, archive/delete, or quit with unsaved changes
- `ctrl+z`/`ctrl+y`, cursor movement, selection movement, and select-all: delegated to `TextareaRenderable` defaults where possible
- clipboard actions: cut/copy/paste selected text through OpenTUI/editor buffer and terminal clipboard support where available
- find and find/replace: editor-local prompts that search within the current note buffer and support next/previous match navigation before replacement

External `$EDITOR` handoff remains a later optional action, not the Phase 3 baseline.

## Screen model and layout

Phase 3 uses separate screens, not a permanent three-pane workspace. Search Everything can be opened from any screen as an overlay or modal screen.

### Editor screen

The editor is intentionally distraction-free and contains only:

- top bar: note title, managed-root-relative path, filename/key, dirty/saved marker, and minimal mode context
- full-height editor body: inline `TextareaRenderable` over the current note body
- bottom bar: cursor line/column, selection count or find-match count, save status, and compact key hints

The editor must not show the manager/sidebar by default. Users switch to the manager with a shortcut, and switch back to the active editor with a shortcut or by opening/selecting a note.

Required editor capabilities:

- Unicode-aware text entry, cursor movement, and selection
- cut, copy, paste, select, and select all
- line/word/buffer navigation using standard terminal shortcuts where practical
- find within the current note
- find and replace within the current note
- save, dirty-state tracking, and guarded quit/switch behavior

### Note manager screen

The note manager is the default file-explorer-like navigation surface. It should feel like a terminal note/file manager, not an editor with sidebars.

Required manager capabilities:

- arrow-key navigation through folders/notes
- open selected note in the editor
- create, rename where supported by the storage contract, archive, delete with explicit confirmation, and refresh/rebuild actions
- select one note item for actions; future multi-select can be deferred unless it is cheap and testable
- show each note item with filename/key, title, and description
- show folder/group rows for paths such as `notes/inbox` and `notes/archive` when useful
- maintain a clear status/help area for available shortcuts and operation feedback

### Search Everything screen

Search Everything is available from anywhere via a global shortcut. It searches notes, note content, folders/paths, and commands in one surface.

Required Search Everything behavior:

- fuzzy search across note filename/key, title, description, path/folder, and indexed content
- command search using slash-prefixed entries such as `/new`, `/archive`, `/rebuild`, `/migrate`, `/find`, and `/replace`, similar to VS Code command/search palette behavior
- arrow-key navigation through results
- selecting a note opens or focuses it in the editor; selecting a folder focuses it in the manager; selecting a command executes or prompts for that command
- when a note/content result is highlighted, show a preview excerpt from the matching note content
- when a command result is highlighted, show the command description, usage, and shortcut if available
- preserve the invoking screen so canceling Search Everything returns to the previous context

## Command/action coverage

Phase 3 should cover the implemented CLI workflows through TUI actions:

- `init`: show clear no-root guidance and provide a small in-TUI init prompt only if the implementation slice keeps it testable
- `tui`: expose `bn tui` as the user-facing Phase 3 launch command and keep `bun run dev:tui` as the development script
- `new`: create a note from manager or Search Everything and open it in the editor
- `list`: manager refresh and note/folder display
- `show`: open/focus selected note in the editor, with preview snippets in Search Everything
- `search`: Search Everything backed by indexed note/content search plus command/folder matching
- `edit`: dedicated inline editor screen open/save path
- `archive`: archive selected note with confirmation
- `delete --force`: destructive delete with explicit confirmation text or two-step guard
- `rebuild`: command-palette action with status result
- `migrate`: command-palette action or no-root/legacy-root guidance, with confirmation
- `completion`: document as CLI-only shell setup; no TUI generation required beyond help text

## Error handling

- Convert `AppError` and usage/data errors into non-crashing status messages or modal panels.
- Keep destructive operations confirmation-gated.
- On renderer startup failure or no TTY, return a plain CLI-readable error instead of corrupting terminal state.
- Always destroy/suspend renderer cleanly on quit, Ctrl+C, and handled fatal errors.

## Testing strategy

- Unit-test TUI adapters and workspace state transitions without a real terminal.
- Add focused tests for action parity: list/search/select/save/archive/delete/rebuild call the same core paths or extracted services as CLI workflows.
- Add renderer smoke coverage that imports OpenTUI and verifies bootstrap metadata without requiring an interactive TTY.
- Add at least one realistic e2e or integration test around manager navigation → open note → edit/save through the TUI controller seam.
- Add targeted tests for Search Everything result ranking/preview behavior across note, content, folder/path, and slash-command results.
- Add editor-controller tests for Unicode text, selection/select-all, cut/copy/paste commands, find, and find/replace behavior at the state-adapter layer.
- Preserve existing required verification: `bun run typecheck`, `bun test`, `bun run smoke:opentui`, `bun run smoke:cli`, then `git status`.

## Approved editing model

Phase 3 is approved to use true inline editing with `TextareaRenderable` as the primary editor. The editor is a dedicated screen with only a top bar, editor body, and bottom bar. External `$EDITOR` handoff is deferred as a later optional action unless a future plan explicitly pulls it forward.

## Approved screen model

Phase 3 uses a dedicated note manager screen, a dedicated editor screen, and a globally available Search Everything screen/overlay. The editor must not be implemented as one pane inside a permanent file-manager layout.

## Approved launch surface

Phase 3 will expose `bn tui` as the user-facing TUI launch command while retaining `bun run dev:tui` for development.
