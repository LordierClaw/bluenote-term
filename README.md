# BlueNote

BlueNote is a terminal-native, local-first note tool implemented in Bun and TypeScript. Phase 2 delivered the plain-note CLI storage/UX pivot, Phase 3 added the OpenTUI workspace, Phase 4A makes `.data/` the canonical internal app-state layout, Phase 4B delivers the editor input/cursor/responsive-chrome work, Phase 4C delivers the Manager performance/responsive layout/style refinement, Phase 4D delivers the Search Everything readability/responsive preview refinement, and Phase 4E delivers autosave atomicity with safe note-body writes while preserving the same plain Markdown notes.

## Status

This repository includes the approved **Phase 2 CLI storage + UX pivot**, **Phase 3 — TUI Workspace**, the **Phase 4A `.data` + contains-search foundation**, **Phase 4B editor input/cursor/responsive chrome**, the accepted **Phase 4C Manager performance/responsive layout/style** work, the accepted **Phase 4D Search Everything readability/responsive preview** work, and the accepted **Phase 4E autosave atomicity / safe note-body write** work. The TUI is a presentation/input layer over the existing core services; it does not introduce a separate storage model.

Current goals:
- keep repository and Git hygiene aligned with active CLI/TUI work
- maintain runtime/tooling conventions
- keep Hermes and project docs aligned with the implemented workflow
- verify the command-first CLI workflow with tests and smoke checks
- preserve plain Markdown notes while using the canonical `.data/` app-state layout and Phase 3 OpenTUI workspace

## Runtime

- Bun `1.3+` preferred for TUI/dev workflows and the current CLI scripts
- Node.js `20+` compatibility target for shared core pieces; repo-entry scripts are currently Bun-first

## Commands

```bash
bun install
bun run check:env
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
```

Run the CLI through the package entrypoint during development:

```bash
bun run ./bin/bn.ts --help
bun run ./bin/bn.ts tui
```

## Current CLI workflow

- Notes are plain `.md` files under `notes/`; canonical BlueNote metadata lives in `.data/notes/<key>.json` sidecars.
- The managed `.data/` layout includes `notes/`, `completions/`, `tmp/`, `logs/`, `recovery/`, `manifest.json`, `metadata.sqlite`, and `search-index.json`.
- Derived artifacts such as `.data/metadata.sqlite` and `.data/search-index.json` are rebuildable from note files and sidecars.
- `.state/` is legacy input for safe migration into `.data/`; new/current roots should not treat `.state/` as canonical app state.
- `bn new`, `bn edit`, `bn archive`, and `bn delete --force` rebuild derived indexes automatically after mutating note storage.
- Selectors are key-first for everyday use; `show`, `edit`, `archive`, and `delete --force` accept canonical `key|path` selectors.
- `bn search` uses contains-style matching and prints grouped note blocks with the title first, then key, path, and the highest-value match label or excerpt. Query `123` only matches notes whose key, filename/path, title, description, or content actually contains `123`.
- The visible CLI command surface is `init`, `new`, `list`, `show`, `search`, `edit`, `archive`, `delete`, `rebuild`, `migrate`, `completion`, and `tui`.

## Phase 3 TUI workspace

Launch the workspace with `bn tui` (or `bun run ./bin/bn.ts tui` from the repo) from an interactive terminal. It is organized as separate screens rather than a single mixed view and uses a restrained blue theme for focused rows, active items, muted metadata, and status chrome:

