# Phase 4C — Manager Performance, Responsive Layout, and Style Implementation Plan

> **For implementer:** Use TDD throughout. Write failing tests first. Watch them fail. Then implement. Keep commits small and task-scoped.

**Goal:** Refine the Manager screen so navigation stays fast, chrome is minimal, preview work is avoidable, layout responds to terminal size, and the visual system stays restrained with purposeful blue-focused styling.

**Architecture:** Build on the existing Phase 3/4 Manager browser model rather than replacing it. Add explicit Manager preview visibility/toggle state and lightweight preview hydration/cache behavior in the controller/adapters, then render a responsive two-pane/one-pane Manager view from structured view models. Keep storage unchanged: notes remain plain Markdown and metadata stays in `.data/notes/` sidecars.

**Tech Stack:** Bun, TypeScript, OpenTUI (`BoxRenderable`, `TextRenderable`, `InputRenderable`), tmux-backed interactive smoke, existing BlueNote core services and TUI controller/state/adapters.

**Scope boundary:** This plan is only Phase 4C. Do not implement Phase 4D Search Everything redesign/readability/preview work here. Do not reopen Phase 4B editor input work except to preserve editor dirty guards while Manager navigation/create/delete interact with it. Ignore older Phase 3 plans with similar Manager wording. Preserve the Phase 4A `.data`/plain-note/no-frontmatter storage contract.

---

## Approved source of truth

- Umbrella design: `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`
- Current phase doc: `docs/phases/phase-4-search-editing-and-recovery.md`
- Prior completed subplan: `docs/plans/2026-05-28-phase-4b-editor-input-cursor-responsive-chrome-implementation.md`

Phase 4C outcomes from the approved umbrella design:

- Remove unnecessary `notes/inbox` container framing.
- Show Layout 1 title as the current path, for example `notes/inbox`.
- Show Layout 2 title as the focused file/folder name.
- Replace heavy topbar with a simple `[BlueNote                         latest_rebuild_time | indexing...]` layout.
- Add Search Everything shortcut and preview-toggle shortcut to the bottom bar.
- Hide preview automatically on narrow terminal widths; let users toggle preview manually.
- Optimize navigation/filter latency with lightweight summaries, preview/session cache, and debounced expensive preview/index work.
- Restyle with default terminal background, purposeful color roles, modern fills/separators, and less box-heavy chrome.
- Remove unnecessary Layout 2 preview padding.

## Current implementation baseline

Relevant files:

- `src/tui/state.ts` — `ManagerState` and transient Manager modes.
- `src/tui/adapters/note-manager-adapter.ts` — folder tree, Manager rows, preview model.
- `src/tui/workspace-controller.ts` — Manager refresh/navigation/filter/create/delete and preview hydration via `showNote`.
- `src/tui/render-manager.ts` — Manager view model, rendering, and key routing.
- `src/tui/theme.ts` — shared restrained palette tokens.
- `src/tui/app.ts` — global key routing and rerender/focus lifecycle.
- `scripts/smoke-opentui.ts` — import-level TUI smoke metadata.
- `scripts/smoke-opentui-interactive.ts` — tmux-backed real TTY smoke.
- `tests/unit/tui/note-manager-adapter.test.ts` — Manager browser/filter/preview model tests.
- `tests/unit/tui/workspace-controller.test.ts` — Manager controller flows and dirty guards.
- `tests/unit/tui/render-view-models.test.ts` — Manager render view model and renderer shape tests.
- `tests/unit/tui/render-routing.test.ts` — Manager key routing and focused input tests.
- `tests/integration/tui-workflow.test.ts` — core-service-backed TUI workflows.
- `tests/integration/docs-phase3-tui.test.ts` — README/phase/smoke contract docs tests.

Known current behavior to change:

- Manager root `BoxRenderable` still has a border and title.
- Panel titles still say `Layout 1: current folder` and `Layout 2: preview`.
- Shortcut list lacks an explicit preview-toggle hint.
- Preview hydration can call `showNote` for focused note previews when body is missing.
- No explicit preview-visible state or preview-toggle command exists.
- Interactive smoke still keys on old `Layout 1: current folder`/`Layout 2: preview` markers.

## Non-goals

- Do not change CLI command semantics or storage layout.
- Do not add a daemon or background indexing service.
- Do not make Search Everything visual/readability changes beyond preserving the existing Manager shortcut to open it.
- Do not rewrite note files or add frontmatter.
- Do not introduce extra decorative colors, banners, logos, or noisy chrome.
- Do not remove Manager create/delete functionality delivered in Phase 4B.

## Task 1: Add Manager preview visibility state and controller actions

**Files:**

- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing state/controller tests**

Add tests proving:

