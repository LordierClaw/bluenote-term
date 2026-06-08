# Phase 7 Note Management Enhancement Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement. Commit after each green task.

**Goal:** Implement Phase 7 fresh note-management behavior: typed draft/normal/archive notes, `note/` + `draft/` layout, draft-first startup, updated `bn new`, Manager note/folder actions, draft promotion, and quick editor switching.

**Architecture:** Refactor storage around explicit note types and path invariants from the approved design `docs/plans/2026-06-06-phase-7-note-management-enhancement-design.md`. Keep note Markdown plain; store all metadata in sidecars; use partial sidecar updates for move/rename/promote/archive and rebuild derived indexes after user-visible mutations.

**Tech Stack:** TypeScript, Bun test runner, OpenTUI controller/rendering code, current BlueNote storage/index/CLI modules.

---

## Scope guard

Use the exact approved design file:

- `docs/plans/2026-06-06-phase-7-note-management-enhancement-design.md`

Do not use old Phase 3/4/5/6 TUI or storage plans as implementation source of truth. Prior phase docs are historical context only.

Do not implement old-root migration from `notes/inbox`, `notes/journal`, or `notes/archive`. Phase 7 initializes fresh roots with `note/`, `draft/`, and `.data/archive/`.

## Required final verification gate

Run before final sign-off:

```bash
bun run lint
bun run typecheck
bun run test
bun run smoke:opentui
bun run smoke:cli
```

If full `bun run test` fails for pre-existing unrelated tests, compare targeted slices against branch base before classifying.

---

## Task 1: Root layout switches to `note/`, `draft/`, and `.data/archive/`

**Files:**
- Modify: `src/storage/root-layout.ts`
- Modify: `src/cli/entry.ts` if help/status text mentions old folders
- Test: `tests/unit/storage/root-layout.test.ts` or existing root-layout test file
- Test: `tests/e2e/cli-workflow.test.ts` / smoke assertions that inspect initialized layout
- Docs later in Task 12 only unless tests require immediate expected strings

**Step 1: Write failing tests**
- Add/update tests that call `ensureManagedRoot(tempRoot)` and assert these directories exist:
  - `note/`
  - `draft/`
  - `.data/archive/`
  - `.data/notes/`
  - `.data/ai/`
- Assert old layout directories are not created by fresh init:
  - `notes/inbox`
  - `notes/journal`
  - `notes/archive`
- Add a CLI-level smoke/e2e assertion that `bn init` creates the Phase 7 directories.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/storage/root-layout.test.ts tests/e2e/cli-workflow.test.ts
```

Expected: FAIL because fresh roots still create `notes/inbox`, `notes/journal`, and `notes/archive`.

**Step 3: Implement**
- Replace `MANAGED_ROOT_LAYOUT` user folders with `note`, `draft`, and `.data/archive`.
- Add helpers:
  - `getNormalNotesPath(rootPath)` or equivalent for `note/`
  - `getDraftNotesPath(rootPath)`
  - `getArchiveNotesPath(rootPath)`
  - path helper for `.data/archive/<key>.md`
- Keep symlink safety checks for all created layout paths.
- Remove new-root assumptions that require `notes/inbox`.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/storage/root-layout.test.ts tests/e2e/cli-workflow.test.ts
```

Expected: PASS for layout tests; adjust only directly affected old-layout assertions.

**Step 5: Commit**

```bash
git add src/storage/root-layout.ts tests/unit/storage/root-layout.test.ts tests/e2e/cli-workflow.test.ts && git commit -m "feat: initialize phase 7 note layout"
```

---

## Task 2: Sidecar schema adds explicit note type and path invariants

**Files:**
- Modify: `src/storage/sidecar-schema.ts`
- Modify: `src/storage/note-repository.ts`
- Modify: `src/storage/sidecar-repository.ts` if partial update helpers belong there
- Test: `tests/unit/storage/sidecar-schema.test.ts` or nearest sidecar schema test
- Test: `tests/unit/storage/note-repository.test.ts`