- **Manager** — a minimal Manager screen with a responsive two-column browser/preview home screen backed by the same note list/selectors as the CLI. Phase 4C Manager performance/responsive layout/style is accepted and delivered: its chrome shows useful context only, including the current folder path, focused item/hovered path, rebuild/index status, and short action hints such as move, open, filter, Search Everything, preview toggle, back, and quit. Preview work is cached/avoidable, preview auto-hide engages on narrow terminals, and the manual preview toggle lets users hide or show the preview when space allows. Use right/open to enter a folder or open the selected note, left/back to return to the previous folder or screen, `n` to create a new note, and `d` to delete the focused note only after an explicit confirmation. `Escape` and `Ctrl+[` follow the same back rule for closing active modes and returning toward the root manager; quitting remains `q` or `Ctrl+C`.
- **Editor** — a focused inline note editing screen with top/bottom bars around the editor body. Current wired behavior covers real editor body input, live typing/input regression coverage, a visible cursor marker, Unicode-safe cursor-aware buffer changes, newline/backspace/delete, explicit `Ctrl+S save`, dirty-state handling, `Ctrl+F` find mode, and 750ms autosave guarded against stale completions. Phase 4E autosave atomicity is accepted and delivered: autosave and manual `Ctrl+S` use the same safe note-body write path, failed saves keep the buffer dirty and retry later, no recovery-copy workflow is created, and stale temp files are a BlueNote-owned internal implementation detail. The bottom bar shows save/autosave status, `Line`/`Col` cursor position, wrap mode, and priority shortcuts; `Alt+Z wrap` toggles word/no-wrap mode without dirtying the note, and the responsive bottom bar hides lower-priority hints on narrow terminals. Select-all and cut/copy/paste remain adapter/controller groundwork for follow-on runtime wiring, while literal multi-character paste fallback is covered by smoke tests.
- **Search Everything** — a global search/command screen with a single input, result list, and preview for notes, content matches, folders/paths, and discoverable slash-prefixed command entries such as `/new`, `/archive`, `/delete`, `/rebuild`, `/migrate`, `/find`, `/replace`, and `/save`. Phase 4D Search Everything readability/responsive preview is accepted and delivered: contains-style matching is shared with `bn search`, typed results remain readable whether selected or not, preview content is split into separated preview sections, responsive preview auto-hide engages when terminal height is constrained, and the manual `Alt+P` preview toggle hides or restores the preview when space allows. In the current runtime, `/save` is the built-in wired action; other command entries require handler wiring before they mutate notes and show a safe unavailable command status instead of pretending to run. `Escape` or `Ctrl+[` backs out to the invoking screen.

The TUI reads and writes the same plain Markdown note files and `.data/notes/` sidecars as the CLI; note files remain plain and do not gain frontmatter. Manager filtering and Search Everything follow the same contains-style search contract as `bn search`. Agents can verify the real interactive path with `bun run smoke:opentui:interactive`, which launches `bn tui` inside a tmux-backed TTY and covers Manager navigation plus editor cursor/input regression behavior, responsive resizing, save status, and return-to-manager flow.

## Completion and migration

- Install shell completion by printing a script, then sourcing or saving it for your shell:
  - `bun run ./bin/bn.ts completion bash`
  - `bun run ./bin/bn.ts completion zsh`
  - `bun run ./bin/bn.ts completion fish`
- Shell completion is shell setup, not a TUI action. The generated completion scripts call `bn complete selectors <command> <prefix>` directly, and they stay quiet when the root or indexes are unavailable.
- `bn migrate` converts legacy frontmatter notes into plain note files plus `.data/notes/` sidecars, migrates legacy `.state/` metadata into `.data/` when safe, rebuilds derived `.data/metadata.sqlite` and `.data/search-index.json` artifacts, and fails hard on mixed or unsafe roots instead of guessing.

## Repository map

- `AGENTS.md` — project-local agent guidance
- `docs/product/overview.md` — product scope and goals
- `docs/architecture/` — runtime, storage, and indexing references
- `docs/phases/` — staged implementation roadmap
- `docs/workflow/` — developer + Hermes workflow conventions
- `docs/plans/` — saved planning artifacts and implementation/design plans

## Current implementation note

The repository now includes a working CLI flow, the Phase 3 TUI workspace, the Phase 4A `.data`/contains-search foundation, the accepted Phase 4B editor input/cursor/responsive-chrome behavior, the accepted Phase 4C Manager performance/responsive layout/style behavior, the accepted Phase 4D Search Everything readability/responsive preview behavior, and the accepted Phase 4E autosave atomicity / safe note-body write behavior. The current neutral follow-up marker is `phase-4-next-hardening-subplan`; scratch/archive hardening remains future hardening and should not be treated as delivered.
