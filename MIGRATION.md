# BlueNote Temporary Monorepo Migration

## Current Phase

Phase 1: Internal module split from the current single-package Bun repo into a temporary monorepo:

- `packages/core`: `@bluenote/core`, a headless BlueNote engine.
- `packages/term`: `bluenote-term`, the existing CLI/TUI client.

This phase is an internal module split only. It must not create or depend on a separate `bluenote-core` repository.

## Completed Steps

- [x] Step 0: Inspect repository structure and classify files before editing.
- [x] Step 0: Identify the smallest safe extraction sequence.
- [x] Step 1: Create/update this migration tracker.
- [x] Loop 1: Create workspace structure with `packages/core` and `packages/term`, keeping behavior unchanged.
- [x] Loop 2: Create a minimal `@bluenote/core` public API/façade without broad behavior changes.
- [x] Loop 3: Move pure types/constants/domain helpers into `@bluenote/core`.
- [x] Loop 4: Move workspace/storage/note metadata logic into `@bluenote/core`.
- [x] Loop 5: Move note business logic into `@bluenote/core`.
- [ ] Loop 6: Move search/rebuild/index logic into `@bluenote/core`.
- [ ] Loop 7: Move reusable AI config/queue/provider business logic into `@bluenote/core`.
- [ ] Loop 8: Update CLI/TUI to consume `@bluenote/core` public APIs.
- [ ] Loop 9: Enforce package boundaries and update current-facing docs.

## Remaining Steps

1. Move code in small verified loops, starting with pure domain/types/constants and only then storage, search, AI, and term consumption.
2. Keep `packages/term` as the client package that owns CLI wiring, TUI rendering, keyboard/input handling, terminal APIs, clipboard, and OpenTUI usage.
3. Keep `packages/core` headless: no OpenTUI imports, no imports from `packages/term`, no terminal rendering, no keyboard handling, no TUI state.
4. Verify after every loop with the narrowest relevant checks, then run the full practical suite before finishing.

## Invariants That Must Not Change

- Notes remain plain Markdown files.
- Normal notes live under `note/`.
- Draft notes live under `draft/`.
- BlueNote metadata lives under `.data/`.
- Sidecar note metadata lives under `.data/notes/`.
- AI state lives under `.data/ai/`.
- Archive remains under `.data/archive/`.
- Rebuildable metadata/search files remain compatible.
- Search remains literal contains-style search.
- Existing CLI commands keep compatible behavior.
- Existing TUI Manager, Editor, and Search Everything behavior remains compatible.
- Existing AI config, Codex auth, AI queue, AI describe, and AI process-queue behavior remains compatible.
- TUI AI/background work must not become blocking.
- Bun-based execution remains supported for the current app.
- No web UI, mobile UI, server, sync layer, database redesign, product feature additions, keybinding changes, storage layout changes, note format changes, OpenTUI migration, feature removal, broad formatting-only rewrite, or aesthetic-only file moves.

## Initial File Classification Summary

| Area | Files | Target |
|---|---|---|
| CLI wiring | `bin/bn.ts`, `src/cli/entry.ts`, `src/cli/ai.ts`, terminal editor/clipboard platform helpers | `packages/term` |
| TUI/OpenTUI rendering | `src/tui/app.ts`, `render-*`, `paste.ts`, `theme.ts`, `display-width.ts` | `packages/term` |
| TUI state/input/view models | `src/tui/state.ts`, `workspace-controller.ts`, `src/tui/adapters/*` | `packages/term`, with core calls via public APIs |
| Domain/types | `src/domain/*`, reusable parts of `src/core/types.ts`, `src/core/errors.ts` | `packages/core` |
| Workspace/storage | `src/config/root.ts`, `src/storage/*`, `src/core/init-root.ts` | `packages/core` |
| Note business logic | `src/core/create-note.ts`, `show-note.ts`, `select-note.ts`, `list-notes.ts`, `delete-note.ts`, `archive-note.ts`, `rename-note.ts`, `move-note.ts`, `promote-draft.ts`, `note-visibility.ts` | `packages/core` |
| Mixed note edit flow | `src/core/edit-note.ts` | split: core update logic, term external editor launch |
| Search/index | `src/search/contains-match.ts`, `src/index/*`, `src/core/search-notes.ts`, `src/core/rebuild-indexes.ts` | `packages/core` |
| AI business logic | `src/ai/types.ts`, config/provider/client/auth/queue/description/prompt/log modules | `packages/core` |
| Tests/scripts/docs | `tests/**`, `scripts/**`, `docs/**`, `.github/**` | package-aligned over time; root/shared temporarily |

## Smallest Safe Extraction Sequence

1. Workspace/package scaffolding only, no behavior changes.
2. Minimal `@bluenote/core` public barrel/façade.
3. Pure types/constants/domain helpers.
4. Storage/workspace layout and sidecar/note metadata logic.
5. Note business logic.
6. Search/rebuild/index logic.
7. Reusable AI config/queue/provider business logic.
8. Term imports switch to `@bluenote/core` public exports.
9. Boundary enforcement, docs, release/smoke alignment.

## Verification Commands Run

