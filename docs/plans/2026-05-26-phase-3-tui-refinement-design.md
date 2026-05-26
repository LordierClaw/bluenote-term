# Phase 3 TUI Refinement Design

Date: 2026-05-26
Status: Approved
Scope: Manual-test feedback refinement for the Phase 3 OpenTUI workspace

## Context

Manual testing of `bun run ./bin/bn.ts tui` confirmed the TUI now launches, but exposed interaction and layout gaps that change the Phase 3 acceptance criteria. Per the BlueNote workflow, implementation must pause until this refinement design and its follow-up implementation plan are approved.

This refinement preserves the existing storage contract:

- note files remain plain Markdown
- metadata remains in `.state/notes/` sidecars
- derived search/list indexes remain rebuildable `.state/` artifacts
- TUI remains a presentation/input layer over core services

## User feedback to address

1. Editor `Ctrl+F` does nothing.
2. Manager should behave like a file explorer over folders, subfolders, and note files using simple arrow keys, with better visual focus and distinct folder/file/metadata presentation.
3. Search Everything currently renders multiple search boxes and collapses/breaks while typing.
4. Every screen/window must have an easy path back to the original view.
5. Editor should autosave.

## OpenTUI notes relevant to the redesign

- Use Yoga/Flexbox row/column layouts for stable manager columns and Search Everything vertical regions.
- Use explicit focus ownership: only one `InputRenderable`/`TextareaRenderable` should be focused at a time.
- Use global `renderer.keyInput` for screen-level shortcuts and delegate printable input only to the focused component.
- Use a single `InputRenderable` for Search Everything and editor find prompts; duplicated input renderables should be treated as a bug.
- Use OpenTUI text foreground/background colors and attributes for semantic highlights, status bars, borders, and popup emphasis instead of monochrome ASCII-only rendering.
- For agent verification, use tmux-backed interactive smoke tests that capture the pane and exercise keys, not only import-level smoke checks.

## Recommended approach

Use a **state-machine refinement** over the existing service-backed workspace instead of replacing the architecture.

The current adapter/controller architecture remains valid, but Phase 3 needs clearer runtime modes:

```text
manager
  ├─ manager.filter
  └─ manager.confirmation
editor
  ├─ editor.body
  ├─ editor.find
  ├─ editor.replace
  └─ editor.autosave.pending|saving|saved|error
search
  ├─ search.input
  └─ search.results
```

The renderer must be rebuilt around the active screen/mode so each mode owns exactly one focused editable component.

## Design decisions

### 0. Visual design, color, and chrome

The TUI should be visually polished, not monochrome. Phase 3 refinement includes a small semantic theme used consistently across Manager, Editor, Search Everything, bars, prompts, and confirmations.

Recommended theme direction:

- Background: dark neutral base so content feels calm and readable.
- Primary accent: blue/cyan for active focus, current path, and selected/open note markers.
- Secondary accent: purple or amber for Search Everything and command entries.
- Success: green for saved/autosave-complete states.
- Warning: amber for dirty/pending/autosave states.
- Danger: red for destructive actions, delete/archive confirmation, and save failures.
- Muted: gray/dim for metadata, descriptions, inactive hints, and disabled actions.

Required visual rules:

- Focused/hovered row must use a clear background highlight, not only a text marker.
- The currently open note uses a separate marker/color from hover focus.
- Folder rows and note rows are visually distinct by icon and color.
- Topbars and bottombars use colored backgrounds and compact key hints.
- Search Everything, find bars, filters, and confirmations render as clearly bounded windows/panels with titles.
- Popups/confirmation windows use a stronger border/title color and dim or visually separate the underlying content where feasible.
- Status messages use semantic colors: success, warning, danger, muted.
- Color should improve clarity but not be the only signal; icons/text labels remain present for accessibility and low-color terminals.

Approved decision: Phase 3 refinement includes semantic color/highlight styling as part of acceptance criteria.

### 1. Editor find and find/replace

`Ctrl+F` in the editor opens a compact find bar inside the editor screen, not Search Everything.

Layout:

```text
[topbar: title/path/save status]
[find: query input, match count, next/prev/escape hints]  ← visible only in find mode
[textarea body]
[bottombar: cursor, dirty/autosave, key hints]
```

Behavior:

- `Ctrl+F`: enter editor find mode and focus one input.
- Typing updates matches against the current editor buffer.
- `Enter`: jump to next match.
- `Shift+Enter` or an explicit shortcut: previous match where supported by terminal key parsing.
- `Escape`: close find bar and return focus to the editor body.
- `Ctrl+H` or `/replace` can enter replace mode after find mode is stable.
- If no editor is open, `Ctrl+F` should be ignored or route to manager filter depending on active screen.

### 2. Editor autosave

Autosave supplements manual `Ctrl+S`; it does not remove `Ctrl+S`.

Recommended behavior:

- On body change, mark dirty immediately.
- Debounce autosave for a short interval after the last edit.
- Save through the same persistence path as `Ctrl+S`.
- Display state in the bottom bar: `Unsaved`, `Autosaving…`, `Saved`, or `Autosave failed`.
- Never allow an older async autosave completion to overwrite a newer editor body or a different active note.
- Preserve dirty-state guard only when autosave is pending/failed; clean autosaved notes should switch/quit without a false warning.
- Autosave uses a **750ms debounce** after the last body edit.

Approved decision: autosave debounce interval is 750ms.

### 3. Manager file-explorer redesign

The manager becomes a **two-column browser + preview file explorer**. Layout 1 is the primary navigation column. Layout 2 is a preview column that changes based on the hovered item in Layout 1.

Recommended desktop-width layout:

