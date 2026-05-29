# Phase 4J TUI Manager/Search/Editor Polish Implementation Plan

> **For implementer:** Use TDD throughout. Write the failing test first. Watch it fail. Then implement the smallest fix. Commit after each green task.

**Goal:** Continue Phase 4 TUI improvement with focused manager layout polish, richer Search Everything previews/results, editor chrome separation, terminal-compatible clipboard/history/find-replace shortcuts, and screenshot-backed manual QA.

**Architecture:** Keep the TUI as presentation/input only. Model shaping remains in adapters/view-model builders, state mutations remain in `src/tui/state.ts` and `src/tui/workspace-controller.ts`, rendering stays in `src/tui/render-*.ts`, and storage remains in core services. Visual behavior must continue to follow `docs/product/design-language.md` (Quiet Blue Dashboard): calm dark/default terminal surfaces, restrained blue accent, readable spacing, and content-first previews without metadata clutter.

**Tech Stack:** Bun, TypeScript, OpenTUI, existing BlueNote core storage/search services, `scripts/visual-tui-qa.ts`, and live `computer-use-linux` screenshot/manual verification.

**Source requirements from user:**

1. Manager bottom bar should label the currently open note, e.g. “Currently open”.
2. Manager layout text can be too long and expand into the other layout; clamp/truncate so columns do not bleed.
3. Manager preview folder view should just show items, not folder metadata.
4. Manager preview note view should remove metadata too.
5. Editor topbar/bottombar should be visually separated from editor body via separator line or different topbar background.
6. Desktop mouse selection currently works, but copy/cut/paste does not; support terminal-friendly `Ctrl+Shift+<key>` copy/cut/paste where possible.
7. Filter shortcut should show on manager screen too.
8. Manager folder filter should search only item names within the current folder, not full path/metadata.
9. Search Everything folder preview: title is folder full path, matched keyword in path is highlighted, preview content is similar to manager preview showing files/folders inside.
10. Search Everything file preview: title is title + filename; highlight matches in title/filename; content match previews should center on the matched part and highlight it.
11. If a note content has many matching locations, show as many Search Everything result items, similar to IntelliJ Search Everywhere.
12. Editor: add shortcut to open find-and-replace dialog; found results should be highlighted/selected in background.
13. Editor: add undo/redo shortcuts with a small recent history.
14. Manager/editor shortcuts should be more consistent, terminal-compatible where possible, and persistent across manager/editor.

**Manual verification requirement:** Every requirement must be verified with both normal automation and live manual computer-use verification with screenshots. Functional live verification must include disk/process readback for edit/save/copy/paste/undo/redo flows.

---

## 1. Current implementation seams

Primary files expected to change:

- `src/tui/adapters/note-manager-adapter.ts`
  - manager row filtering currently searches filename, key, title, description, and path.
  - folder/note preview models originate here.
- `src/tui/render-manager.ts`
  - manager view model, shortcut hints, topbar/footer/bottom path, row rendering, preview rendering.
- `src/tui/adapters/search-everything-adapter.ts`
  - search result generation and preview model shaping.
- `src/tui/render-search-everything.ts`
  - search row/preview rendering and highlighted text chunks.
- `src/tui/state.ts`
  - editor modes, find/replace state, editor buffer state; add history if needed.
- `src/tui/workspace-controller.ts`
  - editor mutation methods, find/replace commands, undo/redo, clipboard actions.
- `src/tui/render-editor.ts`
  - editor chrome/body separation, find/replace prompt and match highlighting.
- `src/tui/render-chrome.ts`
  - shared shortcut hint labels/styles if shortcut rebinding needs central formatting.
- `src/tui/theme.ts`
  - semantic colors/background intents only if existing tokens are insufficient.
- `scripts/visual-tui-qa.ts`
  - add Phase 4J screenshot/manual evidence states for new manager/search/editor flows.

Primary tests expected to change/add:

