# bluenote-term Agent Guide

## Role

`bluenote-term` is the terminal/TUI client for BlueNote. It may use Bun, OpenTUI, and newer Node versions when required.

## Owns

- terminal UX, layout, rendering, and restrained styling
- OpenTUI behavior
- keybindings and terminal input handling
- TUI command behavior and reusable TUI command API when needed by `bluenote`
- terminal editor/clipboard integration and terminal release packaging until superseded by distribution work

## Does not own

- core note model, storage layout, search semantics, or AI semantics
- browser UI or local web UI server behavior
- official long-term multi-command distribution orchestration (`bluenote` owns that)
- daemon/runtime/sync protocol without cross-repo design first

## Runtime compatibility

Bun/OpenTUI/newer Node are allowed. Do not impose this runtime requirement on `bluenote-core`, `bluenote-webui`, or `bluenote`.

## Public API/export rules

- Consume `@lordierclaw/bluenote-core` through public package exports only.
- Do not import `@lordierclaw/bluenote-core/src/*`, sibling `../bluenote-core/src/*`, or generated `dist/*` internals.
- Expose reusable TUI command APIs through package-level public entrypoints when the distribution repo needs them.

## Dependency rules

- Should consume core public APIs.
- Must not duplicate core storage/search/AI semantics.
- Must not make core depend on terminal code or OpenTUI.

## Read first

1. Parent `.agent/CURRENT_TASK.md` when working from the parent workspace.
2. Parent `AGENTS.md`.
3. `../bluenote/AGENTS.md` and `../bluenote/docs/*` for cross-repo rules.
4. This file.
5. `DEVELOPMENT.md`, `MIGRATION.md`, `README.md`, and relevant `docs/*`.

Older phase/migration docs are historical unless the active task references them.

## Common tasks

- Terminal layout/keybinding/OpenTUI behavior: edit this repo.
- Core behavior needed by TUI: add public core API in `bluenote-core` first, then consume it here.
- Distribution command routing/help/version/doctor: edit `bluenote`.
- Browser UI behavior: edit `bluenote-webui`.

## Checks

- Docs-only: `git status` plus file inspection.
- TUI/runtime changes: `bun run check` or narrower `bun run typecheck`, `bun test`, and relevant smoke scripts.

## Documentation update rule

Update README/DEVELOPMENT/docs when terminal commands, keybindings, runtime expectations, public TUI APIs, or workflow changes. Do not rewrite historical phase docs unless explicitly scoped.
