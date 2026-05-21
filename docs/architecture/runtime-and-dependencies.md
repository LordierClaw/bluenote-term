# Runtime and Dependencies

## Runtime rules

- Use Bun `1.3+` as the preferred runtime for TUI work, local scripts, and the current scaffold CLI entrypoint.
- Preserve Node.js `20+` compatibility for shared core modules where feasible; the current repo-entry scripts and `bin/` commands are intentionally Bun-first during the scaffold phase.
- Avoid ESM-only dependencies except where the TUI stack requires them.
- Avoid native SQLite dependencies; use `sql.js` for rebuildable cache metadata.

## Current baseline dependencies

- `@opentui/core` — terminal UI foundation
- `sql.js` — rebuildable metadata cache engine
- `minisearch` — rebuildable text index
- `js-yaml` — frontmatter parsing support
- `typescript` / `@types/node` — strict project typing

## Validation expectations

- dependency install must succeed with Bun
- typecheck must pass with `tsc --noEmit`
- OpenTUI import health must pass through a non-interactive smoke script