- `tests/unit/tui/note-manager-adapter.test.ts`
- `tests/unit/tui/search-everything-adapter.test.ts`
- `tests/unit/tui/render-view-models.test.ts`
- `tests/unit/tui/render-routing.test.ts`
- `tests/unit/tui/editor-buffer-adapter.test.ts`
- `tests/unit/tui/workspace-controller.test.ts`
- `tests/integration/tui-workflow.test.ts`
- `tests/unit/tui/visual-tui-qa-script.test.ts`
- `tests/integration/docs-phase3-tui.test.ts` if user-facing docs/help/shortcut wording changes.

---

## 2. Shortcut direction for Phase 4J

Treat this as a best-effort terminal-compatible binding cleanup, not a hard global standard. Prefer bindings that work in common Linux terminals and have familiar semantics:

| Action | Preferred binding | Notes |
| --- | --- | --- |
| Search Everything | `Ctrl+P` | Existing global command palette/search overlay; keep across manager/editor. |
| Manager filter | `/` | Visible in manager shortcut row; local to manager browse. |
| Open/select | `Enter` | Keep. |
| Back/close transient mode | `Esc` / `Ctrl+[` | Keep. |
| Save | `Ctrl+S` | Existing; keep. |
| Find | `Ctrl+F` | Existing; keep. |
| Find + replace | `Ctrl+R` | Primary terminal-deliverable replace shortcut; `/replace` command remains discoverable and Kitty-style `Ctrl+H` sequences stay compatibility aliases if delivered. |
| Copy | `Ctrl+Shift+C` | Terminal often reserves it for copy. OpenTUI may or may not deliver it; plan includes detection/fallback evidence. |
| Cut | `Ctrl+Shift+X` | Best-effort terminal event; fallback status if terminal swallows. |
| Paste | `Ctrl+Shift+V` | Common terminal paste; use bracketed paste/input event if OpenTUI exposes it. |
| Undo | `Ctrl+Z` | Familiar, but can suspend in shells; in raw TUI it should be handled if delivered. |
| Redo | `Ctrl+Y` and/or `Ctrl+Shift+Z` | Prefer whichever OpenTUI reliably receives; document visible shortcut. |
| Toggle wrap | `Alt+Z` | Existing; keep if reliable. |
| Toggle preview | `Alt+P` | Existing; keep if reliable. |

If a preferred shortcut is not emitted by the real terminal/OpenTUI runtime, do **not** fake success. Keep the function accessible through Search Everything command or an alternate visible binding, record the terminal limitation, and update the shortcut label to the binding that actually works.

---

## 3. Implementation tasks

### Task 1: Manager footer labels currently open note and always shows filter shortcut

**Files:**

- Modify: `src/tui/render-manager.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`

**RED tests:**

1. Add a manager view-model test where a note is open in editor state and manager is visible. Assert footer/bottom path exposes a label like `Currently open: <title or filename>` instead of only a raw path.
2. Add a manager shortcut test for `manager.browse` asserting `/ Filter` is visible in the manager shortcut hints.
3. Add a routing/render test that the rendered manager footer includes the current-open label and filter hint.

**Implementation:**

- Extend `ManagerTopbarViewModel` or manager footer model so bottom path is content-labeled, not just a path string.
- Update `managerShortcutHints()` for normal browse mode to include `/ Filter` at a visible priority.
- Keep labels concise for `80x24` and zoomed terminals.

**Verification:**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

**Commit:**

```bash
git add src/tui/render-manager.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "fix: label manager footer and filter shortcut"
```

---

### Task 2: Manager row text clamps/truncates without bleeding into adjacent panes

**Files:**

