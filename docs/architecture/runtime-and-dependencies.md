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

The OpenTUI runtime hosts three separate workspace screens:

- **Manager** for note/folder navigation over existing note summaries and selectors
- **Editor** for focused inline editing of plain Markdown note bodies with top/bottom status chrome
- **Search Everything** for global note, content, folder/path, and slash-command entry search; `/save` is wired by default, while other entries require command handlers before they perform mutations

The TUI consumes the same core services and storage layout as the CLI. `bn tui` is the workspace launch command; shell completion remains CLI shell setup through `bn completion <bash|zsh|fish>`, not a TUI action.

## Validation expectations

- dependency install must succeed with Bun
- typecheck must pass with `tsc --noEmit`
- OpenTUI import health must pass through a non-interactive smoke script
- CLI smoke must verify the visible help surface includes `tui` without launching an interactive TUI