- `createInitialTuiState().manager.previewVisible` defaults to `true`.
- `WorkspaceController.toggleManagerPreview()` flips user preference without changing the focused row, current folder, filter query, or selected/open editor state.
- `WorkspaceController.setManagerPreviewVisible(false)` can be called by responsive runtime code and does not dirty/open/close notes.
- Manager route maps `p` to preview toggle while still mapping `s` or `Ctrl+P` to Search Everything.

Suggested assertions:

```ts
const before = controller.getState()
controller.toggleManagerPreview()
const after = controller.getState()
assert.equal(after.manager.previewVisible, false)
assert.equal(after.manager.focusedIndex, before.manager.focusedIndex)
assert.equal(after.manager.currentFolderPath, before.manager.currentFolderPath)
assert.equal(after.editor, before.editor)
```

Update the `createController()` test double in `tests/unit/tui/render-routing.test.ts` to include the new controller methods.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: FAIL because `previewVisible`, `toggleManagerPreview`, and/or `setManagerPreviewVisible` do not exist.

**Step 3: Implement minimal state/controller support**

- Add `previewVisible?: boolean` to `ManagerState` and default it to `true` in initial state.
- Add `toggleManagerPreview()` and `setManagerPreviewVisible(visible: boolean)` to `WorkspaceController`.
- Preserve `previewVisible` through Manager state transitions, especially `applyManagerBrowserModel()`, `refreshManager()`, `focusManagerItem()`, `moveManagerSelection()`, `openManagerFilter()`, `updateManagerFilter()`, create/delete cancellation, and folder navigation.
- Add `p` routing in `routeManagerKey()`.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts src/tui/render-manager.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts
git commit -m "feat: add manager preview toggle state"
```

## Task 2: Avoid preview hydration when preview is hidden and cache hydrated previews per session

**Files:**

- Modify: `src/tui/adapters/note-manager-adapter.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `tests/unit/tui/note-manager-adapter.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`

**Step 1: Write failing performance/caching tests**

Add tests proving:

- When Manager preview is hidden, `getManagerBrowserModel()` returns an empty/hidden preview model and does not call `showNote` to hydrate the focused note body.
- Repeated `getManagerBrowserModel()` calls for the same focused note preview hydrate at most once per note body/version during a session.
- Moving between folder rows never calls `showNote` for preview.
- Refreshing Manager invalidates stale preview cache so changed summary/body can be shown after rebuild/list refresh.

Use call counters around `showNote`:

```ts
let showCalls = 0
const controller = createWorkspaceController({
  listNotes: () => summaries,
  showNote: (selector) => {
    showCalls += 1
    return { ...summary, body: "hydrated" }
  },
  searchNotes: () => [],
})
controller.refreshManager()
controller.setManagerPreviewVisible(false)
controller.getManagerBrowserModel()
assert.equal(showCalls, 0)
```

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/note-manager-adapter.test.ts tests/unit/tui/workspace-controller.test.ts
```

Expected: FAIL because preview model/hydration has no hidden mode/cache.

**Step 3: Implement cache-aware preview building**

- Extend `ManagerPreviewModel` with a hidden state, e.g. `{ type: "hidden"; path: string | null; reason: "manual" | "responsive" }`, or reuse `empty` only if view models can still distinguish hidden vs no selection. Prefer explicit `hidden` for clarity.
- Add adapter options to `buildManagerBrowserModel(noteSummaries, state, options?)`, including `previewVisible?: boolean` and optional preview body lookup callback/cache input.
- Keep row/filter/folder computation independent from preview computation.
- In `WorkspaceController`, maintain a small session `Map<string, string>` keyed by note key or relative path for hydrated preview bodies.
- Do not call `deps.showNote` when preview is hidden or when the focused item is a folder.
- Clear preview cache in `refreshManager()` after list/rebuild/create/delete changes.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/note-manager-adapter.test.ts tests/unit/tui/workspace-controller.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/adapters/note-manager-adapter.ts src/tui/workspace-controller.ts tests/unit/tui/note-manager-adapter.test.ts tests/unit/tui/workspace-controller.test.ts
git commit -m "perf: cache manager previews"
```

## Task 3: Redesign Manager view model chrome around current path and focused item

**Files:**

