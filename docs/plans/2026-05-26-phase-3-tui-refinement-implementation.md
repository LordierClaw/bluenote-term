# Phase 3 TUI Refinement Implementation Plan

> **For implementer:** Use TDD throughout. Write or adjust the failing test first, watch it fail for the intended reason, then implement the minimum change to make it pass. Keep commits small and task-scoped.

**Goal:** Refine the Phase 3 OpenTUI workspace so manual TUI behavior matches the approved design: semantic color/chrome, editor find/autosave, two-column manager browser/preview, stable Search Everything, and universal back navigation.

**Architecture:** Keep the existing service-backed TUI architecture. Extend the pure state/controller/adapters first, then update OpenTUI renderables and tmux-backed smoke coverage. Runtime renderers must maintain exactly one focused editable component per active mode.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, existing `src/tui/*` modules, existing BlueNote core services, tmux-backed interactive smoke scripts.

**Approved Design:** `docs/plans/2026-05-26-phase-3-tui-refinement-design.md`

---

## Task 1: Add semantic TUI theme and chrome view-model fields

**Files:**
- Create: `src/tui/theme.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/render-search-everything.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- `tuiTheme` exposes semantic tokens for background, panel, focused row, selected/open note, muted text, success, warning, danger, primary accent, and secondary accent.
- manager row view models include `styleIntent` for `focused`, `open`, `folder`, `note`, and `muted` metadata.
- editor topbar/bottombar view models include semantic status intents for saved/dirty/autosave states.
- Search Everything view models include panel/input/result/preview style intents.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts
```
Expected: FAIL because `src/tui/theme.ts` and the new style fields do not exist.

**Step 3: Write minimal implementation**
Implement `src/tui/theme.ts`:
- `TuiColorIntent` union
- `tuiTheme` object with hex color strings
- helper `styleForIntent(intent)` if useful for renderers

Extend view-model builders only; do not apply all OpenTUI renderable colors yet.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/theme.ts src/tui/render-manager.ts src/tui/render-editor.ts src/tui/render-search-everything.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: add tui semantic theme model"
```

---

## Task 2: Extend TUI state for modes, previous mode, manager path, and autosave

**Files:**
- Modify: `src/tui/state.ts`
- Modify: `tests/unit/tui/state.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- state tracks `mode` separately from `screen`, including `manager.browse`, `manager.filter`, `editor.body`, `editor.find`, `editor.replace`, and `search.input`.
- Search Everything stores both `previousScreen` and `previousMode` and cancellation restores both.
- manager state tracks `currentFolderPath`, `hoveredPath`, `filterQuery`, and parent navigation behavior.
- editor state tracks `findQuery`, `findMatchCount`, `activeFindIndex`, and `autosaveStatus` (`idle`, `pending`, `saving`, `saved`, `error`).
- `Escape`/back helpers close transient modes before changing screens.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/state.test.ts
```
Expected: FAIL because these state fields/helpers do not exist.

**Step 3: Write minimal implementation**
Extend state types and helpers:
- `TuiMode`
- `openSearchEverything()` accepts/restores previous mode
- `closeSearchEverything()` restores previous screen/mode
- `openEditorFind()`, `closeEditorFind()`
- `setManagerFilter()`, `clearManagerFilter()`
- `markAutosavePending()`, `markAutosaveSaving()`, `markAutosaveSaved()`, `markAutosaveError()`

Preserve immutable snapshot behavior.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/state.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/state.ts tests/unit/tui/state.test.ts && git commit -m "feat: add tui interaction modes"
```

---

## Task 3: Add two-column manager browser/preview adapter

**Files:**
- Modify: `src/tui/adapters/note-manager-adapter.ts`
- Modify: `tests/unit/tui/note-manager-adapter.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- manager items include only folders and BlueNote note files.
- Layout 1 lists immediate folders and notes for `currentFolderPath`.
- note rows expose `filename`, `title`, and `description` columns.
- folder rows expose `filename` and empty/subtle metadata columns.
- hovering a folder builds a Layout 2 folder preview with the same row style.
- hovering a note builds a Layout 2 note-content preview.
- right/open on a folder updates the current folder; right/open on a note returns editor-ready data.
- left/back moves to parent folder and no-ops calmly at root.
- filter narrows Layout 1 and updates Layout 2 from the hovered filtered item.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/note-manager-adapter.test.ts
```
Expected: FAIL because current adapter exposes a flat mixed list.