**Step 1: Write failing tests**
- Validate accepted sidecars for:
  - `type: "normal"`, `relativePath: "note/work.md"`, `archivedAt: null`
  - `type: "draft"`, `relativePath: "draft/draft-a8k2p9.md"`, `archivedAt: null`
  - `type: "archived"`, `relativePath: ".data/archive/example.md"`, non-null `archivedAt`
- Validate rejection for:
  - missing `type`
  - unknown `type`
  - `type: "normal"` under `draft/`
  - `type: "draft"` under `note/`
  - `type: "archived"` with null `archivedAt`
  - active note with non-null `archivedAt`
- Add repository create/read/list tests that produced sidecars now include the correct `type`.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/storage/sidecar-schema.test.ts tests/unit/storage/note-repository.test.ts
```

Expected: FAIL because `type` is not supported/required.

**Step 3: Implement**
- Add `NoteType = "normal" | "draft" | "archived"`.
- Add `type` to `NoteSidecar` and validation.
- Enforce the path/type/archive invariants in schema validation.
- Update repository sidecar builders to set `type` explicitly.
- Preserve optional AI metadata validation.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/storage/sidecar-schema.test.ts tests/unit/storage/note-repository.test.ts
```

**Step 5: Commit**

```bash
git add src/storage/sidecar-schema.ts src/storage/note-repository.ts src/storage/sidecar-repository.ts tests/unit/storage/sidecar-schema.test.ts tests/unit/storage/note-repository.test.ts && git commit -m "feat: add typed note sidecars"
```

---

## Task 3: Repository create/read/list supports draft and normal destinations

**Files:**
- Modify: `src/storage/note-repository.ts`
- Modify: `src/core/create-note.ts`
- Modify: `src/domain/note-key.ts` if draft random generation needs a helper
- Test: `tests/unit/storage/note-repository.test.ts`
- Test: `tests/unit/core/create-note.test.ts`

**Step 1: Write failing tests**
- Creating a draft without title creates `draft/draft-{random6}.md`, sidecar `type: "draft"`, title/key equal basename.
- Creating a draft with title creates `draft/<title-key>.md`, sidecar `type: "draft"`.
- Creating a normal note requires a destination folder under `note/`, writes to `note/<folder>/<title-key>.md`, sidecar `type: "normal"`.
- Normal creation rejects missing/nonexistent destination folder.
- Normal creation rejects destination under `draft/`.
- Existing global key uniqueness still prevents duplicate basenames across `note/`, `draft/`, and sidecars.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/storage/note-repository.test.ts tests/unit/core/create-note.test.ts
```

Expected: FAIL because create still writes to `notes/inbox` and title is required.

**Step 3: Implement**
- Extend `CreateNoteOptions` with `type` or destination mode:
  - draft mode: optional title, generated draft title if missing
  - normal mode: required title and existing `note/...` destination folder
- Generate `draft-{random6}` using deterministic `randomSource` in tests.
- Write notes under `draft/` or specified `note/...` path.
- Keep body plain Markdown.
- Rebuild indexes and enqueue AI stale-description work only after successful local create.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/storage/note-repository.test.ts tests/unit/core/create-note.test.ts
```

**Step 5: Commit**

```bash
git add src/storage/note-repository.ts src/core/create-note.ts src/domain/note-key.ts tests/unit/storage/note-repository.test.ts tests/unit/core/create-note.test.ts && git commit -m "feat: create draft and normal notes"
```

---

## Task 4: CLI `bn new` content, clipboard, path, and title behavior

**Files:**
- Modify: `src/cli/entry.ts`
- Modify: `src/cli/ai.ts` only if shared arg parsing conflicts appear
- Modify: `src/platform/clipboard.ts` or create if no platform wrapper exists
- Test: `tests/unit/cli/entry.test.ts`
- Test: `tests/e2e/cli-workflow.test.ts`
- Test: `tests/e2e/cli-storage-ux-workflow.test.ts`

