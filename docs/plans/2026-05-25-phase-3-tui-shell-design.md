# Phase 3 TUI Shell Design

Date: 2026-05-25
Status: Approved brainstorm baseline
Scope: BlueNote Phase 3 TUI shell

## Context

BlueNote now has a working Phase 2 CLI/storage foundation:

- plain Markdown note files under `notes/`
- `.state/notes/` sidecar metadata
- rebuildable metadata/search indexes
- stable CLI flows for init, new, list, show, search, edit, archive, delete, rebuild, migrate, and completion

The current TUI scaffold is intentionally thin: `src/tui/app.ts` only reports bootstrap readiness and the OpenTUI smoke check confirms the renderer dependency loads. The next phase should turn that scaffold into a real shell without duplicating CLI/storage logic already implemented in `src/core/`, `src/storage/`, `src/index/`, and `src/config/`.

## Phase goal

Establish the first real BlueNote terminal UI shell with:

- renderer/bootstrap flow
- screen layout primitives and regions
- input and keymap baseline
- startup/error/fallback handling
- an initial navigation/editor mode split

## Design constraints

- keep the TUI as a presentation/input layer over existing core services
- preserve local-first, offline-first behavior
- prefer Bun + OpenTUI for runtime and smoke checks
- avoid inventing a second note/state model inside the TUI
- keep user-visible storage and selector behavior aligned with the Phase 2 CLI contract
- do not quietly expand this phase into full editor/search/recovery scope already assigned to later phases

## Alternatives considered

### A. Pane-based shell over existing core services — recommended

Build one persistent app shell with stable regions such as sidebar, main content, status bar, and command/help area. The shell owns focus, selection, mode, and rendering state, but delegates note loading and mutations to existing core services.

**Pros**
- best fit for the current phase goal of layout + keymap + bootstrap
- reuses Phase 2 CLI/core behavior instead of forking logic
- keeps the architecture ready for later search/recovery/editor work
- easier to smoke-test than a multi-scene app

**Cons**
- requires careful boundaries so UI state does not leak into storage logic
- inline editing raises the complexity of cursor, buffer, and dirty-state management earlier in the roadmap

### B. Scene/router-based full-screen views

Build separate full-screen views for home, list, note detail, help, and future search/editor screens, then add a router stack between them.

**Pros**
- clean conceptual separation between screens
- easy to reason about one screen at a time

**Cons**
- more structure than the current phase needs
- higher navigation churn for an editor-first tool
- risks redoing layout/state machinery again when split panes arrive

### C. External-editor launcher with a very light TUI wrapper

Keep the TUI mostly as a launcher/status surface and continue to offload actual editing to `$EDITOR` immediately.

**Pros**
- lowest implementation risk
- strongly reuses existing `bn edit` behavior

**Cons**
- underdelivers on the explicit Phase 3 shell goal
- provides weak value beyond the existing CLI
- delays meaningful mode/layout work too far

## Recommended direction

Choose **A: pane-based shell over existing core services**.

Within that direction, Phase 3 should include a **true inline editing buffer** from the start, while still keeping storage and mutation logic in the existing core layers. The TUI should own cursor, selection, dirty-state, and editor interaction state, but it should delegate persistence, selector resolution, rebuild behavior, and recovery-safe writes to the established services.

That means Phase 3 should deliver:

- a real editable note buffer in the main pane
- navigation mode vs editor mode with explicit focus transitions
- dirty-state and save/discard feedback in the shell
- save flows that call core write/update paths instead of inventing TUI-only storage behavior

External-editor handoff can remain available as a compatibility escape hatch, but it should no longer be the primary write path for this phase.

## Proposed architecture

```text
src/tui/
  app.ts                  -> bootstrap + app wiring
  shell/
    shell-state.ts        -> focus/mode/selection/session state
    shell-actions.ts      -> UI actions mapped to core-service calls
    shell-layout.ts       -> region composition
    shell-keymap.ts       -> key bindings by mode
  views/
    sidebar.ts            -> note list / navigation region
    note-pane.ts          -> note body/detail region
    status-bar.ts         -> mode, root, messages, errors
    empty-state.ts        -> no-root / no-note / loading cases
  adapters/
    note-browser.ts       -> thin adapter over list/show/select flows
    editor-launch.ts      -> handoff to existing edit workflow
```

### State boundaries

**TUI-owned state**
- current screen focus
- selected note key/path
- visible collection slice
- mode (`navigation`, `note`, `command`, later `search`)
- ephemeral status/error messages

**Core-owned state**
- note storage and metadata
- selector resolution
- rebuild/indexing behavior
- mutation workflows
- root/config discovery

## UX baseline for Phase 3

### Initial layout

```text
┌ Sidebar / note list ┬ Main note pane                          ┐
│ root summary        │ title                                   │
│ current section     │ key + path                              │
│ note rows           │ description                             │
│ shortcuts hint      │ body preview / editor region            │
├─────────────────────┴──────────────────────────────────────────┤
│ status bar: mode • root • message • key hints                 │
└────────────────────────────────────────────────────────────────┘
```

### Startup behavior

1. load root context
2. detect whether a managed root exists
3. if no root: show a guided empty state with the exact init command
4. if root exists: load note summaries through existing list/select flows
5. render selected note detail in the main pane
6. surface recoverable load/index errors in the status area without crashing the shell silently

### Mode baseline

- **Navigation mode**: move through notes and panes
- **Note mode**: focus the main content pane for reading / future editing affordances
- **Command/help mode**: show key hints and shell actions

### Keymap baseline

Recommended starter bindings:

- `j` / `k` or arrow keys: move selection
- `tab`: cycle focus regions
- `enter`: open/focus selected note
- `e`: trigger external editor for selected note
- `r`: refresh/reload notes from current root
- `?`: toggle help/shortcuts
- `q`: quit

## Non-goals for Phase 3

Leave these out unless a later approved design expands scope:

- full fuzzy search UX
- autosave and crash recovery orchestration
- template/today/scratch workflows
- archive/history redesign
- complex command palette
- advanced editing features beyond a single-note inline buffer baseline, such as multi-buffer workflows, split editing, macros, or Vim-grade modal text objects

## Validation targets

- unit coverage for shell state and keymap behavior
- smoke coverage that boots the TUI shell, not just the package import
- graceful no-root behavior test
- typecheck remains green
- existing CLI smoke/tests remain green after TUI wiring changes

## Planned implementation slices

1. shell bootstrap + no-root/ready-root state wiring
2. pane layout primitives and status bar
3. note list adapter + selected note detail pane
4. mode/focus state + starter keymap
5. inline editor buffer, cursor movement, dirty-state tracking, and save/discard flows
6. optional external-editor handoff as a compatibility escape hatch
7. TUI smoke and focused tests

## Approval status

The design baseline now assumes a **true inline editing buffer** in Phase 3. If that matches your intent, the next step is to write the detailed implementation plan for subagent-driven execution.
