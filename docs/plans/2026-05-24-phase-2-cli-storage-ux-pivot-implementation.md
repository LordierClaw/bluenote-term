# Phase 2 CLI Storage + UX Pivot Implementation Plan

> **For implementer:** Use TDD throughout. Write or adjust the failing test first, watch it fail for the intended reason, then implement the minimum change to make it pass.

**Goal:** Replace BlueNote's current frontmatter + UUID note model with plain note files plus `.state/` sidecar metadata, then align CLI behavior, search output, shell completion, migration, and documentation with the approved Phase 2 design.

**Architecture:** Keep a thin CLI over reusable core services. Canonical content becomes plain files under `notes/`, canonical BlueNote metadata becomes per-note sidecars under `.state/notes/`, and rebuildable derived indexes remain under `.state/`. Deliver the phase in small TDD slices so storage conversion, rename safety, migration, and CLI UX can be verified independently.

**Tech Stack:** Bun, TypeScript, Node/Bun filesystem APIs, sql.js, MiniSearch, existing BlueNote CLI entrypoint and smoke scripts.

---

## Task 1: Establish the new root/state contract and manifest support

**Files:**
- Modify: `src/storage/root-layout.ts`
- Modify: `src/core/init-root.ts`
- Modify: `src/config/root.ts`
- Create: `src/storage/state-manifest.ts`
- Test: `tests/integration/cli-init.test.ts`
- Test: `tests/unit/storage/state-manifest.test.ts`

**Step 1: Write the failing tests first**
Add tests that prove:
- `bn init` creates `.state/`, not nested `.bluenote/.bluenote`
- `.state/notes/` and `.state/manifest.json` exist after init
- manifest records the new storage schema version

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-init.test.ts tests/unit/storage/state-manifest.test.ts
```
Expected: FAIL because the current layout still creates `.bluenote/` under the managed root and no manifest support exists.

**Step 3: Implement the minimum layout + manifest changes**
- replace nested internal directory creation with `.state/`
- add manifest read/write helpers
- update `initRoot()` to create the new layout and manifest

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-init.test.ts tests/unit/storage/state-manifest.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/storage/root-layout.ts src/core/init-root.ts src/config/root.ts src/storage/state-manifest.ts tests/integration/cli-init.test.ts tests/unit/storage/state-manifest.test.ts && git commit -m "feat: add phase 2 state layout manifest"
```

---

## Task 2: Introduce the plain-note + sidecar metadata domain model

**Files:**
- Modify: `src/storage/note-schema.ts`
- Modify: `src/storage/frontmatter.ts`
- Create: `src/storage/plain-note.ts`
- Create: `src/storage/sidecar-schema.ts`
- Create: `src/storage/sidecar-repository.ts`
- Test: `tests/unit/storage/plain-note.test.ts`
- Test: `tests/unit/storage/sidecar-schema.test.ts`
- Test: `tests/unit/storage/sidecar-repository.test.ts`

**Step 1: Write the failing tests first**
Add tests for:
- parsing/serializing plain note bodies with no frontmatter
- validating sidecar JSON metadata shape
- reading/writing sidecar records under `.state/notes/`
- rejecting missing or invalid required sidecar fields

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/storage/plain-note.test.ts tests/unit/storage/sidecar-schema.test.ts tests/unit/storage/sidecar-repository.test.ts
```
Expected: FAIL because the current storage layer assumes frontmatter notes and has no sidecar repository.

**Step 3: Implement the minimum plain-note and sidecar support**
- separate plain content handling from old frontmatter parsing
- add sidecar schema validation and sidecar repository helpers
- preserve room for later migration helpers without switching the whole app yet

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/storage/plain-note.test.ts tests/unit/storage/sidecar-schema.test.ts tests/unit/storage/sidecar-repository.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/storage/note-schema.ts src/storage/frontmatter.ts src/storage/plain-note.ts src/storage/sidecar-schema.ts src/storage/sidecar-repository.ts tests/unit/storage/plain-note.test.ts tests/unit/storage/sidecar-schema.test.ts tests/unit/storage/sidecar-repository.test.ts && git commit -m "feat: add plain note sidecar storage model"
```

---

## Task 3: Add key generation and description-generation helpers

**Files:**
- Create: `src/core/note-key.ts`
- Create: `src/core/description.ts`
- Test: `tests/unit/core/note-key.test.ts`
- Test: `tests/unit/core/description.test.ts`

