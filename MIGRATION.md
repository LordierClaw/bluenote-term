# BlueNote Temporary Monorepo Migration

## Current Phase

Phase 8 started as an internal module split from the single-package Bun repo. Phase 8.2 now consumes the headless core from the sibling repository:

- `../bluenote-core`: `@lordierclaw/bluenote-core`, a headless BlueNote engine.
- `packages/term`: `bluenote-term`, the existing CLI/TUI client.

The local `packages/core` implementation has been removed from this repository.

## Completed Steps

- [x] Step 0: Inspect repository structure and classify files before editing.
- [x] Step 0: Identify the smallest safe extraction sequence.
- [x] Step 1: Create/update this migration tracker.
- [x] Loop 1: Create workspace structure with `packages/core` and `packages/term`, keeping behavior unchanged.
- [x] Loop 2: Create a minimal `@lordierclaw/bluenote-core` public API/façade without broad behavior changes.
- [x] Loop 3: Move pure types/constants/domain helpers into `@lordierclaw/bluenote-core`.
- [x] Loop 4: Move workspace/storage/note metadata logic into `@lordierclaw/bluenote-core`.
- [x] Loop 5: Move note business logic into `@lordierclaw/bluenote-core`.
- [x] Loop 6: Move search/rebuild/index logic into `@lordierclaw/bluenote-core`.
- [x] Loop 7: Move reusable AI config/queue/provider business logic into `@lordierclaw/bluenote-core`.
- [x] Loop 8: Update CLI/TUI to consume `@lordierclaw/bluenote-core` public APIs.
- [x] Loop 9: Enforce package boundaries and update current-facing docs.
- [x] Phase 8.2: Consume `@lordierclaw/bluenote-core` from sibling `../bluenote-core` and remove local `packages/core`.

## Remaining Steps

1. No Phase 8 implementation loops remain after Loop 9 verification and review.
2. Keep `packages/term` as the client package that owns CLI wiring, TUI rendering, keyboard/input handling, terminal APIs, clipboard, and OpenTUI usage.
3. Keep the sibling `@lordierclaw/bluenote-core` package headless: no OpenTUI imports, no imports from `packages/term`, no terminal rendering, no keyboard handling, no TUI state.
4. Preserve root compatibility shims until downstream tests, scripts, release packaging, and docs no longer depend on historical paths.

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
2. Minimal `@lordierclaw/bluenote-core` public barrel/façade.
3. Pure types/constants/domain helpers.
4. Storage/workspace layout and sidecar/note metadata logic.
5. Note business logic.
6. Search/rebuild/index logic.
7. Reusable AI config/queue/provider business logic.
8. Term imports switch to `@lordierclaw/bluenote-core` public exports.
9. Boundary enforcement, docs, release/smoke alignment.

## Verification Commands Run

