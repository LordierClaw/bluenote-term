# Runtime and Dependencies

## Runtime rules

- Use Bun `1.3+` as the preferred runtime for TUI work, local scripts, and the current CLI entrypoint.
- Preserve Node.js `20+` compatibility for shared core modules where feasible; the current repo-entry scripts and `bin/` commands are intentionally Bun-first.
- Avoid ESM-only dependencies except where the TUI stack requires them.
- Avoid native SQLite dependencies; use `sql.js` for rebuildable cache metadata.

## Current baseline dependencies

- `@opentui/core` — terminal UI foundation for the Phase 3 workspace launched by `bn tui`
- `sql.js` — rebuildable metadata cache engine
- `minisearch` — rebuildable text index
- `js-yaml` — legacy frontmatter parsing support for migration only; current note files remain plain Markdown plus sidecars
- `typescript` / `@types/node` — strict project typing

## Phase 3 TUI runtime shape

The OpenTUI runtime hosts three separate workspace screens with a shared restrained blue theme for focus, active items, muted metadata, and status chrome:

- **Manager** for two-column browser/preview note and folder navigation over existing note summaries and selectors. Right/open enters folders or opens notes; left/back returns to the previous folder or screen; `n` creates a new note; `d` deletes the focused note only after confirmation.
- **Editor** for focused inline editing of plain Markdown note bodies with top/bottom status chrome, live typing/input regression coverage, `Ctrl+F` find mode, and 750ms autosave guarded against stale completion.
- **Search Everything** for global note, content, folder/path, and slash-command entry search in a single-input, result-list, and preview layout. Phase 4D Search Everything readability/responsive preview is accepted and delivered: it keeps contains-style matching, readable typed results, separated preview sections, responsive preview auto-hide at constrained heights, a manual `Alt+P` preview toggle, and safe unavailable command status for unwired command entries. `/save` is wired by default, while other entries require command handlers before they perform mutations.

The TUI consumes the same core services and storage layout as the CLI: note files remain plain Markdown with no required frontmatter, BlueNote metadata stays in `.data/notes/` sidecars, and rebuildable metadata/search artifacts live at `.data/metadata.sqlite` and `.data/search-index.json`. Legacy `.state/` directories are migration input only. `bn search`, Manager filtering, Search Everything, and slash-command discovery use contains-style matching; query `123` only matches actual searchable fields or content containing `123`. `bn tui` is the workspace launch command; shell completion remains CLI shell setup through `bn completion <bash|zsh|fish>`, not a TUI action. `Escape` and `Ctrl+[` apply the global back rule by closing the active mode/overlay first, then navigating back through workspace history toward the root manager; exit stays explicit through `q` or `Ctrl+C`.

## Validation expectations

- dependency install must succeed with Bun
- typecheck must pass with `tsc --noEmit`
- OpenTUI import health must pass through a non-interactive smoke script
- CLI smoke must verify the visible help surface includes `tui` without launching an interactive TUI