- Modify: `src/tui/render-manager.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Potentially modify: `src/tui/render-chrome.ts` if shared truncation helper belongs there.

**RED tests:**

1. Add a manager view-model or renderer test with a very long filename/title/description at narrow width (`80`) and assert generated display labels are truncated/clamped.
2. Add a renderer test that row renderables have bounded width/flex constraints and do not create unconstrained text nodes that expand into layout 2.
3. Include folder and note rows.

**Implementation:**

- Add a display-cell-aware truncate helper if needed; avoid naive string slicing that breaks wide glyphs if current helpers already exist.
- Ensure layout1 row children use explicit width/flex shrink constraints and clipped/truncated content.
- Preserve useful visible text: filename/name first, then title/description only as space allows.

**Verification:**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run qa:visual:tui -- --no-screenshots --out-dir=/tmp/bluenote-4j-manager-truncate-dryrun
```

**Commit:**

```bash
git add src/tui/render-manager.ts src/tui/render-chrome.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "fix: clamp manager row text"
```

---

### Task 3: Manager preview removes folder/note metadata and shows content-first previews

**Files:**

- Modify: `src/tui/adapters/note-manager-adapter.ts`
- Modify: `src/tui/render-manager.ts`
- Test: `tests/unit/tui/note-manager-adapter.test.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`

**RED tests:**

1. Folder preview test: focused folder preview sections/rows should show only immediate child folder/file items, not folder metadata counts/path rows as primary content.
2. Note preview test: focused note preview should show title and note body/content lines, not metadata rows such as `Path`, `Description`, key, or timestamps.
3. Visual model test should assert section labels are content-oriented (`Items`, `Preview`, etc.) and no `Path`/`Description` metadata labels remain.

**Implementation:**

- Keep folder preview rows from `folderPreview()` but render them as item rows only.
- For note preview, use title and body lines; avoid description/path metadata unless it is a subtle subtitle required by layout and not a metadata row.
- Maintain empty/hidden preview states.

**Verification:**

```bash
bun test tests/unit/tui/note-manager-adapter.test.ts tests/unit/tui/render-view-models.test.ts
```

**Commit:**

```bash
git add src/tui/adapters/note-manager-adapter.ts src/tui/render-manager.ts tests/unit/tui/note-manager-adapter.test.ts tests/unit/tui/render-view-models.test.ts && git commit -m "fix: simplify manager previews"
```

---

### Task 4: Manager filter searches only visible item names within the current folder

**Files:**

- Modify: `src/tui/adapters/note-manager-adapter.ts`
- Test: `tests/unit/tui/note-manager-adapter.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**RED tests:**

1. In `note-manager-adapter.test.ts`, create current-folder rows where query matches only parent path, description, title, or key but not filename/name; assert those rows are not returned.
2. Query matching visible filename/folder name should still return rows.
3. Query should not match nested descendants outside the current folder.
4. Integration test should verify manager filter opens the filtered visible row by name.

**Implementation:**

- Change `filterRows()` to match only `row.filename` for both folders and files within `immediateRowsForFolder()` output.
- Keep contains semantics; no fuzzy subsequence matching.
- Update any old tests that intentionally expected title/description/path manager-filter matching.

**Verification:**

```bash
bun test tests/unit/tui/note-manager-adapter.test.ts tests/integration/tui-workflow.test.ts
```

**Commit:**

```bash
git add src/tui/adapters/note-manager-adapter.ts tests/unit/tui/note-manager-adapter.test.ts tests/integration/tui-workflow.test.ts && git commit -m "fix: scope manager filter to item names"
```

---

### Task 5: Editor chrome/body separation

**Files:**

- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/theme.ts` only if a semantic chrome separator/background token is missing.
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`

**RED tests:**

1. Editor renderer includes a top/body separator renderable or applies a distinct semantic chrome background to topbar/bottombar.
2. Body remains terminal-default/dark writing surface and does not inherit noisy chrome background.
3. At `80x24`, topbar/body/bottombar separation remains visible without stealing too much editing space.

**Implementation:**

- Prefer a separator line using muted border color if background changes are risky in terminal themes.
- Keep topbar/bottombar calm; do not introduce bright full-width blocks unless screenshot evidence says it reads better.
- Ensure separator is not persisted into text input and does not affect cursor/focus ownership.

**Verification:**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run qa:visual:tui -- --no-screenshots --out-dir=/tmp/bluenote-4j-editor-chrome-dryrun
```