**Step 1: Write the failing tests first**
Cover:
- title → slug normalization
- short random suffix formatting
- collision-safe regeneration behavior via injectable ID generator
- deterministic description generation from first and last words of note content
- stable handling of empty/short note bodies

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/core/note-key.test.ts tests/unit/core/description.test.ts
```
Expected: FAIL because these helpers do not exist yet.

**Step 3: Implement the minimum helpers**
- add slug normalization + key builder
- add short-suffix generation strategy with injection seams for tests
- add deterministic description summarizer

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/core/note-key.test.ts tests/unit/core/description.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/note-key.ts src/core/description.ts tests/unit/core/note-key.test.ts tests/unit/core/description.test.ts && git commit -m "feat: add note key and description generators"
```

---

## Task 4: Refactor the note repository around plain files and sidecars

**Files:**
- Modify: `src/storage/note-repository.ts`
- Modify: `src/platform/path-safety.ts`
- Test: `tests/unit/storage/note-repository.test.ts`
- Test: `tests/integration/cli-new.test.ts`

**Step 1: Write the failing tests first**
Add tests that prove:
- new note creation writes a plain `.md` file with no frontmatter
- a matching sidecar is created under `.state/notes/`
- repository list/read operations require a consistent file + sidecar pair
- missing sidecar or missing note file is surfaced as a consistency error

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts
```
Expected: FAIL because repository creation still names files by UUID and serializes frontmatter.

**Step 3: Implement the minimum repository refactor**
- make note creation use generated keys for filenames
- read bodies from plain files and metadata from sidecars
- list notes from paired file + sidecar records
- keep error messages human-readable for missing pairs

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/storage/note-repository.ts src/platform/path-safety.ts tests/unit/storage/note-repository.test.ts tests/integration/cli-new.test.ts && git commit -m "feat: move note repository to plain files and sidecars"
```

---

## Task 5: Rebuild index storage from sidecars and plain content

**Files:**
- Modify: `src/index/index-store.ts`
- Modify: `src/index/search-documents.ts`
- Modify: `src/core/rebuild-indexes.ts`
- Test: `tests/integration/cli-rebuild.test.ts`
- Test: `tests/unit/index/index-store.test.ts`

**Step 1: Write the failing tests first**
Cover:
- rebuild reads note body from plain files and metadata from sidecars
- derived artifacts are written under `.state/`
- rebuild surfaces missing sidecars, missing notes, key/path mismatches, and invalid sidecars
- search documents include title, description, body, key, and relative path data

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-rebuild.test.ts tests/unit/index/index-store.test.ts
```
Expected: FAIL because the current index layer reads frontmatter notes and uses the old derived directory assumption.

**Step 3: Implement the minimum rebuild/index refactor**
- move derived artifacts to `.state/`
- rebuild from paired note + sidecar data
- expand search document construction to support richer result shaping later

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-rebuild.test.ts tests/unit/index/index-store.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/index/index-store.ts src/index/search-documents.ts src/core/rebuild-indexes.ts tests/integration/cli-rebuild.test.ts tests/unit/index/index-store.test.ts && git commit -m "feat: rebuild indexes from plain notes and sidecars"
```

---

## Task 6: Update `new`, `list`, and `show` for the new UX contract

**Files:**
- Modify: `src/core/create-note.ts`
- Modify: `src/core/list-notes.ts`
- Modify: `src/core/show-note.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/integration/cli-new.test.ts`
- Test: `tests/integration/cli-list-show.test.ts`
- Test: `tests/unit/cli-entry.test.ts`

**Step 1: Write the failing tests first**
Add coverage for:
- `bn new --title ...` printing key + path in user-friendly form
- `bn list` showing title, key, description preview, and path instead of UUID-centric columns
- `bn show` printing title, key, path, description, and body
- `bn new` auto-generating description and triggering rebuild automatically

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/unit/cli-entry.test.ts
```
Expected: FAIL because the current CLI still prints old list/search/show formats.

**Step 3: Implement the minimum command and formatter changes**
- update create/list/show use cases to return richer summary data
- update CLI output rendering to the approved selector-friendly contract
- ensure `new` triggers auto-rebuild with the new repository/index path

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/unit/cli-entry.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/create-note.ts src/core/list-notes.ts src/core/show-note.ts src/cli/entry.ts tests/integration/cli-new.test.ts tests/integration/cli-list-show.test.ts tests/unit/cli-entry.test.ts && git commit -m "feat: refresh list show and new cli output"
```

---

## Task 7: Implement key-based selector resolution and suggestion behavior

**Files:**
- Modify: `src/core/select-note.ts`
- Modify: `src/core/errors.ts`
- Test: `tests/unit/core/select-note.test.ts`
- Test: `tests/integration/cli-list-show.test.ts`
- Test: `tests/integration/cli-edit.test.ts`