**Step 1: Write failing tests**
- `bn new "body"` creates a draft with generated `draft-{random6}` title/key/path.
- `bn new --title "Idea" "body"` creates a draft under `draft/` with title-derived basename.
- `bn new --path note/work --title "Meeting" "body"` creates a normal note in existing folder.
- `bn new --path note/work "body"` fails: `--path requires --title`.
- `bn new --path draft --title "Bad" "body"` fails.
- `bn new --path note/missing --title "Bad" "body"` fails.
- `bn new` with no body and no `--clipboard` fails.
- positional body plus `--clipboard` fails as ambiguous.
- `--clipboard` empty/unavailable fails and creates no note.
- Help text no longer documents old `bn new --title <title>` as title-only create.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/cli/entry.test.ts tests/e2e/cli-workflow.test.ts tests/e2e/cli-storage-ux-workflow.test.ts
```

Expected: FAIL because CLI still requires `--title` and has no content/clipboard/path behavior.

**Step 3: Implement**
- Parse `--title`, `--path`, `--clipboard`, and one optional body argument.
- Require exactly one body source.
- Use `clipboardy` through a testable injected runtime/dependency.
- Call `createNote` in draft mode when no `--path`.
- Call `createNote` in normal mode when `--path note/...` and title are present.
- Update user-facing help and error hints.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/cli/entry.test.ts tests/e2e/cli-workflow.test.ts tests/e2e/cli-storage-ux-workflow.test.ts
```

**Step 5: Commit**

```bash
git add src/cli/entry.ts src/platform tests/unit/cli/entry.test.ts tests/e2e/cli-workflow.test.ts tests/e2e/cli-storage-ux-workflow.test.ts && git commit -m "feat: update new note CLI"
```

---

## Task 5: Visibility flags for list/search and archive storage

**Files:**
- Modify: `src/core/list-notes.ts`
- Modify: `src/core/search-notes.ts`
- Modify: `src/core/select-note.ts`
- Modify: `src/core/show-note.ts`
- Modify: `src/core/edit-note.ts`
- Modify: `src/core/delete-note.ts`
- Modify: `src/core/archive-note.ts`
- Modify: `src/cli/entry.ts`
- Test: `tests/unit/core/list-notes.test.ts`
- Test: `tests/unit/core/search-notes.test.ts`
- Test: `tests/unit/core/select-note.test.ts`
- Test: `tests/e2e/cli-storage-ux-workflow.test.ts`

**Step 1: Write failing tests**
- Default `list/search/show/edit/delete` sees normal notes only.
- `bn list --drafts` and `bn search --drafts <query>` include normal + drafts.
- `bn list --all` and `bn search --all <query>` include normal + drafts + archived.
- `show`, `edit`, and `delete` do not accept `--drafts` or `--all`; those commands accept an exact selector for any note type without extra visibility flags.
- Archive moves normal note file to `.data/archive/<key>.md` and updates sidecar to `type: "archived"`, non-null `archivedAt`.
- Archived notes do not appear by default after archive.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/core/list-notes.test.ts tests/unit/core/search-notes.test.ts tests/unit/core/select-note.test.ts tests/e2e/cli-storage-ux-workflow.test.ts
```

**Step 3: Implement**
- Introduce a `NoteVisibility` or type-filter option for list/search and shared selector internals where useful.
- Thread visibility through list/search only at the CLI surface; keep show/edit/delete free of visibility flags and allow exact selectors to resolve any note type.
- Parse `--drafts` and `--all` only for `list` and `search` CLI commands.
- Refactor archive to hidden flat `.data/archive/<key>.md` path.
- Preserve sidecar metadata and update indexes after archive/delete/edit changes.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/core/list-notes.test.ts tests/unit/core/search-notes.test.ts tests/unit/core/select-note.test.ts tests/e2e/cli-storage-ux-workflow.test.ts
```