**Commit:**

```bash
git add src/tui/render-editor.ts src/tui/theme.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "fix: separate editor chrome from body"
```

---

### Task 6: Clipboard actions for copy/cut/paste from editor selection

**Files:**

- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/app.ts` if runtime clipboard dependencies are needed.
- Modify: `src/tui/adapters/editor-buffer-adapter.ts` only if adapter needs selection/history integration changes.
- Test: `tests/unit/tui/editor-buffer-adapter.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**RED tests:**

1. Controller exposes copy/cut/paste methods that operate on current editor selection.
2. Copy leaves body unchanged and writes selected text to injected clipboard.
3. Cut writes selected text, removes it, marks editor dirty, schedules autosave like normal typing, and preserves cursor position.
4. Paste reads injected clipboard or paste event text, replaces selected range, marks dirty, and schedules autosave.
5. Routing maps delivered terminal events for copy/cut/paste to those controller methods.
6. If OpenTUI cannot reliably deliver `Ctrl+Shift+C/X/V`, test the alternate event names actually observed in the runtime and keep visible shortcut text honest.

**Implementation:**

- Reuse existing `copySelection`, `cutSelection`, and `pasteText` adapter functions where possible.
- Add an injectable clipboard model in controller dependencies for tests and runtime.
- Do not use shell clipboard commands directly in core/controller; keep runtime adapters replaceable.
- Ensure terminal paste text path still works if `Ctrl+Shift+V` is swallowed and terminal emits bracketed paste/plain text.

**Verification:**

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts
```

**Live verification note:** This task must include a live terminal attempt of `Ctrl+Shift+C`, `Ctrl+Shift+X`, and `Ctrl+Shift+V`; if GNOME Terminal consumes any binding, record the exact observed event limitation and validate the supported fallback.

**Commit:**

```bash
git add src/tui/workspace-controller.ts src/tui/render-editor.ts src/tui/app.ts src/tui/adapters/editor-buffer-adapter.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: support editor clipboard shortcuts"
```

---

### Task 7: Search Everything preview model supports highlighted text chunks

**Files:**

- Modify: `src/tui/adapters/search-everything-adapter.ts`
- Modify: `src/tui/render-search-everything.ts`
- Test: `tests/unit/tui/search-everything-adapter.test.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`

**RED tests:**

1. Preview title/subtitle/lines can carry highlight ranges or chunks, not only raw strings.
2. Folder preview title is the folder full path and marks matching query ranges.
3. File/note preview title is `<title> · <filename>` and marks query matches in title and filename.
4. Rendering converts highlighted ranges to background-highlight chunks while preserving plain text fallback for tests/pane capture.

**Implementation:**

- Add a small preview text type, e.g. `{ text: string; highlights?: Array<{ start; end }> }`, while preserving compatibility `lines: string[]` if needed.
- Centralize case-insensitive contains range collection.
- Use semantic highlight background from Quiet Blue Dashboard tokens.

**Verification:**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts
```

**Commit:**

```bash
git add src/tui/adapters/search-everything-adapter.ts src/tui/render-search-everything.ts tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: highlight search preview matches"
```

---

### Task 8: Search Everything folder preview shows folder contents like manager preview

**Files:**

- Modify: `src/tui/adapters/search-everything-adapter.ts`
- Potentially share helper with: `src/tui/adapters/note-manager-adapter.ts`
- Modify: `src/tui/render-search-everything.ts`
- Test: `tests/unit/tui/search-everything-adapter.test.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`

**RED tests:**

1. Folder result preview title equals full folder path (`notes/projects/client`), not just folder label.
2. Preview content includes immediate child folders/files, formatted like manager preview.
3. Folder metadata count/path rows are absent.
4. Matching path segment is highlighted in title.

**Implementation:**

- Pass `noteSummaries` context through preview builder if needed so folder previews can list immediate children.
- Avoid duplicating manager folder tree logic; extract pure helpers if necessary.
- Keep preview compact at short heights.