- Modify: `src/tui/render-manager.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write failing view-model tests**

Add/update tests proving:

- `vm.title` no longer advertises a decorative app/screen title.
- Topbar is structured as a simple brand/status surface: `brand: "BlueNote"`, `rebuildLabel`, `indexingLabel`, and compact status text.
- Layout 1 panel title equals current path, e.g. `notes/` or `notes/inbox`.
- Layout 2 panel title equals focused file/folder name, e.g. `projects`, `root-note.md`, or `Preview hidden` when hidden.
- There is no artificial `Layout 1: current folder`, `Layout 2: preview`, or redundant `notes/inbox` container framing in the view-model strings.
- Bottom shortcuts include Search Everything and preview toggle, with `p preview` reflecting visible/hidden state.

Suggested assertions:

```ts
assert.equal(vm.panels.layout1.title, "notes/projects")
assert.equal(vm.panels.layout2.title, "api-roadmap.md")
assert.match(vm.shortcuts.join(" "), /Ctrl\+P search|s search/u)
assert.match(vm.shortcuts.join(" "), /p preview/u)
assert.doesNotMatch(JSON.stringify(vm), /Layout 1: current folder|Layout 2: preview/u)
```

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts
```

Expected: FAIL against old chrome strings.

**Step 3: Implement structured chrome view model**

- Keep the existing exported `buildManagerViewModel()` name.
- Add helper functions for focused item label and rebuild/index status labels.
- Derive Layout 1 title from current folder path with `notes/` root label.
- Derive Layout 2 title from the focused item filename/folder name, or hidden/empty preview state.
- Keep Manager screen minimal: useful context only, no large app title/banner.
- Keep row color intents purposeful: primary/focused, muted metadata, active open note, danger only for delete.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/render-view-models.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/render-manager.ts tests/unit/tui/render-view-models.test.ts
git commit -m "feat: refine manager chrome view model"
```

## Task 4: Render responsive Manager layout and preview hidden state

**Files:**

- Modify: `src/tui/render-manager.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing renderer tests**

Add renderer tests proving:

- Wide width renders both `bluenote-manager-layout-1` and `bluenote-manager-layout-2`.
- Narrow width hides/removes/collapses preview layout and keeps browser rows usable.
- Hidden preview renders a compact `Preview hidden` status/hint rather than building note content rows.
- Root screen no longer uses a heavy titled border around the whole Manager.
- Layout 2 preview content has no unnecessary blank/padding rows before title/path/body.

Use `createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })` and `findById()` helpers already present in TUI tests.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: FAIL because preview is always rendered and old root/panel chrome remains.

**Step 3: Implement responsive rendering**

- Add optional render/build options for width, e.g. `buildManagerViewModel(state, browserModel, { width })` or derive from renderer/root where practical.
- Define a narrow threshold, e.g. `< 72 columns`, where preview auto-hides unless explicitly forced visible later.
- Render browser panel as full width when preview hidden; otherwise use a stable two-column layout.
- Keep default terminal background rather than painting large decorative surfaces.
- Use subtle separators/header lines instead of heavy nested boxes where feasible.
- Render hidden preview state as a one-line bottom/status hint, not a large empty panel.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/render-manager.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
git commit -m "feat: make manager layout responsive"
```

## Task 5: Wire runtime resize and preview-toggle behavior through real TTY smoke

**Files:**

- Modify: `src/tui/app.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing routing/smoke assertions**

Add/update tests and smoke expectations proving:

- Pressing `p` in Manager toggles visible preview off/on.
- At narrow tmux width, Manager hides preview automatically and keeps current folder rows visible.
- Returning to wide width shows preview again unless the user manually toggled it off.
- `Ctrl+P` still opens Search Everything from Manager.
- `s` still opens Search Everything if retained as a Manager shortcut.

Interactive smoke should stop looking for old `Layout 1: current folder` markers and instead assert current path/focused item/status markers from the new chrome.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-routing.test.ts
bun run smoke:opentui:interactive
```

Expected: FAIL until runtime/render/smoke are aligned.

**Step 3: Implement runtime behavior**

- Ensure Manager renderer receives the effective terminal width.
- When width is narrow, call or derive effective preview visibility without mutating the user’s manual preference unless the design explicitly calls for state mutation.
- Route `p` to manual preview toggle and invalidate/rerender.
- Ensure transient Manager modes still have exactly one focused input.
- Update smoke assertions for the new minimal Manager chrome and responsive preview behavior.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/render-routing.test.ts
bun run smoke:opentui:interactive
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/app.ts src/tui/render-manager.ts scripts/smoke-opentui-interactive.ts tests/unit/tui/render-routing.test.ts
git commit -m "feat: wire manager preview toggle smoke"
```

## Task 6: Preserve Manager create/delete and dirty-editor guards under the refined layout

**Files:**

- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`

**Step 1: Write failing guard/regression tests if gaps exist**

Add coverage proving under the new preview/layout state:

- Manager create still focuses a single title input and accepts shortcut-looking letters like `q` as text.
- Manager create blocks before creating/opening when editor is dirty; no stray note is created.
- Manager delete still refuses folders, requires confirmation, and keeps prompt recoverable on failure.
- Deleting the currently open note clears editor state and refreshes the Manager without stale preview cache entries.
- Preview hidden/toggled state does not bypass dirty-editor guards.

If existing tests already cover a bullet, add only the missing assertion rather than duplicating broad workflows.

**Step 2: Run tests — confirm failure only for missing behavior**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

Expected: FAIL for any newly discovered gaps, or PASS if Task 1–5 preserved behavior and only assertions were added for already-working state.

**Step 3: Fix at controller/render root cause**

- Preserve recoverable prompt state and visible status messages.
- Catch async create/delete failures inside controller methods.
- Clear preview cache when delete/create changes storage.
- Keep one focused Manager input per mode after rerender.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui:interactive
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/workspace-controller.ts src/tui/render-manager.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts scripts/smoke-opentui-interactive.ts
git commit -m "fix: preserve manager actions under responsive layout"
```

## Task 7: Update docs and smoke metadata for Phase 4C

**Files:**

- Modify: `README.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`
- Modify: `docs/phases/phase-4-search-editing-and-recovery.md`
- Modify: `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`
- Modify: `tests/integration/docs-phase3-tui.test.ts`
- Modify: `scripts/smoke-opentui.ts`

**Step 1: Write failing docs/smoke tests**

Add docs assertions proving:

- README says Phase 4C Manager performance/responsive layout/style is accepted/delivered once implementation is complete.
- Current phase docs say 4D is next after 4C.
- Docs mention preview auto-hide/manual toggle and minimal Manager chrome.
- Smoke metadata reports `phase-4c-manager-performance-responsive-layout-style` and next `phase-4d-search-everything-readability-responsive-preview`.
- No active docs still advertise Phase 4C as upcoming after implementation is complete.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts
bun run smoke:opentui
```

Expected: FAIL until docs/smoke metadata are updated.

**Step 3: Update docs and smoke metadata**

- Keep wording scoped to Manager Phase 4C.
- Do not broaden into Phase 4D Search Everything implementation promises.
- Keep verification command lists aligned with repo expectations.

**Step 4: Run tests — confirm pass**

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts
bun run smoke:opentui
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/phases/phase-3-tui-workspace.md docs/phases/phase-4-search-editing-and-recovery.md docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md tests/integration/docs-phase3-tui.test.ts scripts/smoke-opentui.ts
git commit -m "docs: document phase 4c manager refinement"
```

## Task 8: Final Phase 4C verification and reviews

**Files:**

- No planned source changes unless review finds blockers.

**Step 1: Run focused Manager/TUI suite**

```bash
bun test tests/unit/tui/note-manager-adapter.test.ts \
  tests/unit/tui/state.test.ts \
  tests/unit/tui/workspace-controller.test.ts \
  tests/unit/tui/render-routing.test.ts \
  tests/unit/tui/render-view-models.test.ts \
  tests/integration/tui-workflow.test.ts
```

Expected: PASS.

**Step 2: Run full repo gate**

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```

Expected: PASS and clean working tree.

**Step 3: Dispatch final reviews**

Use subagent-driven review:

- Final spec reviewer: verify Phase 4C acceptance against this exact plan and the umbrella design.
- Final quality reviewer: verify performance/cache behavior, preview hidden/toggle behavior, responsive Manager layout, no decorative color/chrome regression, dirty-guard preservation, and docs/smoke alignment.

**Step 4: Fix any blockers with tests first**

If reviewers find blockers:

1. Add or update a failing regression.
2. Implement the minimal fix.
3. Rerun focused tests and relevant smoke.
4. Re-dispatch the relevant reviewer.
5. Commit the fix.

**Step 5: Finish branch handoff**

Because the user requested keeping this branch as-is after Phase 4B, ask before merging/pushing. If they again choose to keep the branch, provide:

- branch name
- clean/dirty status
- latest commit
- verification commands passed
- known follow-ups, especially Phase 4D Search Everything work

## Required parent-session verification after every child task

After each implementer child returns, the parent session must:

1. Inspect `git status --short --branch` and relevant `git diff`.
2. Rerun that task’s target tests.
3. Rerun `bun run typecheck` when TypeScript changed.
4. Rerun `bun run smoke:opentui:interactive` when runtime key routing, responsive layout, or smoke scripts changed.
5. Dispatch spec and code-quality/doc-quality reviewers before committing.
6. Commit only after parent verification and reviews pass.

## Subagent dispatch note

Every implementer/reviewer prompt must name this exact plan file:

`docs/plans/2026-05-28-phase-4c-manager-performance-responsive-layout-style-implementation.md`

Warn children to ignore older Phase 3 Manager plans and the completed Phase 4B editor plan unless explicitly comparing preservation behavior.