**Step 5: Commit**

```bash
git add src/core src/cli/entry.ts tests/unit/core tests/e2e/cli-storage-ux-workflow.test.ts && git commit -m "feat: add typed note visibility and archive storage"
```

---

## Task 6: Latest-opened config/state repositories and startup draft fallback

**Files:**
- Create: `src/config/app-config.ts` or `src/storage/app-config-repository.ts`
- Create: `src/tui/latest-opened-note.ts`
- Modify: `src/tui/app.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/state.ts`
- Test: `tests/unit/tui/latest-opened-note.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**
- Reads default `latestOpenedNoteTtlDays` of 7 when `.data/config.json` is absent.
- Writes/reads latest-opened state with `relativePath` + `openedAt`.
- Startup opens recorded note if path exists and openedAt is within TTL.
- Startup creates/opens draft when latest-opened is stale.
- Startup creates/opens draft when latest-opened path is missing.
- Latest-opened updates whenever editor opens a note.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/tui/latest-opened-note.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

**Step 3: Implement**
- Add `.data/config.json` repository with tolerant defaults.
- Add `.data/latest-opened-note.json` repository.
- Update TUI bootstrap to choose editor initial note instead of defaulting to Manager.
- Create draft on invalid/stale/missing latest-opened.
- Ensure latest-opened updates on all open paths.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/latest-opened-note.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

**Step 5: Commit**

```bash
git add src/config src/storage src/tui tests/unit/tui/latest-opened-note.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: restore latest opened note or draft"
```

---

## Task 7: Manager ordering, current-note directory anchoring, and folder creation

**Files:**
- Modify: `src/tui/adapters/note-manager-adapter.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/state.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/unit/tui/render-manager.test.ts` or existing renderer tests

**Step 1: Write failing tests**
- Manager opens current editor note directory (`note/work` or `draft`).
- Normal folder lists folders first, alphabetical ascending, then notes alphabetical ascending.
- Draft folder lists draft notes by createdAt descending.
- Create-folder action is available anywhere under `note/`, including nested folders.
- Create-folder action is unavailable in `draft/`.
- Creating a folder updates Manager state and does not create note metadata.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-manager.test.ts
```

**Step 3: Implement**
- Adapt Manager item collection to Phase 7 layout and type filters.
- Anchor Manager folder from current editor note.
- Add create-folder flow for current `note/...` folder.
- Keep protected areas hidden/unavailable.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-manager.test.ts
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui && git commit -m "feat: update manager folder browsing"
```

---

## Task 8: Manager rename folder, rename note title, and move normal note

**Files:**
- Modify: `src/storage/note-repository.ts`
- Create/Modify: `src/core/move-note.ts`
- Modify: `src/core/rename-note.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/state.ts`
- Test: `tests/unit/storage/note-repository.test.ts`
- Test: `tests/unit/core/rename-note.test.ts`
- Test: `tests/unit/core/move-note.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`

**Step 1: Write failing tests**
- Rename normal note title derives new key/filename/path and moves sidecar filename.
- Rename preserves `createdAt`, description, AI metadata, and unaffected metadata.
- Rename updates latest-opened when the renamed note is open.
- Rename folder under `note/` updates affected sidecar `relativePath` values only.
- Rename folder rejects `note/` root and `draft/`.
- Move note to existing folder under `note/` updates relativePath and preserves key/title.
- Move rejects drafts and hidden/archive destinations.
- Move uses existing-folder chooser semantics only.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/storage/note-repository.test.ts tests/unit/core/rename-note.test.ts tests/unit/core/move-note.test.ts tests/unit/tui/workspace-controller.test.ts
```

