# Phase 3 TUI Workspace Implementation Plan

> **For implementer:** Use TDD throughout. Write or adjust the failing test first, watch it fail for the intended reason, then implement the minimum change to make it pass.

**Goal:** Build the Phase 3 OpenTUI workspace with separate note manager, focused editor, and global Search Everything screens, exposed through `bn tui` and backed by existing BlueNote core services.

**Architecture:** Keep the TUI as a presentation/input layer over Phase 2 services. Add testable TUI state/controller/adapters under `src/tui/`, then wire them into OpenTUI renderables. The note manager owns file-style navigation, the editor owns inline note editing with top/bottom bars only, and Search Everything is a global overlay/screen for notes, content, folders, and slash-prefixed commands.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, existing BlueNote core services (`createNote`, `listNotes`, `showNote`, `searchNotes`, `archiveNote`, `deleteNote`, `rebuildIndexes`, `migrateStorage`), existing CLI entrypoint, existing smoke scripts.

---

## Task 1: Add Phase 3 TUI domain types and screen-state model

**Files:**
- Create: `src/tui/state.ts`
- Create: `tests/unit/tui/state.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- initial state starts on the manager screen
- state can switch between `manager`, `editor`, and `search` while remembering the previous screen for Search Everything cancellation
- editor state tracks active note key/path/title/body plus dirty/saved status
- manager state tracks focused item index and selected note key

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/state.test.ts
```
Expected: FAIL because `src/tui/state.ts` does not exist.

**Step 3: Write minimal implementation**
Create exported types and pure helpers:
- `TuiScreen = "manager" | "editor" | "search"`
- `ManagerItem` with `type`, `key`, `filename`, `title`, `description`, `relativePath`
- `EditorBufferState` with `note`, `body`, `savedBody`, `dirty`
- `SearchEverythingState` with `query`, `selectedIndex`, `previousScreen`
- `createInitialTuiState()`, `openSearchEverything()`, `closeSearchEverything()`, `openEditorForNote()`, `markEditorBodyChanged()`, `markEditorSaved()`

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/state.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/state.ts tests/unit/tui/state.test.ts && git commit -m "feat: add tui screen state model"
```

---

## Task 2: Add service-backed note manager adapter

**Files:**
- Create: `src/tui/adapters/note-manager-adapter.ts`
- Create: `tests/unit/tui/note-manager-adapter.test.ts`

**Step 1: Write the failing test**
Add tests proving the adapter:
- converts `listNotes()` summaries into manager note items showing filename/key, title, description, and path
- includes folder/group rows derived from note paths such as `notes/inbox` and `notes/archive` when present
- supports arrow-style movement with clamped/wrapped selection behavior defined by the test
- opens the selected note by calling a supplied `showNote` dependency and returning editor-ready note data

Use dependency injection instead of touching the real filesystem in unit tests.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/note-manager-adapter.test.ts
```
Expected: FAIL because the adapter does not exist.

**Step 3: Write minimal implementation**
Implement:
- `buildManagerItems(noteSummaries)`
- `moveManagerSelection(state, direction)`
- `openManagerSelection(state, deps)`
- small view model fields needed by the manager renderer

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/note-manager-adapter.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/adapters/note-manager-adapter.ts tests/unit/tui/note-manager-adapter.test.ts && git commit -m "feat: add tui note manager adapter"
```

---

## Task 3: Add editor buffer command adapter

**Files:**
- Create: `src/tui/adapters/editor-buffer-adapter.ts`
- Create: `tests/unit/tui/editor-buffer-adapter.test.ts`

**Step 1: Write the failing test**
Add tests proving editor commands can:
- preserve Unicode text when changing buffer content, including emoji and CJK text
- select all text
- cut/copy/paste through an injectable clipboard model
- navigate find results for a query
- perform find and replace on current buffer text
- save dirty editor content through an injectable persistence function and mark the buffer clean

The adapter should model state changes independently from OpenTUI so tests can run without a TTY.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts
```
Expected: FAIL because the adapter does not exist.

**Step 3: Write minimal implementation**
Implement pure helpers:
- `replaceEditorBody()`
- `selectAllEditorBody()`
- `copySelection()`
- `cutSelection()`
- `pasteText()`
- `findInEditorBody()`
- `replaceCurrentMatch()` / `replaceAllMatches()`
- `saveEditorBuffer()`