**Step 3: Write minimal implementation**
Add adapter functions/types:
- `ManagerBrowserRow`
- `ManagerPreviewModel`
- `buildManagerBrowserModel(noteSummaries, state)`
- `openManagerBrowserItem(state, deps)`
- `goToManagerParent(state)`
- keep legacy helpers temporarily if downstream tests still use them, but prefer new model in render/controller.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/note-manager-adapter.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/adapters/note-manager-adapter.ts tests/unit/tui/note-manager-adapter.test.ts && git commit -m "feat: add tui manager browser preview model"
```

---

## Task 4: Update workspace controller for manager open/back/filter and global back

**Files:**
- Modify: `src/tui/workspace-controller.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- `openFocusedManagerItem()` opens folders by changing `currentFolderPath` and opens notes in editor.
- `goBack()` closes Search Everything to prior screen/mode, closes editor find to editor body, closes manager filter to manager browse, and moves manager folders to parent when browsing.
- `setManagerFilter()` and `clearManagerFilter()` update manager state and preview.
- `Ctrl+P` toggle behavior is represented by controller methods: opening search records previous mode; when already in search, it returns to previous screen/mode.
- dirty/autosave pending or failed states still guard destructive note replacement/quit where required.

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/unit/tui/workspace-controller.test.ts
```
Expected: FAIL because the controller lacks folder-open/back/filter/mode APIs.

**Step 3: Write minimal implementation**
Extend `WorkspaceController` with:
- `goBack()`
- `openManagerFilter()`
- `updateManagerFilter(query)`
- `clearManagerFilter()`
- `toggleSearch(query?)`
- manager folder open/back integration using Task 3 adapter functions.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/unit/tui/workspace-controller.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/workspace-controller.ts tests/unit/tui/workspace-controller.test.ts && git commit -m "feat: add tui manager and back navigation actions"
```

---

## Task 5: Implement editor find mode and key routing

**Files:**
- Modify: `src/tui/adapters/editor-buffer-adapter.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `tests/unit/tui/editor-buffer-adapter.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- `Ctrl+F` from editor body enters editor find mode.
- editor find mode exposes one find input view model and match count.
- typing a find query updates matches against current editor body.
- `Enter` advances to next match.
- `Escape` or `Ctrl+[` closes find mode and returns to editor body.
- printable characters in find mode go to the find input, not the body textarea.

**Step 2: Run tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts
```
Expected: FAIL because `Ctrl+F` currently only runs `/find` command and no visible find mode/input exists.

**Step 3: Write minimal implementation**
- Reuse existing find helpers in `editor-buffer-adapter` where possible.
- Update `routeEditorKey()` to call controller/editor find methods.
- Render one compact find bar above the textarea when mode is `editor.find`.
- Ensure exactly one focused input/textarea in editor mode.

**Step 4: Run tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/adapters/editor-buffer-adapter.ts src/tui/render-editor.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: add tui editor find mode"
```

---

## Task 6: Add editor autosave debounce and stale completion guards

**Files:**
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- changing editor body marks autosave `pending` and dirty.
- autosave uses a 750ms debounce through an injectable scheduler/clock.
- autosave calls the same persistence dependency as manual save.
- stale autosave completion for an older body does not overwrite a newer body.
- stale autosave completion for a different active note is ignored.
- autosave success changes status to `saved`; autosave failure changes status to `error` and preserves dirty body.
- bottom bar displays `Unsaved`, `Autosaving…`, `Saved`, or `Autosave failed`.

**Step 2: Run tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts
```
Expected: FAIL because autosave scheduling/status does not exist.

**Step 3: Write minimal implementation**
- Add injectable debounce scheduler to controller dependencies with default `setTimeout`/`clearTimeout` in runtime.
- On `updateEditorBody`, schedule autosave at 750ms.
- Reuse `saveEditor` persistence path and stale completion checks.
- Update render editor bottom bar style/status.

**Step 4: Run tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/workspace-controller.ts src/tui/render-editor.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: autosave tui editor changes"
```

---

## Task 7: Render colored two-column manager browser/preview

**Files:**
- Modify: `src/tui/render-manager.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- manager view model has `topbar.currentPath` and `topbar.hoveredPath`.
- manager view model has Layout 1 rows and Layout 2 preview model.
- folder preview rows use the same row shape/style as Layout 1.
- note preview exposes content lines/title/path.
- focused row uses background highlight style intent.
- open note marker is distinct from hover focus.
- route manager keys map up/down to hover movement, right/enter to open, left/Escape/Ctrl+[ to back, `/` or `Ctrl+F` to filter.

**Step 2: Run tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```
Expected: FAIL because current manager renderer is flat and monochrome.

**Step 3: Write minimal implementation**
- Build manager topbar, two panel boxes, rows, and preview from Task 3 view model.
- Apply theme colors to panel backgrounds, focused rows, icons, metadata, and bars.
- Keep render logic simple and deterministic; avoid direct filesystem reads.