**Verification:**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts
```

**Commit:**

```bash
git add src/tui/adapters/search-everything-adapter.ts src/tui/adapters/note-manager-adapter.ts src/tui/render-search-everything.ts tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: show folder contents in search preview"
```

---

### Task 9: Search Everything content matches become one result per match occurrence

**Files:**

- Modify: `src/tui/adapters/search-everything-adapter.ts`
- Test: `tests/unit/tui/search-everything-adapter.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**RED tests:**

1. If `searchNotes(query)` returns multiple content matches for the same note, `buildSearchEverythingResults()` returns multiple `content` rows with stable unique ids.
2. Multiple occurrences from the same line/label still have stable ids, e.g. include match index/line/offset if available.
3. Selecting each content result opens the same note but preserves enough match context for preview and future cursor positioning if available.
4. Result ordering keeps exact/title/file matches sensible but includes all content hits similar to IntelliJ.

**Implementation:**

- Make `content:${key}:${label}` ids collision-safe by adding index or match metadata.
- Preserve `matchLabel` and excerpt for each occurrence.
- Do not collapse content results by note key.

**Verification:**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts tests/integration/tui-workflow.test.ts
```

**Commit:**

```bash
git add src/tui/adapters/search-everything-adapter.ts tests/unit/tui/search-everything-adapter.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: list each content search occurrence"
```

---

### Task 10: Search Everything file/content preview centers and highlights matched content

**Files:**

- Modify: `src/tui/adapters/search-everything-adapter.ts`
- Modify: `src/tui/render-search-everything.ts`
- Test: `tests/unit/tui/search-everything-adapter.test.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`

**RED tests:**

1. For filename/title match, preview title `<title> · <filename>` highlights matching title/filename text.
2. For content match, preview body centers around the matched excerpt and highlights the matching text in context.
3. Preview should not show unrelated top-of-file content if a deep match exists.
4. Empty/no-body fallback remains calm and does not show metadata rows.

**Implementation:**

- Use available `SearchNoteMatch.match.excerpt` first; if full body is available via note summaries, derive centered context around match.
- Highlight only actual query occurrences, case-insensitive.
- Keep plain text fallback for pane capture.

**Verification:**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts
```

**Commit:**

```bash
git add src/tui/adapters/search-everything-adapter.ts src/tui/render-search-everything.ts tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: center search previews on matches"
```

---

### Task 11: Find/replace dialog opens via shortcut and highlights active matches in editor

**Files:**

- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/adapters/editor-buffer-adapter.ts` if match selection metadata needs expansion.
- Test: `tests/unit/tui/editor-buffer-adapter.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**RED tests:**

1. `Ctrl+R` or chosen supported binding opens `editor.replace` mode from editor body.
2. Replace prompt shows find query and replacement input/action hints.
3. After a find query is entered, active match range is represented as a selection/highlight in the rendered editor body.
4. `Enter` in find mode advances or confirms; replace mode can replace current and replace all according to existing adapter capabilities.
5. Closing the prompt returns to editor body without losing selection/cursor state.

**Implementation:**

- Wire existing `editor.replace` state and adapter replacement functions into controller/render routing.
- Use background highlight chunks/cells for active find match; do not insert visible marker glyphs into note body.
- Preserve saved/dirty semantics: replace modifies body and schedules autosave like normal edits.

**Verification:**

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts
```

**Commit:**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts src/tui/render-editor.ts src/tui/adapters/editor-buffer-adapter.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: add editor find replace flow"
```

---

### Task 12: Editor undo/redo with bounded recent history

**Files:**

- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/adapters/editor-buffer-adapter.ts` if pure helpers are needed.
- Modify: `src/tui/render-editor.ts`
- Test: `tests/unit/tui/editor-buffer-adapter.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**RED tests:**