Do not implement a custom text engine for cursor rendering; leave runtime text editing to `TextareaRenderable` and keep these helpers as command/state adapters.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/adapters/editor-buffer-adapter.ts tests/unit/tui/editor-buffer-adapter.test.ts && git commit -m "feat: add tui editor buffer commands"
```

---

## Task 4: Add Search Everything index and command registry

**Files:**
- Create: `src/tui/adapters/search-everything-adapter.ts`
- Create: `tests/unit/tui/search-everything-adapter.test.ts`

**Step 1: Write the failing test**
Add tests proving Search Everything:
- returns note results matched by filename/key, title, description, and path/folder
- returns content results with note excerpts when `searchNotes()` supplies content matches
- returns folder/path results for folder queries
- returns slash-prefixed command results such as `/new`, `/archive`, `/delete`, `/rebuild`, `/migrate`, `/find`, and `/replace`
- shows command description, usage, and shortcut on highlighted command results
- preserves the invoking screen for cancellation

Use fake note summaries and fake search matches.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/search-everything-adapter.test.ts
```
Expected: FAIL because the adapter does not exist.

**Step 3: Write minimal implementation**
Implement:
- `TuiCommandDefinition` registry
- `buildSearchEverythingResults(query, deps)`
- simple fuzzy scoring based on lowercase subsequence/includes matching
- result kinds: `note`, `content`, `folder`, `command`
- preview helpers for highlighted note/content/command results

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/search-everything-adapter.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/adapters/search-everything-adapter.ts tests/unit/tui/search-everything-adapter.test.ts && git commit -m "feat: add tui search everything adapter"
```

---

## Task 5: Add workspace controller for screen switching and actions

**Files:**
- Create: `src/tui/workspace-controller.ts`
- Create: `tests/unit/tui/workspace-controller.test.ts`

**Step 1: Write the failing test**
Add tests proving the controller:
- starts on manager and loads manager items from the adapter
- switches manager → editor by opening the selected note
- switches editor ↔ manager with shortcut actions while preserving dirty editor state
- opens Search Everything from manager or editor and cancels back to the invoking screen
- routes selected Search Everything note results to editor, folder results to manager, and command results to command handlers
- blocks destructive actions or screen switches that would lose dirty editor content unless confirmed

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/workspace-controller.test.ts
```
Expected: FAIL because the controller does not exist.

**Step 3: Write minimal implementation**
Implement `createWorkspaceController(deps)` with explicit action methods rather than embedding action logic inside renderables. Inject core dependencies for tests.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/workspace-controller.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/workspace-controller.ts tests/unit/tui/workspace-controller.test.ts && git commit -m "feat: add tui workspace controller"
```

---

## Task 6: Add `bn tui` command and TUI bootstrap result path

**Files:**
- Modify: `src/cli/entry.ts`
- Modify: `src/tui/app.ts`
- Modify: `tests/unit/cli-entry.test.ts`
- Modify: `tests/integration/cli-help.test.ts`
- Modify: `scripts/smoke-opentui.ts`

**Step 1: Write the failing tests**
Add/update tests proving:
- `formatHelp()` lists `tui` as the Phase 3 launch command
- `runCli(["tui"], ...)` delegates to an injectable TUI runner and returns its result
- the old test rejecting hidden `tui` is removed/replaced
- `smoke-opentui` still verifies `@opentui/core` import and Phase 3 bootstrap metadata

**Step 2: Run tests — confirm they fail**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts
bun run smoke:opentui
```
Expected: FAIL because `tui` is currently hidden/unknown and bootstrap metadata is scaffold-only.

**Step 3: Write minimal implementation**
- add `tuiRunner?: () => CliResult` to `CliRuntimeOptions`
- add `tui` to help output
- route `runCli(["tui"], ...)` to the injected runner, with a default non-interactive-safe runner that starts the TUI only in real bin execution or returns guidance in tests
- update `getTuiBootstrapInfo()` status to Phase 3 workspace metadata