**Step 3: Implement**
- Add partial sidecar update helpers if not already present.
- Implement folder rename by filesystem rename + affected sidecar relativePath updates.
- Implement note title rename by title/key/path sync.
- Implement normal note move under `note/`.
- Thread Manager shortcuts/status and conflict errors.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/storage/note-repository.test.ts tests/unit/core/rename-note.test.ts tests/unit/core/move-note.test.ts tests/unit/tui/workspace-controller.test.ts
```

**Step 5: Commit**

```bash
git add src/storage src/core src/tui tests/unit/storage tests/unit/core tests/unit/tui && git commit -m "feat: manage note and folder moves"
```

---

## Task 9: Save Draft As Normal flow with `Alt+S` and `/save-draft-as`

**Files:**
- Create/Modify: `src/core/promote-draft.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/render-search-everything.ts`
- Modify: `src/tui/state.ts`
- Modify: `src/tui/app.ts`
- Test: `tests/unit/core/promote-draft.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**
- Promoting draft moves `draft/<old>.md` to selected existing `note/.../<new-key>.md`.
- Sidecar updates `type: "normal"`, key, title, relativePath, updatedAt while preserving createdAt/body/description/AI metadata.
- Old draft Markdown path is removed.
- Destination title field is pre-filled with current draft title.
- Destination chooser only selects existing folders under `note/`.
- `Alt+S` opens save-draft-as flow for drafts.
- `/save-draft-as` command opens same flow.
- Command/shortcut unavailable or status-only for normal notes.
- After promotion, Editor opens promoted note and latest-opened is updated.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/core/promote-draft.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

**Step 3: Implement**
- Add core promote helper.
- Add TUI save-draft-as mode/state.
- Wire `Alt+S` through real TUI input routing, not only controller methods.
- Add slash command result in Search Everything or editor command routing.
- Render manager-like existing-folder chooser and title input.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/core/promote-draft.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

**Step 5: Commit**

```bash
git add src/core src/tui tests/unit/core/promote-draft.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: promote drafts from the editor"
```

---

## Task 10: Editor quick same-folder switching and transient index indicator

**Files:**
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/app.ts`
- Modify: `src/tui/state.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/unit/tui/render-editor.test.ts` or existing editor render tests
- Test: `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**
- `Ctrl+PageDown` opens next note in same folder using Manager note ordering.
- `Ctrl+PageUp` opens previous note in same folder.
- Switching does not include folders and does not leave current folder.
- Draft folder switching follows draft createdAt-desc ordering.
- After switch, state contains index indicator like `03/10`.
- Indicator clears after 2 seconds through scheduler.
- Rendered topbar shows indicator in blue left of title while active.

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-editor.test.ts tests/integration/tui-workflow.test.ts
```

**Step 3: Implement**
- Add editor switch handlers.
- Wire raw `Ctrl+PageUp/PageDown` key sequences in runtime input mapping.
- Add transient indicator state and scheduler clearing.
- Update topbar rendering.
- Update latest-opened and AI idle queue behavior consistently when switching notes.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-editor.test.ts tests/integration/tui-workflow.test.ts
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui tests/integration/tui-workflow.test.ts && git commit -m "feat: switch notes from editor shortcuts"
```

---

## Task 11: Real workflow/e2e coverage and TUI lifecycle smoke

**Files:**
- Modify: `tests/e2e/cli-workflow.test.ts`
- Modify: `tests/e2e/cli-storage-ux-workflow.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`
- Modify: `scripts/smoke-cli.ts`
- Modify: `scripts/smoke-opentui.ts`

**Step 1: Write failing tests**
Add a real bin/CLI workflow that:

1. `bn init`
2. creates `note/work` folder directly in test setup or through Manager/controller if needed
3. `bn new "draft body"`
4. `bn new --title "Named Draft" "draft body"`
5. `bn new --path note/work --title "Meeting" "normal body"`
6. verifies sidecars and Markdown paths
7. verifies `bn list`, `bn list --drafts`, `bn search`, `bn search --drafts`
8. archives normal note and verifies hidden archive storage and default invisibility

Add TUI integration/smoke coverage for:

