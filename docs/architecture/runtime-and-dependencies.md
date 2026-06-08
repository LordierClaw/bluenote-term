# Runtime and Dependencies

## Runtime rules

Phase 8 introduces the temporary monorepo/package split documented in `docs/phases/phase-8-temporary-monorepo.md`.

- Use Bun `1.3+` as the preferred runtime for CLI/TUI work, local scripts, smoke checks, and the current repository entrypoint.
- Preserve Node.js `20+` compatibility for shared core modules where feasible; current `bin/` commands and scripts are intentionally Bun-first.
- Avoid native SQLite dependencies; use `sql.js` for rebuildable cache metadata.
- Keep `packages/core` headless: it owns business logic, storage, search/indexing, domain helpers, and reusable AI services, and must not import OpenTUI or `packages/term`.
- Keep `packages/term` client-only: it owns the Bun CLI entrypoint, TUI/OpenTUI rendering and input, terminal editor launch, clipboard helpers, and client orchestration, and consumes business logic through `@bluenote/core` public exports.
- Root `bin/bn.ts` and moved root `src/cli`, `src/tui`, `src/platform`, and editor-flow paths are compatibility shims to preserve existing root scripts/tests while the temporary monorepo split is completed.

## Current baseline dependencies

- `@bluenote/core` — public headless core package consumed by the terminal client
- `@opentui/core` — terminal UI foundation owned by `packages/term` for the workspace launched by `bn tui`
- `sql.js` — rebuildable metadata cache engine used by `packages/core`
- `minisearch` — rebuildable text index used by `packages/core`
- `js-yaml` — legacy frontmatter parsing support used by `packages/core` for migration only; current note files remain plain Markdown plus sidecars
- `clipboardy` — desktop clipboard bridge owned by `packages/term` for explicit whole-note clipboard commands before platform fallbacks
- `typescript` / `@types/node` — strict project typing
- `@biomejs/biome` — linting

## TUI runtime shape

The OpenTUI runtime hosts three separate workspace screens with a shared restrained blue theme for focus, active items, muted metadata, and status chrome:

- **Manager** for note and folder navigation over existing note summaries and selectors. It keeps empty user folders visible while hidden dot-directories and BlueNote internal folders remain hidden. Right/open enters folders or opens notes; left/back returns to the previous folder or screen; `/` filters the current folder; `n` creates a new note; `d` deletes the focused note only after confirmation; `Ctrl+P` opens Search Everything.
- **Editor** for focused inline editing of plain Markdown note bodies with calm top/bottom chrome, cursor-aware text input, Unicode-safe editing, `Ctrl+S` save, `Ctrl+F` find, `Ctrl+R` replace, undo/redo, wrap mode, and 750 ms autosave guarded against stale completion. Autosave and manual save use the same safe note-body write path. Manual save and autosave never call the configured provider API. Failed saves keep the buffer dirty and retry later; there is no recovery-copy workflow.
- **Search Everything** for global note, content, folder/path, and context-filtered slash-command search in a single input with result-list and preview. Editor context exposes working editor commands such as `/find`, `/replace`, `/save`, `/copy-all`, `/replace-all`, and `/paste`; Manager context exposes `/new` plus `/delete` when a note action is available. Unwired commands are omitted rather than shown as unavailable.

The TUI consumes the same core services and storage layout as the CLI: note files remain plain Markdown with no required frontmatter, BlueNote metadata stays in `.data/notes/` sidecars, and rebuildable metadata/search artifacts live at `.data/metadata.sqlite` and `.data/search-index.json`. Legacy `.state/` directories are migration input only.

AI processing runs in idle background tasks after saved editor changes and does not block startup, rendering, editor input, navigation, note switching, save/autosave, status refreshes, or quit. The TUI uses a 10-second editor idle timer after a successful save, a 5-second manager idle timer after switching from Editor to Manager, and immediate queueing when Manager opens another note, and queue processing starts as soon as possible without blocking input after local queue updates. Pending AI work is kept durably in `.data/ai/queue.json`; failed jobs retry until `maxAttempts` (default `3`) and retain sanitized error details when exhausted. The default prompt uses the configured `outputLanguage` (default `English`) for a short description or summary description. Default TUI startup scans note sidecar `updatedAt` timestamps against `ai.description.lastProcessedAt` and refreshes stale queued work without delaying Manager rendering. Manager renders AI status only on the right side of the current-open row, with color intent and no normal queued-count wording; Editor hides AI status and keeps editor shortcuts visible. Provider selection is abstracted behind the AI client factory: OpenAI-compatible API-key providers remain supported, while Codex provider uses root-local auth state and CLI-managed `bn ai codex auth login/status/logout` commands. TUI status and background work never start Codex login automatically.

`bn search`, Manager filtering, Search Everything, and slash-command discovery use contains-style matching; query `123` only matches actual searchable fields or content containing `123`. `bn tui` is the workspace launch command. `Escape` and `Ctrl+[` close the active mode/overlay first, then navigate back through workspace history toward the root manager; exit stays explicit through `q` or `Ctrl+C`.

The current import-only TUI smoke status is `tui-workspace-ready`; current follow-up metadata is `hardening-follow-up`.

## Validation expectations

- dependency install must succeed with Bun
- lint must pass with `biome lint --diagnostic-level=error .`
- typecheck must pass with `tsc --noEmit`
- tests must pass with `bun test`
- OpenTUI import health must pass through `bun run smoke:opentui`
- CLI smoke must pass through `bun run smoke:cli`

The combined public gate is:

```bash
bun run check
```

Manual computer-use, screenshot, or interactive terminal verification is not required for ordinary console-environment work unless specifically requested.