**Step 4: Run tests — confirm they pass**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts
bun run smoke:opentui
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/cli/entry.ts src/tui/app.ts tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts scripts/smoke-opentui.ts && git commit -m "feat: expose phase 3 tui command"
```

---

## Task 7: Implement OpenTUI renderer screens

**Files:**
- Modify: `src/tui/app.ts`
- Create: `src/tui/render-manager.ts`
- Create: `src/tui/render-editor.ts`
- Create: `src/tui/render-search-everything.ts`
- Create: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write the failing tests**
Add tests for render view-model builders, not a real TTY:
- manager view model includes rows with filename/key, title, description, focus marker, and shortcut/status hints
- editor view model includes only topbar, editor body metadata, and bottombar data
- Search Everything view model includes query, result list, selected preview/excerpt/command usage, and previous-screen context

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts
```
Expected: FAIL because render modules do not exist.

**Step 3: Write minimal implementation**
- build pure view-model functions first
- wire OpenTUI `Box`, `Text`, `InputRenderable`, and `TextareaRenderable` components to those view models
- keep actual renderer code thin and imperative only where OpenTUI requires it
- implement keyboard routing for manager/editor/search shortcuts through the workspace controller

**Step 4: Run test and smoke — confirm they pass**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts
bun run smoke:opentui
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/app.ts src/tui/render-manager.ts src/tui/render-editor.ts src/tui/render-search-everything.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: render phase 3 tui screens"
```

---

## Task 8: Add TUI controller integration workflow coverage

**Files:**
- Create: `tests/integration/tui-workspace-controller.test.ts`
- Modify: `tests/helpers/cli.ts` if helper reuse is needed

**Step 1: Write the failing integration test**
Add a realistic controller-level integration test that:
- creates a temporary managed root
- creates notes through existing core services
- rebuilds indexes if needed
- loads manager items
- opens a note into editor state
- changes Unicode body content
- saves through the TUI adapter/controller
- verifies `showNote()` sees saved body content
- opens Search Everything, searches by content and slash command, and verifies previews/usage

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/integration/tui-workspace-controller.test.ts
```
Expected: FAIL until controller/adapters are fully wired to real services.

**Step 3: Write minimal integration fixes**
Connect default controller dependencies to real core service functions and add any missing persistence helper needed to save edited body content without launching `$EDITOR`.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/integration/tui-workspace-controller.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui tests/integration/tui-workspace-controller.test.ts tests/helpers/cli.ts && git commit -m "test: cover phase 3 tui workspace flow"
```

---

## Task 9: Align docs/help/smoke checks for Phase 3 TUI

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`
- Modify: `docs/architecture/runtime-and-dependencies.md` if launch/runtime docs mention TUI status
- Modify: `scripts/smoke-cli.ts` if smoke help expectations need `tui`
- Modify: related tests that assert help/docs contracts

**Step 1: Write/update failing docs contract tests**
Update existing help/docs assertions so they expect Phase 3 `tui` launch and the separate manager/editor/search model where applicable.

**Step 2: Run targeted tests — confirm they fail before docs/code alignment if not already updated**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts
bun run smoke:cli
```
Expected: FAIL until docs/help/smoke expectations are aligned.

**Step 3: Update docs and smoke scripts**
Document:
- `bn tui`
- separate Manager / Editor / Search Everything screens
- editor capabilities and current Phase 3 scope
- CLI completion remains shell setup, not a TUI action

**Step 4: Run targeted verification**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts
bun run smoke:cli
```
Expected: PASS.

**Step 5: Commit**
```bash
git add README.md docs/product/overview.md docs/phases/phase-3-tui-workspace.md docs/architecture/runtime-and-dependencies.md scripts/smoke-cli.ts tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts && git commit -m "docs: document phase 3 tui workspace"
```

---

## Task 10: Final verification and review readiness

**Files:**
- No intended source edits unless verification exposes a regression.

**Step 1: Run required repository verification**
Command:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
git status --short --branch
```
Expected: all checks PASS and working tree clean.

**Step 2: Review contract alignment**
Check that README, phase docs, CLI help, smoke scripts, and tests agree on:
- `bn tui` availability
- Phase 3 active TUI workspace
- separate manager/editor/search screens
- editor capabilities
- no storage contract drift from Phase 2

**Step 3: Commit only if fixes were required**
If verification fixes are needed:
```bash
git add <fixed-files> && git commit -m "fix: stabilize phase 3 tui verification"
```

**Step 4: Hand off to code review / finish-branch flow**
Dispatch final spec and code-quality review subagents, then follow the finishing-branch workflow once all reviews and verification pass.