- startup latest-opened restore
- stale latest-opened draft fallback
- quit lifecycle after editor-start behavior

**Step 2: Run tests — confirm fail before final harness updates**

```bash
bun test tests/e2e tests/integration/tui-workflow.test.ts
bun run smoke:cli
bun run smoke:opentui
```

**Step 3: Implement/adjust harness**
- Update smoke metadata from previous phase only if it advertises stale folder/phase behavior.
- Remove brittle old `notes/inbox` assumptions.
- Keep test helpers DRY for temp-root setup and folder creation.
- Ensure subprocess tests unset inherited env vars where relevant.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/e2e tests/integration/tui-workflow.test.ts
bun run smoke:cli
bun run smoke:opentui
```

**Step 5: Commit**

```bash
git add tests/e2e tests/integration scripts && git commit -m "test: cover phase 7 note workflows"
```

---

## Task 12: Docs/help alignment for Phase 7 behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/architecture/managed-root-layout.md`
- Modify: `docs/architecture/note-format-and-indexing.md`
- Modify: `docs/architecture/runtime-and-dependencies.md`
- Modify: `docs/product/design-language.md` if shortcut/help examples change
- Modify: `docs/phases/phase-7-note-management-enhancement.md` or create if phase docs use per-phase files
- Modify: tests that assert docs/help contracts

**Step 1: Write failing docs/help tests**
- Add positive assertions that current-facing docs mention:
  - `note/` and `draft/`
  - `.data/archive/`
  - sidecar `type`
  - `bn new` content/clipboard/path behavior
  - `Alt+S` and `/save-draft-as`
  - latest-opened draft fallback
- Add negative assertions against stale canonical wording:
  - `notes/inbox`
  - `notes/journal`
  - `notes/archive`
  - old title-only `bn new --title <title>` create contract

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/cli/entry.test.ts tests/e2e/cli-workflow.test.ts
```

Include any existing doc contract tests if present.

**Step 3: Implement docs/help updates**
- Update README and architecture docs to Phase 7 storage/CLI/TUI contracts.
- Create/update Phase 7 phase doc.
- Update CLI help string in `src/cli/entry.ts` if not already complete.
- Keep historical old phase docs only if clearly historical; do not rewrite every historical plan unless tests intentionally target current-facing docs.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/cli/entry.test.ts tests/e2e/cli-workflow.test.ts
```

**Step 5: Commit**

```bash
git add README.md docs src/cli/entry.ts tests && git commit -m "docs: align phase 7 note management contracts"
```

---

## Task 13: Manager creation, quick draft, draft-folder restrictions, and root label follow-up

**Files:**
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/render-editor.ts` or nearby editor shortcut wiring if the quick-draft shortcut is editor-visible
- Modify: `src/tui/adapters/note-manager-adapter.ts` if root-label data needs managed-root context
- Modify: `src/tui/state.ts` if new prompt state is needed
- Modify: `src/tui/app.ts` if default controller dependencies need a create-draft/create-normal-note runtime adapter
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-manager.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**
Add focused regressions for the newly approved follow-up contract:

1. Manager `n` action under `note/` offers both **new note** and **new folder**, not folder-only behavior.
2. Manager-created notes are normal notes in the current `note/...` folder, use a typed title/body prompt or minimal title prompt per current TUI conventions, update sidecar metadata, refresh indexes, and open the created note or leave a clear status according to the final prompt design.
3. Manager `n` in `draft/` does not offer folder creation; it should either offer quick new draft only or defer to the dedicated quick-draft shortcut, but must not create custom folders under `draft/`.
4. A dedicated quick-new-draft shortcut from Manager and/or Editor creates a generated `draft-{random}` draft under `draft/`, opens it in Editor, and updates latest-opened.
5. In `draft/`, Move shortcut/help is hidden and invoking the move action is a no-op/status-only guard; drafts can leave `draft/` only through Save Draft As Normal.
6. At Manager virtual root, the visible root/chrome label is the managed root absolute path, not `note/`, `note/draft`, `note/note`, or legacy `notes/`; root rows still list `draft` and `note` child areas.
7. Existing Save Draft As and normal-note Move chooser regressions remain green: action-mode ArrowLeft/ArrowRight navigates folders without closing the sheet, and ArrowRight on note rows does not open the note.
8. Follow-up UX contract: when the Manager create box opens in default **New note** mode, the visible prompt/action row must include a Tab shortcut hint for toggling to folder creation (for example `[Tab] Folder`). The hint must also stay accurate after toggling into folder mode (for example `[Tab] Note`).

**Step 2: Run tests — confirm fail**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-manager.test.ts tests/integration/tui-workflow.test.ts --test-name-pattern "manager n|quick draft|draft move|root label|save draft as folder chooser|move folder chooser"
```