```text
[topbar: current path → highlighted item path]
┌ Layout 1: current folder ─────────────────────┬ Layout 2: preview ───────────────────────────┐
│ name                 │ title      │ desc      │ name                 │ title      │ desc      │
│ 📁 projects          │            │           │ 📁 api               │            │           │
│ 📁 archive           │            │           │ 📄 roadmap.md        │ Roadmap    │ Phase plan│
│ 📄 daily-plan.md     │ Daily plan │ Today...  │                      │            │           │
└ filter/status/actions─────────────────────────┴ preview/status──────────────────────────────┘
```

Approved decision: manager navigation model is the two-column browser + preview layout.

Behavior:

- Layout 1 is the only active navigation column for normal manager movement.
- Up/down arrows move the hover/focus item in Layout 1.
- When the hovered Layout 1 item is a folder, Layout 2 previews that folder's immediate folders and note files using the same visual style as Layout 1.
- When the hovered Layout 1 item is a note file, Layout 2 previews the note content.
- Right arrow opens the hovered item: folders become the new Layout 1 current folder; note files open in the editor.
- Left arrow goes back to the parent folder. At the managed root it should either no-op or show a calm status message.
- Enter may mirror right-arrow behavior for accessibility, but right/left are the primary open/back navigation keys.
- The topbar shows both the current folder path and the highlighted/hovered item path.
- Layout 1 and Layout 2 folder previews use the same list style.
- Folder and note rows are distinct with icons/colors/labels.
- Note-file rows show three columns: filename, title, description.
- Folder rows show the folder name and keep title/description empty or use subtle folder metadata/counts if cheap and testable.
- The manager only shows folders and BlueNote note files; it must not show sidecar files, derived index files, hidden app state, arbitrary non-note files, or unsupported file types.
- `/` or `Ctrl+F` in manager opens manager filter mode.
- Filter narrows visible folders/notes in Layout 1 while preserving current folder context and updating Layout 2 from the hovered filtered item.
- Manage-file actions remain available from the manager for the focused note where supported by core services: create, archive, delete with explicit confirmation, refresh/rebuild, and open editor. Rename remains limited by the current storage/service contract unless a future plan adds a dedicated rename flow.
- Focused/hovered item has a strong highlight; currently open note has a separate marker.

Responsive fallback:

- On narrow terminals, keep Layout 1 primary and toggle Layout 2 preview visibility with a documented shortcut or collapse the preview below the list.

### 4. Search Everything layout and stability

Search Everything should render exactly one search input.

Layout:

```text
[searchbox]
[search list result]
---
[result preview/description for selected result]
```

Behavior:

- Opening Search Everything records `previousScreen` and `previousMode`.
- Only the search input is focused while Search Everything is active.
- Typing updates one query state and one result list.
- The renderer must remove or reuse old input renderables so repeated typing does not stack boxes or collapse layout.
- Up/down changes selected result.
- Enter activates selected result.
- Escape returns to the exact previous screen/mode.
- `Ctrl+P` or the same shortcut can also toggle back if already in Search Everything.

### 5. Global return/back rule

Every screen, overlay, prompt, and temporary mode must provide a clear exit path.

Default rule:

- `Escape`: close the current transient mode/window and return to the previous view.
- `Ctrl+[` is treated as an Escape equivalent where OpenTUI reports it.
- `Ctrl+P`: toggle Search Everything; if already in Search Everything, return to previous view.

Approved decision: the primary back binding is **both Escape and Ctrl+[**.
- `Ctrl+M` or another documented shortcut can jump to Manager from Editor.
- `Ctrl+E` or opening a note returns to Editor.
- Quit remains guarded by dirty/autosave state.

This rule should be visible in status/help text and covered by controller tests.

## Implementation strategy after approval

The implementation plan should split this into small TDD tasks:

1. Add semantic TUI theme tokens and visual/chrome view-model fields for focus, selection, bars, panels, popups, and status messages.
2. Add explicit TUI mode/state model for editor find, manager filter, Search Everything previous mode, autosave state.
3. Fix key routing so `Ctrl+F`, `Escape`, `Ctrl+P`, and screen-local shortcuts dispatch correctly from the runtime layer.
4. Implement editor find bar with one focused input and tmux smoke coverage for `Ctrl+F` visibility.
5. Implement autosave debounce/state with stale async completion guards.
6. Redesign manager adapter/view model into current-folder Layout 1 plus hover-driven Layout 2 preview.
7. Render the manager two-column browser/preview layout with strong color-backed focus/selection styling and responsive fallback.
8. Rebuild Search Everything runtime rendering around a single input/list/preview layout with colored panel chrome.
9. Add interactive smoke tests for Search Everything open/type/escape and manager navigation.
10. Update docs/help/status text.
11. Run full verification and review.

## Testing strategy

- Unit tests for pure state transitions and adapters.
- Runtime routing tests for raw OpenTUI key events to logical actions.
- Integration tests for manager folder navigation, editor find, autosave, Search Everything cancellation, semantic color/chrome view models, and layout view models.
- tmux-backed interactive smoke tests for:
  - launching TUI to Manager
  - opening Search Everything, typing text, seeing a single input, pressing Escape to return
  - opening a note, pressing `Ctrl+F`, seeing the find bar, pressing Escape to return to body
- Full project check remains:
  - `bun run typecheck`
  - `bun test`
  - `bun run smoke:opentui`
  - `bun run smoke:opentui:interactive`
  - `bun run smoke:cli`

## Approval checkpoint

Autosave debounce, manager layout, and back bindings are now settled. Awaiting approval of this refined design before writing the detailed TDD implementation plan.