1. Typing/edit operations push previous editor snapshots into bounded undo history.
2. Undo restores body, cursor, selection, dirty state, and find metadata consistently.
3. Redo reapplies undone snapshot.
4. New edit after undo clears redo stack.
5. History is bounded to a small count, e.g. 50 states or fewer.
6. Undo/redo status is visible if no history is available and does not crash.

**Implementation:**

- Store history in `EditorBufferState` or a controller-side map keyed by note key; prefer state if snapshots are serializable and testable.
- Avoid recording duplicate states for no-op edits.
- Ensure autosave scheduling follows the restored body and saved-body relationship.
- Shortcut labels must show the actually supported bindings.

**Verification:**

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

**Commit:**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts src/tui/adapters/editor-buffer-adapter.ts src/tui/render-editor.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: add bounded editor undo redo"
```

---

### Task 13: Shortcut consistency pass across manager/editor/search

**Files:**

- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/render-search-everything.ts`
- Modify: `src/tui/render-chrome.ts`
- Modify: `src/tui/adapters/search-everything-adapter.ts` for command shortcut labels.
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Test: `tests/unit/tui/search-everything-adapter.test.ts`
- Potential docs: `README.md`, `docs/product/overview.md`, relevant Phase 4 docs if shortcuts are user-facing.

**RED tests:**

1. Manager and editor both show persistent global `Ctrl+P Search` and `Esc Back/Manager` semantics where appropriate.
2. Manager shows `/ Filter`.
3. Editor shows `Ctrl+F Find`, `Ctrl+R Replace`, `Ctrl+S Save`, undo/redo, and clipboard shortcuts only if supported or with honest alternate labels.
4. Search Everything command shortcut labels agree with visible editor/manager shortcuts.
5. No shortcut row overflows badly at `80x24`; low-priority hints collapse via existing overflow count.

**Implementation:**

- Centralize repeated shortcut labels if duplication increases.
- Keep labels short and consistent.
- Update docs/tests for any changed user-facing shortcut.

**Verification:**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/search-everything-adapter.test.ts tests/integration/docs-phase3-tui.test.ts
```

**Commit:**

```bash
git add src/tui/render-manager.ts src/tui/render-editor.ts src/tui/render-search-everything.ts src/tui/render-chrome.ts src/tui/adapters/search-everything-adapter.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/search-everything-adapter.test.ts tests/integration/docs-phase3-tui.test.ts README.md docs && git commit -m "docs: align tui shortcut contracts"
```

---

### Task 14: Extend visual/manual QA harness for Phase 4J scenarios

**Files:**

- Modify: `scripts/visual-tui-qa.ts`
- Test: `tests/unit/tui/visual-tui-qa-script.test.ts`
- Docs/results: create/update `docs/plans/2026-05-29-phase-4j-tui-manager-search-editor-polish-qa-results.md`

**RED tests:**

1. Harness case list includes manager long-row truncation, manager folder preview, manager note preview, manager filter, Search Everything folder preview, Search Everything file/title preview, Search Everything multi-content results, editor separator, editor find/replace highlight, clipboard attempt, and undo/redo flow.
2. Harness report includes per-requirement evidence rows and screenshot paths.
3. Harness preserves raw/cropped screenshots if desktop portal capture is obstructed.
4. Harness post-run process check remains scoped to QA root.

**Implementation:**

- Seed a QA root through public CLI/core paths with:
  - long filenames/titles/descriptions,
  - nested folders,
  - repeated content matches,
  - body text suitable for find/replace/undo/redo and clipboard.
- Add scripted navigation to each representative state.
- Keep `--no-screenshots` dry run working.
- Add artifact naming that maps directly to requirements, e.g. `manager-filter-name-only-100x30`.

**Verification:**

```bash
bun test tests/unit/tui/visual-tui-qa-script.test.ts
bun run qa:visual:tui -- --no-screenshots --out-dir=/tmp/bluenote-4j-visual-dryrun
bun run qa:visual:tui -- --out-dir=/tmp/bluenote-4j-visual-final
```

**Commit:**

```bash
git add scripts/visual-tui-qa.ts tests/unit/tui/visual-tui-qa-script.test.ts docs/plans/2026-05-29-phase-4j-tui-manager-search-editor-polish-qa-results.md && git commit -m "test: extend visual qa for phase 4j"
```

---

### Task 14A: Defect fix — replace shortcut must be terminal-deliverable and editor topbar starts flush

**Discovered during Task 15 live QA:** `Ctrl+H` was advertised as `[Ctrl+H] Replace`, but focused GNOME Terminal + computer-use/ydotool delivery did not open replace mode. In common terminals `Ctrl+H` collides with Backspace/^H behavior, so the visible shortcut was not an honest working binding. User also requested a minor visual cleanup: remove the leading space at the start of the editor topbar.

**Files:**

- Update: `src/tui/render-chrome.ts`
- Update: `src/tui/render-editor.ts`
- Update: relevant TUI routing/render/docs tests
- Update docs that mention the editor replace shortcut

**RED tests:**

1. A terminal-deliverable `Ctrl+R` sequence opens editor replace mode from the editor body.
2. Editor shortcut rows advertise `[Ctrl+R] Replace`, not `[Ctrl+H] Replace`.
3. Editor topbar text starts flush with the note title and does not begin with a blank space.
4. Docs/help contracts describe `Ctrl+R` replace while noting `/replace` command access remains available.

**Implementation:**

- Keep existing Kitty-style `Ctrl+H` sequences as backwards-compatible aliases if they are delivered.
- Add `Ctrl+R` (`\u0012`) as the primary replace shortcut.
- Remove the editor topbar's leading blank padding so the first visible character is the note title.
- Update shortcut labels and docs to the primary working binding.

**Verification:**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts
bun run typecheck
```