**Step 4: Run tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/render-manager.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "feat: render tui manager browser preview"
```

---

## Task 8: Rebuild Search Everything as one input, result list, and preview

**Files:**
- Modify: `src/tui/render-search-everything.ts`
- Modify: `src/tui/app.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write the failing test**
Add tests proving:
- Search Everything view model describes exactly one search input.
- runtime renderer assigns one stable input id: `bluenote-search-query`.
- layout has three regions: input, result list, preview/description.
- typing only updates one query state; it does not create duplicate input regions.
- `Escape` and `Ctrl+[` return to previous screen/mode.
- `Ctrl+P` toggles out of Search Everything when already open.
- selected result preview is always below the result list.

**Step 2: Run tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```
Expected: FAIL because current runtime can recreate/stack input renderables during invalidation and lacks explicit single-input layout assertions.

**Step 3: Write minimal implementation**
- Refactor Search Everything renderer to clear/rebuild the screen root safely or reuse one input renderable.
- Keep one focused `InputRenderable`.
- Apply colored panel chrome from theme.
- Ensure invalidation does not append duplicate inputs.

**Step 4: Run tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/render-search-everything.ts src/tui/app.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "feat: stabilize tui search everything layout"
```

---

## Task 9: Add interactive smoke coverage for real TUI keys

**Files:**
- Modify: `scripts/smoke-opentui-interactive.ts`
- Modify: `tests/integration/cli-help.test.ts`

**Step 1: Write the failing test/check**
Extend the smoke script so it verifies:
- Manager launches with colored/chromed Manager text and two-column markers.
- `Ctrl+P`, typing a query, and Escape returns to Manager.
- Search Everything capture contains exactly one visible search prompt/input label.
- opening a note, pressing `Ctrl+F`, and Escape shows/closes the editor find bar.
- manager right/left navigation can enter a folder and return where fixture data includes folders.

Update `cli-help.test.ts` to assert the smoke script remains part of `bun run check`.

**Step 2: Run smoke — confirm it fails before implementation if needed**
Command:
```bash
bun run smoke:opentui:interactive
```
Expected: FAIL until runtime behavior supports these key paths and stable panes.

**Step 3: Write minimal implementation**
- Add deterministic smoke fixture notes/folders.
- Use tmux `send-keys` for `C-p`, text, `Escape`, arrows, `C-f`, and `C-c`.
- Capture pane text between steps.
- Assert user-visible text, not implementation internals.

**Step 4: Run smoke — confirm it passes**
Command:
```bash
bun run smoke:opentui:interactive
```
Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/smoke-opentui-interactive.ts tests/integration/cli-help.test.ts && git commit -m "test: verify interactive tui key flows"
```

---

## Task 10: Update docs for refined TUI behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`
- Modify: `docs/architecture/runtime.md`
- Modify: `tests/integration/docs-phase3-tui.test.ts`

**Step 1: Write the failing test**
Update docs integration tests to require mention of:
- two-column manager browser/preview behavior
- right/left open/back navigation
- editor `Ctrl+F` find and 750ms autosave
- Search Everything single-input/result-list/preview layout
- Escape/Ctrl+[ back rule
- semantic colors/chrome

**Step 2: Run test — confirm it fails**
Command:
```bash
bun test tests/integration/docs-phase3-tui.test.ts
```
Expected: FAIL because docs still describe the older screen model.

**Step 3: Write minimal docs update**
Update user-facing docs to match implemented behavior and avoid overclaiming unsupported future features.

**Step 4: Run test — confirm it passes**
Command:
```bash
bun test tests/integration/docs-phase3-tui.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add README.md docs/product/overview.md docs/phases/phase-3-tui-workspace.md docs/architecture/runtime.md tests/integration/docs-phase3-tui.test.ts && git commit -m "docs: document refined phase 3 tui behavior"
```

---

## Task 11: Final verification and review readiness

**Files:**
- Modify only if verification reveals task-scoped drift.

**Step 1: Run required verification**
Command:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```
Expected: all checks pass and working tree is clean.

**Step 2: Run review passes**
Dispatch spec-compliance and code-quality review for the full refinement against:
- `docs/plans/2026-05-26-phase-3-tui-refinement-design.md`
- this implementation plan
- current diff/commits

**Step 3: Fix review findings if any**
If reviewers find issues, fix them with targeted tests and repeat review.

**Step 4: Commit final verification fixes if any**
```bash
git add <files> && git commit -m "test: finalize tui refinement verification"
```

**Step 5: Finish branch flow**
After all checks and reviews pass, present branch options per the finishing-branch workflow.
