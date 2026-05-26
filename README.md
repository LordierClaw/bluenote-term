# BlueNote

BlueNote is a terminal-native, local-first note tool implemented in Bun and TypeScript. Phase 2 delivered the plain-note CLI storage/UX pivot, and Phase 3 now adds the OpenTUI workspace on top of the same storage contract.

## Status

This repository includes the approved **Phase 2 CLI storage + UX pivot** and the active **Phase 3 — TUI Workspace** implementation. The TUI is a presentation/input layer over the existing core services; it does not introduce a separate storage model.

Current goals:
- keep repository and Git hygiene aligned with active CLI/TUI work
- maintain runtime/tooling conventions
- keep Hermes and project docs aligned with the implemented workflow
- verify the command-first CLI workflow with tests and smoke checks
- preserve the Phase 2 storage contract while using the Phase 3 OpenTUI workspace

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

- Notes are plain `.md` files under `notes/`; canonical BlueNote metadata lives in `.state/notes/<key>.json` sidecars.
- The managed `.state/` layout includes `notes/`, `completions/`, `tmp/`, `logs/`, `recovery/`, `manifest.json`, `metadata.sqlite`, and `search-index.json`.
- Derived artifacts such as `.state/metadata.sqlite` and `.state/search-index.json` are rebuildable.
- `bn new`, `bn edit`, `bn archive`, and `bn delete --force` rebuild derived indexes automatically after mutating note storage.
- Selectors are key-first for everyday use; `show`, `edit`, `archive`, and `delete --force` accept canonical `key|path` selectors.
- `bn search` prints grouped note blocks with the title first, then key, path, and the highest-value match label or excerpt.
- The visible CLI command surface is `init`, `new`, `list`, `show`, `search`, `edit`, `archive`, `delete`, `rebuild`, `migrate`, `completion`, and `tui`.

## Phase 3 TUI workspace

Launch the workspace with `bn tui` (or `bun run ./bin/bn.ts tui` from the repo) from an interactive terminal. It is organized as separate screens rather than a single mixed view:

- **Manager** — file-style note navigation backed by the same note list/selectors as the CLI, with active-note focus and shortcuts for opening notes and Search Everything.
- **Editor** — a focused inline note editing screen with top/bottom bars around the editor body. Current wired Phase 3 behavior covers Unicode-safe buffer changes, save, and dirty-state handling; select-all, cut/copy/paste, and find/replace live in the tested editor adapter/controller groundwork for follow-on runtime wiring.
- **Search Everything** — a global search/command screen for notes, content matches, folders/paths, and discoverable slash-prefixed command entries such as `/new`, `/archive`, `/delete`, `/rebuild`, `/migrate`, `/find`, `/replace`, and `/save`. In the current runtime, `/save` is the built-in wired action; other command entries require handler wiring before they mutate notes.

The TUI reads and writes the same plain Markdown note files and `.state/notes/` sidecars as the CLI; note files remain plain and do not gain frontmatter. Agents can verify the real interactive path with `bun run smoke:opentui:interactive`, which launches `bn tui` inside a tmux-backed TTY and captures the Manager screen.

## Completion and migration

- Install shell completion by printing a script, then sourcing or saving it for your shell:
  - `bun run ./bin/bn.ts completion bash`
  - `bun run ./bin/bn.ts completion zsh`
  - `bun run ./bin/bn.ts completion fish`
- Shell completion is shell setup, not a TUI action. The generated completion scripts call `bn complete selectors <command> <prefix>` directly, and they stay quiet when the root or indexes are unavailable.
- `bn migrate` converts legacy frontmatter notes into plain note files plus `.state/notes/` sidecars, rebuilds derived indexes, and fails hard on mixed or unsafe roots instead of guessing.

## Repository map

- `AGENTS.md` — project-local agent guidance
- `docs/product/overview.md` — product scope and goals
- `docs/architecture/` — runtime, storage, and indexing references
- `docs/phases/` — staged implementation roadmap
- `docs/workflow/` — developer + Hermes workflow conventions
- `docs/plans/` — saved planning artifacts and implementation/design plans

## Current implementation note

The repository now includes a working Phase 2 storage/UX CLI flow plus the Phase 3 TUI workspace. The roadmap continues with workflow hardening in Phase 4 and release hardening in Phase 5.