**Commit:**

```bash
git add src/tui/render-chrome.ts src/tui/render-editor.ts tests docs && git commit -m "fix: use terminal-safe replace shortcut"
```

---

### Task 15: Live computer-use manual verification and screenshot acceptance loop

**Files:**

- Create/update: `docs/plans/2026-05-29-phase-4j-tui-manager-search-editor-polish-qa-results.md`
- No production code unless defects are found; if defects are found, stop, add a fix task to this plan, implement with TDD, then rerun this task.

**Manual launch discipline:**

- Terminal app: GNOME Terminal unless user specifies another terminal.
- Working directory: `/home/hainn/blue/code/bluenote-term`
- Launch command from repo:

```bash
BLUENOTE_ROOT=<disposable-root> bun run ./bin/bn.ts tui
```

- Seed notes through BlueNote public commands/services, not by raw invalid Markdown-only roots.

**Manual evidence matrix:**

Terminal sizes/scales:

- `80x24`, zoom `1.0`
- `100x30`, zoom `1.0`
- `120x40`, zoom `1.0`
- `100x30`, zoom `1.5`

Required live workflows:

1. Manager current-open footer label visible after opening a note and returning to manager.
2. Manager long text does not bleed into preview pane at every size.
3. Manager folder preview shows only item list, no folder metadata rows.
4. Manager note preview shows title/body content, no metadata rows.
5. Manager filter shortcut visible.
6. Manager filter matches filename/folder name only; title/path/description-only matches are excluded.
7. Editor topbar/body/bottombar separation visible and calm.
8. Mouse select + copy/cut/paste attempt with `Ctrl+Shift+C/X/V` or documented fallback; verify actual disk body after save.
9. Search Everything folder preview title is full path, path match highlighted, content resembles manager folder preview.
10. Search Everything file/title preview title is title + filename and highlights title/filename match.
11. Search Everything content preview is centered on match and highlights it.
12. Repeated content matches appear as multiple results.
13. Find/replace shortcut opens dialog; found result is highlighted/selected; replace changes disk after save.
14. Undo/redo shortcuts work for recent edits; disk after save reflects final body.
15. Shortcut labels in manager/editor/search are consistent with actual working bindings.
16. Quit/back/navigation still work after edits, dialogs, search, failed/no-op clipboard, undo/redo, and replace.
17. Process cleanup: after quit, no scoped BlueNote TUI process remains.