**Step 1: Write the failing tests first**
Cover:
- exact key resolution
- exact relative-path resolution
- ambiguity handling
- nearest-candidate suggestions when a key is not found
- removal of UUID-specific selection assumptions

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/core/select-note.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts
```
Expected: FAIL because the current selector logic is still centered on ID/path/slug resolution from frontmatter notes.

**Step 3: Implement the minimum selector refactor**
- use sidecar key as the primary selector
- support path fallback
- add concise suggestion generation for close misses

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/core/select-note.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/select-note.ts src/core/errors.ts tests/unit/core/select-note.test.ts tests/integration/cli-list-show.test.ts tests/integration/cli-edit.test.ts && git commit -m "feat: add key-based selectors and suggestions"
```

---

## Task 8: Implement edit-sync with title-aware rename safety

**Files:**
- Modify: `src/core/edit-note.ts`
- Create: `src/core/rename-note.ts`
- Modify: `src/storage/note-repository.ts`
- Test: `tests/integration/cli-edit.test.ts`
- Test: `tests/unit/core/rename-note.test.ts`

**Step 1: Write the failing tests first**
Add coverage for:
- body edit updates `updatedAt`, description, and derived indexes
- title change triggers a key/file/sidecar rename transaction
- renamed note reports previous key and new key
- rename collision fails cleanly
- recovery artifacts are written when rename staging fails

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-edit.test.ts tests/unit/core/rename-note.test.ts
```
Expected: FAIL because the current edit flow assumes frontmatter notes and has no rename transaction support.

**Step 3: Implement the minimum edit/rename orchestration**
- detect title change after editor exit using sidecar metadata rules
- perform transactional note + sidecar rename with recovery staging
- refresh description, updated timestamp, and indexes after successful edit

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-edit.test.ts tests/unit/core/rename-note.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/edit-note.ts src/core/rename-note.ts src/storage/note-repository.ts tests/integration/cli-edit.test.ts tests/unit/core/rename-note.test.ts && git commit -m "feat: add title-aware note rename flow"
```

---

## Task 9: Update archive flow and add explicit delete support

**Files:**
- Modify: `src/core/archive-note.ts`
- Create: `src/core/delete-note.ts`
- Modify: `src/cli/entry.ts`
- Modify: `src/storage/note-repository.ts`
- Test: `tests/integration/cli-archive.test.ts`
- Create: `tests/integration/cli-delete.test.ts`
- Test: `tests/unit/cli-entry.test.ts`

**Step 1: Write the failing tests first**
Cover:
- archive moves note content to `notes/archive/` and updates sidecar path without changing key
- archive triggers rebuild automatically
- `bn delete <key|path>` removes note file and sidecar and triggers rebuild
- delete follows the chosen safety rule (`--force` or TTY-aware confirmation policy)

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-archive.test.ts tests/integration/cli-delete.test.ts tests/unit/cli-entry.test.ts
```
Expected: FAIL because delete does not exist yet and archive still assumes the old repository model.

**Step 3: Implement the minimum archive/delete flows**
- update archive to move plain files and rewrite sidecar metadata
- add delete use case, CLI command, and safety handling
- rebuild derived state after both commands

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-archive.test.ts tests/integration/cli-delete.test.ts tests/unit/cli-entry.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/archive-note.ts src/core/delete-note.ts src/cli/entry.ts src/storage/note-repository.ts tests/integration/cli-archive.test.ts tests/integration/cli-delete.test.ts tests/unit/cli-entry.test.ts && git commit -m "feat: add archive and delete note flows"
```

---

## Task 10: Redesign search results around grouped match output

**Files:**
- Modify: `src/core/search-notes.ts`
- Modify: `src/index/index-store.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/integration/cli-search.test.ts`
- Test: `tests/unit/core/search-notes.test.ts`
- Test: `tests/unit/cli-entry.test.ts`

**Step 1: Write the failing tests first**
Add coverage for:
- one grouped result block per note
- explicit `match:` source labeling for title, description, content, and key/path
- contextual excerpts for content matches
- ranking priority title > description > content > key/path
- calm no-result message

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-search.test.ts tests/unit/core/search-notes.test.ts tests/unit/cli-entry.test.ts
```
Expected: FAIL because search currently returns only old `id/title/path`-style data.

**Step 3: Implement the minimum search result-shaping pipeline**
- enrich search result data returned from the index layer
- choose the best single match explanation per note
- render grouped blocks in the CLI

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-search.test.ts tests/unit/core/search-notes.test.ts tests/unit/cli-entry.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/search-notes.ts src/index/index-store.ts src/cli/entry.ts tests/integration/cli-search.test.ts tests/unit/core/search-notes.test.ts tests/unit/cli-entry.test.ts && git commit -m "feat: redesign cli search output"
```