| Step | Command | Result | Notes |
|---|---|---|---|
| Step 0 | `git status --short --branch` | PASS | Started from `main...origin/main`, clean working tree before branch checkout. |
| Step 0 | `git checkout -b phase-1-temporary-monorepo-plan` | PASS | Created planning/migration branch; later renamed to `phase-8-temporary-monorepo` after phase correction. |
| Step 0 | Read/package/source inspection via Hermes tools and import scan | PASS | No file edits during inspection. |
| Loop 1 baseline | `bun run typecheck` | PASS | Established root typecheck behavior before workspace edits. |
| Loop 1 | `bun install --lockfile-only` | PASS | Updated `bun.lock` to recognize `packages/core` and `packages/term` workspaces. |
| Loop 1 | `bun run typecheck` | PASS | Root command still invokes `tsc --noEmit`. |
| Loop 1 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after workspace scaffolding. |
| Loop 1 | `bun run check` | PASS | Full root check passed: lint, typecheck, tests, OpenTUI smoke, CLI smoke. |
| Loop 2 RED | `bun test tests/unit/core/public-api.test.ts` | FAIL (expected) | Test imported `@lordierclaw/bluenote-core`; failed because the package had no resolvable public API yet. |
| Loop 2 | `bun test tests/unit/core/public-api.test.ts` | PASS | Public API façade shape and basic create/list/get/search/rebuild workflow passed. |
| Loop 2 | `bun run typecheck` | PASS | Root TypeScript check passed with `@lordierclaw/bluenote-core` path mapping and package sources included. |
| Loop 2 | `bun run smoke:cli` | PASS | Root CLI smoke script passed; existing CLI behavior stayed working. |
| Loop 3 RED | `bun test tests/unit/core/package-domain-exports.test.ts` | FAIL (expected) | New package-domain export test failed because `createNoteDescription` and other moved helpers were not exported from `@lordierclaw/bluenote-core` yet. |
| Loop 3 | `bun test tests/unit/core/package-domain-exports.test.ts` | PASS | `@lordierclaw/bluenote-core` exports pure domain/platform/error helpers; root shims preserve helper and error class identity. |
| Loop 3 | `bun test tests/unit/domain tests/unit/core/errors.test.ts tests/unit/platform/path-safety.test.ts tests/unit/core/public-api.test.ts tests/unit/core/package-domain-exports.test.ts` | PASS | Focused moved-helper/domain/error/path-safety/public API slice passed: 18 tests. |
| Loop 3 | `bun run typecheck` | PASS | Root TypeScript check passed after moving pure helpers and adding compatibility shims. |
| Loop 3 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after moved-helper shims. |
| Loop 3 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |
| Loop 4 RED | `bun test tests/unit/core/package-storage-exports.test.ts` | FAIL (expected) | New package-storage export test failed because managed-root/storage helpers were not exported from `@lordierclaw/bluenote-core` yet. |
| Loop 4 | `bun test tests/unit/core/package-storage-exports.test.ts` | PASS | `@lordierclaw/bluenote-core` exports managed-root/storage helpers; root storage shims preserve function identity. |
| Loop 4 | `bun test tests/unit/storage tests/integration/note-repository.test.ts tests/unit/core/package-storage-exports.test.ts tests/unit/core/public-api.test.ts` | PASS | Focused moved storage/repository/public API slice passed: 110 tests. |
| Loop 4 | `bun run typecheck` | PASS | Root TypeScript check passed after moving workspace/storage/init-root modules and adding compatibility shims. |
| Loop 4 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after moved storage shims. |
| Loop 4 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |
| Loop 4 follow-up | `bun install --lockfile-only && bun run typecheck && bun run smoke:cli` | PASS | Added `js-yaml` as a direct `@lordierclaw/bluenote-core` dependency for moved `frontmatter.ts`; lockfile, typecheck, and CLI smoke passed. |
| Loop 5 RED | `bun test tests/unit/core/package-note-business-exports.test.ts` | FAIL (expected) | New package note-business export test failed because `listNotes` and the moved note APIs were not exported from `@lordierclaw/bluenote-core` yet. |
| Loop 5 | `bun test tests/unit/core/package-note-business-exports.test.ts` | PASS | `@lordierclaw/bluenote-core` exports note business APIs; root compatibility shims preserve representative function identity and a create/show/list workflow passed. |
| Loop 5 | `bun test tests/unit/core tests/unit/storage tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts tests/integration/cli-delete.test.ts tests/integration/cli-archive.test.ts` | PASS | Focused note-business/storage/CLI regression slice passed: 166 tests. |
| Loop 5 | `bun run typecheck` | PASS | Root TypeScript check passed after moving note business modules and adding compatibility shims. |
| Loop 5 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after note-business move. |
| Loop 5 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |
| Loop 6 RED | `bun test tests/unit/core/package-search-exports.test.ts` | FAIL (expected) | New package search/rebuild/index export test failed because `containsSearchQuery` was not exported from `@lordierclaw/bluenote-core` yet. |
| Loop 6 | `bun install --lockfile-only` | PASS | Added direct `@lordierclaw/bluenote-core` runtime dependencies for moved search/index modules: `minisearch` and `sql.js`. |
| Loop 6 | `bun test tests/unit/core/package-search-exports.test.ts` | PASS | `@lordierclaw/bluenote-core` exports search/rebuild/index APIs; representative root shims preserve identity and literal substring search passed. |
| Loop 6 | `bun test tests/unit/search tests/unit/index tests/unit/core/search-notes.test.ts tests/unit/core/package-search-exports.test.ts tests/integration/cli-search.test.ts tests/integration/cli-rebuild.test.ts tests/unit/core/public-api.test.ts` | PASS | Required focused search/index/rebuild/CLI/public API slice passed: 41 tests. |
| Loop 6 | `bun run typecheck` | PASS | Root TypeScript check passed after moving search/rebuild/index modules and adding compatibility shims. |
| Loop 6 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after search/rebuild/index move. |
| Loop 6 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. Remaining root imports from `packages/core` are AI enqueue imports intentionally left for Loop 7. |
| Loop 6 follow-up | `bun test tests/unit/core/package-search-exports.test.ts && bun run typecheck && bun run smoke:cli` | PASS | Strengthened package search test to import index APIs from `@lordierclaw/bluenote-core` and verify root shim identity for `loadIndexStore`, `rebuildIndexStore`, `updateIndexedNote`, and `createSearchDocuments`. |
| Loop 7 RED | `bun test tests/unit/core/package-ai-exports.test.ts` | FAIL (expected) | New package AI export test failed because `maskApiKey` was not exported from `@lordierclaw/bluenote-core` yet. |
| Loop 7 | `bun test tests/unit/core/package-ai-exports.test.ts` | PASS | `@lordierclaw/bluenote-core` exports reusable AI config/queue/redaction APIs; representative root shims preserve identity and config/queue repository behavior passed. |
| Loop 7 | `bun test tests/unit/ai tests/integration/cli-ai-config.test.ts tests/integration/cli-ai-describe.test.ts tests/integration/cli-ai-queue.test.ts tests/integration/cli-ai-queue-mutations.test.ts tests/e2e/ai-description-workflow.test.ts tests/unit/core/package-ai-exports.test.ts tests/unit/core/public-api.test.ts` | PASS | Required AI/config/auth/queue/describe/CLI/e2e/public API regression slice passed: 128 tests. |
| Loop 7 | `bun run typecheck` | PASS | Root TypeScript check passed after moving AI modules and adding compatibility shims. |
| Loop 7 | `bun run smoke:cli` | PASS | Root CLI smoke script passed after AI module move. |
| Loop 7 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |
| Loop 7 | Search `packages/core/src` for `../../../src/ai` or `../../../../src/ai` imports | PASS | No package-core imports from root AI shims remain. |
| Loop 8 RED | `bun test tests/unit/core/client-core-boundary.test.ts` | FAIL (expected) | New client boundary test failed because representative CLI/TUI/platform files still imported moved business modules through root `src/core`, `src/storage`, `src/config`, `src/search`, `src/index`, `src/ai`, and `src/platform/path-safety` shims. |
| Loop 8 | `bun test tests/unit/core/client-core-boundary.test.ts` | PASS | Representative CLI/TUI/platform files now consume moved business APIs from `@lordierclaw/bluenote-core`; the test explicitly allows the still term-owned `src/core/edit-note.ts` editor flow. |
| Loop 8 | `bun test tests/unit/cli-entry.test.ts tests/unit/cli/entry-errors.test.ts tests/unit/tui tests/integration/tui-workflow.test.ts tests/integration/cli-help.test.ts tests/integration/cli-ai-config.test.ts tests/integration/cli-ai-describe.test.ts tests/integration/cli-ai-queue.test.ts tests/integration/cli-ai-queue-mutations.test.ts` | PASS | Required CLI/TUI/AI regression slice passed: 539 tests. |
| Loop 8 | `bun run typecheck` | PASS | Root TypeScript check passed after switching client imports and exposing `initRoot` from the `@lordierclaw/bluenote-core` public barrel. |
| Loop 8 | `bun run smoke:opentui` | PASS | OpenTUI smoke check passed for BlueNote (`tui-workspace-ready`; follow-up `hardening-follow-up`). |
| Loop 8 | `bun run smoke:cli` | PASS | CLI smoke check passed. |
| Loop 8 | Boundary search in `packages/core` for `@opentui\|packages/term\|src/tui\|../../term` | PASS | No forbidden terminal/TUI boundary imports found. |
| Loop 9 RED | `bun test tests/unit/core/package-boundaries.test.ts` | FAIL (expected) | New package boundary test failed before term-owned CLI/TUI/platform files existed under `packages/term`. |
| Loop 9 | `bun install --lockfile-only` | PASS | Updated lockfile after adding `bluenote-term` package dependencies on `@lordierclaw/bluenote-core`, OpenTUI, and clipboardy. |
| Loop 9 | `bun test tests/unit/core/package-boundaries.test.ts` | PASS | Enforced core headlessness, term file ownership, term business imports through `@lordierclaw/bluenote-core`, and root compatibility shims. |
| Loop 9 | `bun test tests/unit/core/client-core-boundary.test.ts tests/unit/core/package-boundaries.test.ts` | PASS | Updated client boundary coverage to package-term paths; 5 focused boundary tests passed. |
| Loop 9 | `bun run check` | PASS | Full root suite passed: lint, typecheck, 880 tests, OpenTUI smoke, CLI smoke. |
| Loop 9 | `bun run ./bin/bn.ts --version && bun run ./packages/term/bin/bn.ts --version` | PASS | Both root compatibility entrypoint and term package entrypoint printed `0.3.0`. |
| Loop 9 | Boundary search in `packages/core/src` for `@opentui/core\|packages/term\|src/tui\|bluenote-term` | PASS | No forbidden terminal/TUI/client imports found in core package. |
| Loop 9 | Boundary search in `packages/term` for root moved business shim imports | PASS | No package-term imports from root `src/core`, `src/storage`, `src/config`, `src/ai`, `src/search`, `src/index`, or `src/domain` shims found. |