**Evidence format per workflow:**

- requirement number(s),
- terminal size/zoom,
- exact key/mouse sequence,
- expected result,
- actual result,
- screenshot path,
- pane text path if relevant,
- disk/state readback path/snippet for persistence tasks,
- process readback for quit/cleanup tasks,
- UX rating `1/5`–`5/5`,
- severity if failed: Blocker / High / Medium / Low.

**Acceptance bar:**

- Functional blockers: none.
- Save/copy/cut/paste/replace/undo/redo disk truth matches UI claims.
- All core visual cases have screenshot evidence and user-perspective rating at least `4/5`.
- No metadata clutter remains in the manager/search previews targeted by this subplan.
- No text bleed between manager panes at tested sizes.
- No stale scoped TUI process after quit.

**Verification commands:**

```bash
bun run qa:visual:tui -- --no-screenshots --out-dir=/tmp/bluenote-4j-visual-dryrun
rm -rf /tmp/bluenote-4j-visual-final
bun run qa:visual:tui -- --out-dir=/tmp/bluenote-4j-visual-final
```

Plus live computer-use commands/screenshots through the Hermes `computer-use-linux` tools.

**Commit:**

```bash
git add docs/plans/2026-05-29-phase-4j-tui-manager-search-editor-polish-qa-results.md && git commit -m "docs: record phase 4j visual qa results"
```

---

### Task 16: Final full verification and finish-branch handoff

**Files:**

- Modify docs only if final verification reveals outdated docs.

**Verification:**

Run the project-required suite plus Phase 4J visual/manual harness:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
env -u BLUENOTE_ROOT bun run smoke:cli
bun run qa:visual:tui -- --no-screenshots --out-dir=/tmp/bluenote-4j-visual-dryrun
rm -rf /tmp/bluenote-4j-visual-final
bun run qa:visual:tui -- --out-dir=/tmp/bluenote-4j-visual-final
git status --short --branch
```

Also perform a final live computer-use spot check for:

- manager long row + preview screenshot,
- editor separator + find/replace highlight screenshot,
- Search Everything content match screenshot,
- clipboard/undo/redo save readback,
- quit process cleanup.

**Acceptance:**

- All automated checks pass.
- Manual QA results document says every requirement passed or explicitly documents any terminal-level shortcut limitation with an approved fallback.
- Working tree is clean.
- Final response must include branch, latest commit, verification commands, visual artifact paths, and any known follow-up notes.

**Commit if docs changed:**

```bash
git add docs README.md tests src scripts && git commit -m "test: verify phase 4j tui polish"
```

---

## 4. Subagent-driven execution plan after approval

Use `delegate_task` as the Hermes substitute for `sessions_spawn`.

Suggested execution groups:

- Group A: Tasks 1–4 manager footer/layout/preview/filter.
- Group B: Tasks 5–6 editor chrome and clipboard.
- Group C: Tasks 7–10 Search Everything previews/results/highlighting.
- Group D: Tasks 11–13 find/replace, undo/redo, shortcut consistency.
- Group E: Tasks 14–15 visual harness + live computer-use QA loop.
- Group F: Task 16 final verification and finish-branch handoff.

For each implementation task:

1. Dispatch implementer with exact task text, file list, constraints, and verification commands.
2. Parent re-runs targeted tests after child edits.
3. Dispatch spec-review subagent.
4. Dispatch code-quality review subagent.
5. Fix review findings and rerun reviewers until both pass.
6. Commit after each green/reviewed task.

For visual/manual QA tasks:

- Do not accept pane text alone for visual claims.
- Capture PNG screenshots/contact sheets and inspect as a user.
- If any core screenshot is below `4/5`, update the QA results, add a fix task to this plan, and loop fix → tests → screenshot QA → rating.