---

## Task 11: Add bash/zsh/fish completion generation and selector backend

**Files:**
- Modify: `src/cli/entry.ts`
- Create: `src/cli/completion.ts`
- Create: `src/core/list-completion-selectors.ts`
- Test: `tests/integration/cli-completion.test.ts`
- Test: `tests/unit/cli/completion.test.ts`
- Modify: `package.json`

**Step 1: Write the failing tests first**
Cover:
- `bn completion bash`, `bn completion zsh`, and `bn completion fish` output expected shell hooks
- selector backend prints one candidate key per line
- completion path stays quiet when root or indexes are missing
- command and flag names appear in generated scripts

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-completion.test.ts tests/unit/cli/completion.test.ts
```
Expected: FAIL because completion commands do not exist yet.

**Step 3: Implement the minimum completion support**
- add shell script generators for bash/zsh/fish
- add dynamic selector backend based on current note metadata/index state
- keep completion error behavior silent and shell-friendly

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-completion.test.ts tests/unit/cli/completion.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/cli/entry.ts src/cli/completion.ts src/core/list-completion-selectors.ts tests/integration/cli-completion.test.ts tests/unit/cli/completion.test.ts package.json && git commit -m "feat: add shell completion support"
```

---

## Task 12: Add explicit migration from frontmatter/UUID notes to plain files + sidecars

**Files:**
- Create: `src/core/migrate-storage.ts`
- Modify: `src/cli/entry.ts`
- Create: `src/storage/migration.ts`
- Test: `tests/integration/cli-migrate.test.ts`
- Test: `tests/unit/storage/migration.test.ts`
- Modify: `tests/helpers/note-fixtures.ts`

**Step 1: Write the failing tests first**
Cover:
- detection of old-format, new-format, mixed-format, and empty roots
- `bn migrate` converting frontmatter notes to plain note files
- sidecar creation preserving title/timestamps/archive state
- generated descriptions on migrated notes
- recovery snapshot + key map creation under `.state/recovery/`
- fresh rebuild after migration
- already-migrated roots returning a calm no-op message

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/cli-migrate.test.ts tests/unit/storage/migration.test.ts
```
Expected: FAIL because migration logic does not exist yet.

**Step 3: Implement the minimum migration workflow**
- add explicit `bn migrate`
- parse old frontmatter notes and create new plain notes + sidecars
- record recovery artifacts and key mappings
- rebuild derived indexes after success
- fail hard on mixed/unsafe states

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/cli-migrate.test.ts tests/unit/storage/migration.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/core/migrate-storage.ts src/cli/entry.ts src/storage/migration.ts tests/integration/cli-migrate.test.ts tests/unit/storage/migration.test.ts tests/helpers/note-fixtures.ts && git commit -m "feat: add storage migration command"
```

---

## Task 12A: Restore full `bun test` compatibility before late-phase verification

**Files:**
- Modify: `tests/e2e/phase-1-cli-workflow.test.ts`
- Modify: `tests/unit/storage/archive-note.test.ts`
- Modify as needed: remaining `tests/**/*.test.ts` files still importing `node:test` in Bun-run suites
- Modify as needed: shared test helpers under `tests/helpers/`

**Step 1: Reproduce and classify the full-suite failures first**
Run the full suite and sort failures into:
- stale expectation drift caused by Phase 2 output/storage changes
- Bun compatibility failures from `node:test` imports in Bun-run test files
- truly unrelated pre-existing failures, if any

**Step 2: Add/adjust failing tests only where expectations are now wrong**
Cover:
- grouped search output in the existing Phase 1 e2e workflow
- archive failure behavior after the repository/index refactor
- Bun-native test imports for any suite that still breaks under `bun test`
- any helper cleanup needed to keep env/file setup deterministic

**Step 3: Run the focused red-phase slices — confirm the intended failures**
Commands:
```bash
bun test tests/e2e/phase-1-cli-workflow.test.ts tests/unit/storage/archive-note.test.ts
bun test
```
Expected: FAIL first on the known stale expectations / import-compatibility issues.

**Step 4: Implement the minimum cleanup to make the repo-wide Bun suite green**
- update stale assertions to the current Phase 2 CLI/search/archive contracts
- switch remaining incompatible test files from `node:test` to `bun:test` where required for Bun execution
- keep changes narrowly scoped to test compatibility and expectation alignment; do not smuggle in new product behavior

