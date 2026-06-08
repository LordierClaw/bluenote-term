# Phase 8 — Temporary Monorepo Split

Phase 8 refactors the single-package BlueNote repository into a temporary Bun workspace while preserving the current CLI/TUI product behavior.

## Packages

- `packages/core` (`@bluenote/core`): headless BlueNote engine for domain types, workspace/root resolution, storage layout, note business logic, sidecar metadata, rebuildable search/index state, literal contains-style search, and reusable AI config/queue/provider services.
- `packages/term` (`bluenote-term`): Bun-first terminal client for `bn`/`bluenote` entrypoints, CLI command presentation, OpenTUI rendering, keyboard/input handling, terminal editor launch, clipboard helpers, TUI state, and client orchestration.

This is an internal module split only. Phase 8 does not create or depend on a separate `bluenote-core` repository.

## Compatibility

The root `bin/bn.ts` remains the published compatibility entrypoint and delegates to `packages/term/bin/bn.ts`. Root `src/cli`, `src/tui`, `src/platform`, and moved business-module paths remain compatibility shims during this temporary split so existing scripts, tests, and imports continue to work.

Existing behavior and storage contracts must remain unchanged:

- Notes are plain Markdown files.
- Normal notes live under `note/`.
- Draft notes live under `draft/`.
- BlueNote metadata lives under `.data/`.
- Sidecar note metadata lives under `.data/notes/`.
- AI state lives under `.data/ai/`.
- Archive remains under `.data/archive/`.
- Rebuildable metadata/search files remain compatible.
- Search remains literal contains-style search.
- Existing CLI commands, TUI Manager, Editor, Search Everything, AI config, Codex auth, AI queue, AI describe, and AI process-queue behavior remain compatible.
- TUI AI/background work remains non-blocking.

## Boundaries

`packages/core` must stay headless:

- No OpenTUI imports.
- No imports from `packages/term`.
- No terminal rendering, keyboard handling, screen layout, OpenTUI components, or TUI state.

`packages/term` owns client concerns and may use Bun, OpenTUI, clipboard, terminal APIs, CLI parsing, and TUI rendering/state. It consumes business logic through `@bluenote/core` public exports.

## Verification

The Phase 8 split is guarded by package boundary tests plus the existing public gate:

```bash
bun test tests/unit/core/client-core-boundary.test.ts tests/unit/core/package-boundaries.test.ts
bun run check
```

The root and term entrypoints should agree on the current version:

```bash
bun run ./bin/bn.ts --version
bun run ./packages/term/bin/bn.ts --version
```

## Known follow-up risks

- `@bluenote/core` is private and source-based for now; it is not an npm-publishable package contract yet.
- The `@bluenote/core` public barrel is intentionally broad during the temporary split and should be narrowed or documented before external consumption.
- Release packaging should be explicitly revalidated before publishing artifacts because the root bin delegates into `packages/term`, and `sql.js` WASM lookup remains packaging-sensitive.
- Root compatibility shims should remain until downstream scripts, tests, release packaging, and imports are deliberately migrated.