| Step | Command | Result | Notes |
|---|---|---|---|
| Step 0 | `git status --short --branch` | PASS | Started from `main...origin/main`, clean working tree before branch checkout. |
| Step 0 | `git checkout -b phase-1-temporary-monorepo-plan` | PASS | Created planning/migration branch. |
| Step 0 | Read/package/source inspection via Hermes tools and import scan | PASS | No file edits during inspection. |
| Loop 1 baseline | `bun run typecheck` | PASS | Established root typecheck behavior before workspace edits. |
| Loop 1 | `bun install --lockfile-only` | PASS | Updated `bun.lock` to recognize `packages/core` and `packages/term` workspaces. |
| Loop 1 | `bun run typecheck` | PASS | Root command still invokes `tsc --noEmit`. |
| Loop 1 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after workspace scaffolding. |
| Loop 1 | `bun run check` | PASS | Full root check passed: lint, typecheck, tests, OpenTUI smoke, CLI smoke. |
| Loop 2 RED | `bun test tests/unit/core/public-api.test.ts` | FAIL (expected) | Test imported `@bluenote/core`; failed because the package had no resolvable public API yet. |
| Loop 2 | `bun test tests/unit/core/public-api.test.ts` | PASS | Public API façade shape and basic create/list/get/search/rebuild workflow passed. |
| Loop 2 | `bun run typecheck` | PASS | Root TypeScript check passed with `@bluenote/core` path mapping and package sources included. |
| Loop 2 | `bun run smoke:cli` | PASS | Root CLI smoke script passed; existing CLI behavior stayed working. |
| Loop 3 RED | `bun test tests/unit/core/package-domain-exports.test.ts` | FAIL (expected) | New package-domain export test failed because `createNoteDescription` and other moved helpers were not exported from `@bluenote/core` yet. |
| Loop 3 | `bun test tests/unit/core/package-domain-exports.test.ts` | PASS | `@bluenote/core` exports pure domain/platform/error helpers; root shims preserve helper and error class identity. |
| Loop 3 | `bun test tests/unit/domain tests/unit/core/errors.test.ts tests/unit/platform/path-safety.test.ts tests/unit/core/public-api.test.ts tests/unit/core/package-domain-exports.test.ts` | PASS | Focused moved-helper/domain/error/path-safety/public API slice passed: 18 tests. |
| Loop 3 | `bun run typecheck` | PASS | Root TypeScript check passed after moving pure helpers and adding compatibility shims. |
| Loop 3 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after moved-helper shims. |
| Loop 3 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |
| Loop 4 RED | `bun test tests/unit/core/package-storage-exports.test.ts` | FAIL (expected) | New package-storage export test failed because managed-root/storage helpers were not exported from `@bluenote/core` yet. |
| Loop 4 | `bun test tests/unit/core/package-storage-exports.test.ts` | PASS | `@bluenote/core` exports managed-root/storage helpers; root storage shims preserve function identity. |
| Loop 4 | `bun test tests/unit/storage tests/integration/note-repository.test.ts tests/unit/core/package-storage-exports.test.ts tests/unit/core/public-api.test.ts` | PASS | Focused moved storage/repository/public API slice passed: 110 tests. |
| Loop 4 | `bun run typecheck` | PASS | Root TypeScript check passed after moving workspace/storage/init-root modules and adding compatibility shims. |
| Loop 4 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after moved storage shims. |
| Loop 4 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |
| Loop 4 follow-up | `bun install --lockfile-only && bun run typecheck && bun run smoke:cli` | PASS | Added `js-yaml` as a direct `@bluenote/core` dependency for moved `frontmatter.ts`; lockfile, typecheck, and CLI smoke passed. |
| Loop 5 RED | `bun test tests/unit/core/package-note-business-exports.test.ts` | FAIL (expected) | New package note-business export test failed because `listNotes` and the moved note APIs were not exported from `@bluenote/core` yet. |
| Loop 5 | `bun test tests/unit/core/package-note-business-exports.test.ts` | PASS | `@bluenote/core` exports note business APIs; root compatibility shims preserve representative function identity and a create/show/list workflow passed. |
| Loop 5 | `bun test tests/unit/core tests/unit/storage tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-delete.test.ts tests/integration/cli-archive.test.ts` | PASS | Focused note-business/storage/CLI regression slice passed: 166 tests. |
| Loop 5 | `bun run typecheck` | PASS | Root TypeScript check passed after moving note business modules and adding compatibility shims. |
| Loop 5 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after note-business move. |
| Loop 5 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |

## Known Risks

- `src/tui/app.ts` is large and mixed: OpenTUI runtime, TUI persistence, folder operations, startup note handling, AI status/queue orchestration, and direct storage/core calls are intertwined.
- `src/core/edit-note.ts` currently mixes business note update behavior with external editor launching; Loop 5 intentionally left it as a root/term-facing module to keep CLI edit compatible, so a careful later split is still required.
- `src/index/index-store.ts` uses `sql.js` and resolves `sql-wasm.wasm` relative to both executable and project paths; package relocation can break release and smoke behavior.
- Loop 5 note business modules in `@bluenote/core` still temporarily import root search/index/rebuild and AI enqueue helpers until Loops 6 and 7 move those implementations.
- AI queue/provider/config/auth modules are business-reusable but sensitive: queue preservation, setup blockers, redaction, prompt hashes, Codex auth, and non-blocking TUI orchestration must remain compatible.
- TUI manager/search adapters mix view-model logic with core note/search imports; move only the business boundary, not UI state or behavior.
- Tests and helper paths currently assume a single root package; migration must keep root verification commands working while package-specific tests are introduced gradually.
- Release packaging may assume root `package.json`, root `bin/bn.ts`, and root `node_modules`; update only after behavior-preserving workspace scaffolding is verified.
- Loop 3 moved all of `src/core/types.ts` into `@bluenote/core`; this temporarily exposes CLI result/exit-code types from the core package until later loops split terminal-only API surface more precisely.