**Step 5: Re-run the verification gate for cleanup**
Commands:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```
Expected: PASS, or any remaining failure must be explicitly proven unrelated before proceeding.

**Step 6: Commit**
```bash
git add tests tests/helpers scripts/smoke-cli.ts && git commit -m "test: restore full bun test compatibility"
```

---

## Task 13: Refresh smoke coverage and add a real Phase 2 e2e workflow

**Files:**
- Modify: `scripts/smoke-cli.ts`
- Modify: `tests/helpers/cli.ts`
- Create: `tests/e2e/phase-2-cli-storage-ux-workflow.test.ts`

**Step 1: Write the failing tests first**
Add a real e2e workflow through `bin/bn.ts` covering:
- init under `.state/`
- note creation with human-friendly key
- list/search/show flows
- edit/retitle rename behavior
- archive on a renamed note
- delete on another note
- rebuild consistency

Also update smoke expectations to assert the new root/storage contract and selector-friendly outputs.

**Step 2: Run the targeted checks — confirm they fail**
Commands:
```bash
bun test tests/e2e/phase-2-cli-storage-ux-workflow.test.ts
bun run smoke:cli
```
Expected: FAIL because the current smoke/e2e coverage is Phase 1-shaped.

**Step 3: Implement the minimum smoke/e2e updates**
- add the real end-to-end workflow test through the actual CLI entrypoint
- update the smoke script to assert `.state/`, plain-note creation, and current output expectations
- keep helpers explicit enough to preserve readability

**Step 4: Run the targeted checks — confirm they pass**
Commands:
```bash
bun test tests/e2e/phase-2-cli-storage-ux-workflow.test.ts
bun run smoke:cli
```
Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/smoke-cli.ts tests/helpers/cli.ts tests/e2e/phase-2-cli-storage-ux-workflow.test.ts && git commit -m "test: add phase 2 cli e2e workflow"
```

---

## Task 14: Align README and architecture/phase docs with the new storage contract

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/architecture/managed-root-layout.md`
- Modify: `docs/architecture/note-format-and-indexing.md`
- Modify: `docs/phases/phase-1-core-cli-storage.md`
- Modify as needed: `docs/architecture/runtime-and-dependencies.md`

**Step 1: Add the failing documentation checklist first**
Before editing, write down the exact doc mismatches to eliminate:
- frontmatter as canonical note storage
- nested `.bluenote/.bluenote` layout references
- UUID-centric selector assumptions
- missing `delete`, `completion`, and `migrate` command coverage
- missing docs discipline note for workflow changes

**Step 2: Update docs minimally but explicitly**
Document:
- plain note files and `.state/` sidecars
- key-based selector UX
- grouped search output philosophy
- auto-rebuild after CLI mutations
- completion install/use flow
- migration command and safety posture

**Step 3: Verify docs match the current code**
Commands:
```bash
bun test tests/e2e/phase-2-cli-storage-ux-workflow.test.ts
bun run smoke:cli
```
Expected: PASS, and docs should not claim behavior the tests do not prove.

**Step 4: Commit**
```bash
git add README.md docs/product/overview.md docs/architecture/managed-root-layout.md docs/architecture/note-format-and-indexing.md docs/phases/phase-1-core-cli-storage.md docs/architecture/runtime-and-dependencies.md && git commit -m "docs: align storage and cli docs with phase 2"
```

---

## Task 15: Final verification and review passes

**Files:**
- Review/modify as needed: all files touched in Tasks 1–14

**Step 1: Run the full verification gate**
Commands:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
git status --short
```
Expected: PASS and only intentional changes remain.

**Step 2: Run focused Phase 2 verification commands**
Commands:
```bash
bun test tests/e2e
bun test tests/integration
```
Expected: PASS.

**Step 3: Run review passes**
Run:
- spec-compliance review against `docs/plans/2026-05-24-phase-2-cli-storage-ux-pivot-design.md`
- code-quality review for storage safety, migration safety, test clarity, and completion robustness

**Step 4: Commit final polish only if necessary**
```bash
git add . && git commit -m "chore: finish phase 2 cli storage ux pivot"
```
Only if a final small polish change was required.

---

## Suggested execution order rationale

1. establish the new root/manifest contract before touching note semantics
2. introduce sidecar + plain-note primitives before refactoring command flows
3. move repository/index internals early so later CLI work rests on the right storage model
4. update create/list/show and selector behavior before editing/archive/delete/search polish
5. implement completion after selectors are stable
6. add explicit migration only after the new storage path already works
7. update smoke/e2e and docs once behavior is fully real
8. finish with full verification and review passes

---

## Stop condition

Do not execute Phase 2 implementation work until this plan is explicitly approved by the user.