Expected: FAIL because `n` is currently folder-oriented, no dedicated quick-draft shortcut exists, draft-folder move visibility is incomplete, and root chrome still needs absolute-root labeling.

**Step 3: Implement**
- Refactor Manager create state from folder-only to an action that can choose/create a normal note or folder under `note/`.
- Reuse existing note creation services instead of duplicating storage writes; normal notes must remain under `note/...` and drafts under `draft/`.
- Add a quick-new-draft command/shortcut with explicit render help text in the contexts where it is supported.
- Ensure the Manager create prompt visibly advertises the Tab toggle while open: default New note mode shows a folder-toggle hint and toggled New folder mode shows a note-toggle hint.
- Hide/guard Move in `draft/`; keep Save Draft As Normal available for drafts.
- Thread managed-root absolute path into the manager view model/root label path without changing stored note relative paths.
- Keep current action-mode folder chooser fixes intact.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-manager.test.ts tests/integration/tui-workflow.test.ts
bun run typecheck
```

**Step 5: Commit**

```bash
git add src/tui tests/unit/tui tests/integration/tui-workflow.test.ts && git commit -m "feat: refine manager note and draft actions"
```

---

## Task 14: Final independent reviews and full gate

**Files:**
- No planned code changes unless reviewers find blockers.

**Step 1: Run full verification**

```bash
bun run lint
bun run typecheck
bun run test
bun run smoke:opentui
bun run smoke:cli
```

**Step 2: Dispatch spec review**
Ask reviewer to compare the branch diff against:

- `docs/plans/2026-06-06-phase-7-note-management-enhancement-design.md`
- `docs/plans/2026-06-06-phase-7-note-management-enhancement-implementation-plan.md`

Review focus:

- No old `notes/inbox` assumptions remain in current behavior.
- Path/type invariants are enforced.
- CLI visibility flags match approved semantics.
- TUI startup does not fall back to most-recently-updated note.
- Draft promotion is move, not copy.
- Metadata partial updates preserve AI and non-AI fields.

**Step 3: Dispatch quality review**
Review focus:

- No broad rewrites beyond Phase 7 scope.
- No fragile date/random assertions.
- No duplicated path filtering logic that can drift.
- No hidden blocking AI/provider calls in save/autosave/open flows.
- TUI input mappings are runtime-wired, not controller-only.
- Manager `n` supports both note and folder creation under `note/` without enabling folder creation under `draft/`.
- Quick-new-draft shortcut opens a generated draft and updates latest-opened.
- Draft folder hides/guards Move while preserving Save Draft As Normal.
- Manager root chrome labels the absolute managed root path rather than virtual `note/`/`draft` names.

**Step 4: Fix blockers with TDD**
For each blocker:

1. Add focused failing regression.
2. Fix root cause.
3. Run targeted tests.
4. Re-run full gate if behavior-affecting.
5. Re-review if substantial.
6. Commit fix.

**Step 5: Finish branch handoff**
After green verification and reviewer approval, follow the finishing-branch skill: determine base branch and offer merge/push/keep/discard options.