## Known Risks

- `src/tui/app.ts` is large and mixed: OpenTUI runtime, TUI persistence, folder operations, startup note handling, AI status/queue orchestration, and direct storage/core calls are intertwined.
- `src/core/edit-note.ts` currently mixes business note update behavior with external editor launching; Loop 5 intentionally left it as a root/term-facing module to keep CLI edit compatible, so a careful later split is still required.
- `packages/core/src/index/index-store.ts` uses `sql.js` and resolves `sql-wasm.wasm` relative to both executable and project paths; package relocation can break release and smoke behavior.
- Loop 7 moved reusable AI config/provider/auth/queue/description/prompt/log modules into `@lordierclaw/bluenote-core`; these modules are sensitive, so future changes must continue preserving queue files, setup blockers, redaction, prompt hashes, Codex auth, and non-blocking TUI orchestration.
- `packages/term/src/core/edit-note.ts` remains a term-owned mixed editor flow because it launches the external editor while coordinating core note updates; keep root `src/core/edit-note.ts` as a compatibility shim until callers move to the package path.
- Root `src/cli`, `src/tui`, `src/platform`, and `src/core/edit-note.ts` are compatibility shims to `packages/term`; future cleanup should retire them only after tests, scripts, release packaging, and imports are updated deliberately.
- Release packaging may assume root `package.json`, root `bin/bn.ts`, and root `node_modules`; the root bin is preserved as a package-term shim, but release packaging still needs review before publishing.
- Loop 3 moved all of `src/core/types.ts` into `@lordierclaw/bluenote-core`; this temporarily exposes CLI result/exit-code types from the core package until later loops split terminal-only API surface more precisely.
