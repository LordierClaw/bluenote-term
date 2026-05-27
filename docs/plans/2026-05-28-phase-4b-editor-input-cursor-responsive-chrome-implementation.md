# Phase 4B — Editor Input, Cursor, and Responsive Chrome Implementation Plan

> **For implementer:** Use TDD throughout. Write failing tests first. Watch them fail for the intended reason. Then implement the smallest change. Commit after every green task.

**Goal:** Make the TUI editor a reliable daily editing surface with real input ownership, visible cursor state, arrow/paste/editing support, wrap toggle, overflow indicator, and responsive editor chrome.

**Architecture:** Phase 4B follows the approved Phase 4 umbrella design in `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md`. Start by proving OpenTUI `TextareaRenderable` in a real TTY/tmux smoke path before depending on it. If the textarea path cannot satisfy typing, cursor, arrows, newline, save, back behavior, paste/fallback, resize anchoring, and duplicate-focus guarantees, switch to the controlled custom editor fallback built on the existing `editor-buffer-adapter` and runtime routing.

**Tech Stack:** Bun, TypeScript, OpenTUI (`TextareaRenderable`, `EditBufferRenderable`), tmux-backed smoke scripts, existing BlueNote TUI controller/state/adapters.

**Scope boundary:** This plan is only Phase 4B. Do not implement Phase 4C Manager performance/layout/style work or Phase 4D Search Everything preview/readability work here. Do not modify older `2026-05-26` Phase 3 plans. Preserve the Phase 4A `.data`/plain-note/no-frontmatter storage contract.

---

## Current state summary

Observed on 2026-05-28:

- Current branch: `feat/opentui-implement`.
- Phase 4A is complete at `b64e944 fix: complete phase 4a final review blockers`.
- Current editor body is rendered as a `TextRenderable` with id `bluenote-editor-body`.
- Runtime typing is handled by `editorBodyForInputSequence()` in `src/tui/app.ts`, which appends printable input to the end of the body and supports only newline/backspace basics.
- `src/tui/adapters/editor-buffer-adapter.ts` already has Unicode-safe helpers for selection/copy/cut/paste/find/replace, but runtime editor routing does not yet use them for cursor-aware body editing.
- `scripts/smoke-opentui-interactive.ts` already verifies basic editor typing, Ctrl+S, Ctrl+F, Escape, and manager create/delete flows through tmux.
- OpenTUI exports `TextareaRenderable`; its options include `initialValue`, `wrapMode`, `showCursor`, `cursorColor`, `cursorStyle`, `onCursorChange`, `onContentChange`, `handlePaste`, and edit-buffer cursor/selection APIs.

---

## Acceptance criteria

Phase 4B is accepted only when all of the following are true:

1. The editor has one real body input owner at a time.
2. Typing in editor body visibly changes the open note body and marks the buffer dirty.
3. Arrow navigation changes cursor position rather than appending all edits to the end.
4. Backspace/delete/newline work at the cursor.
5. Paste is supported through bracketed paste or a controlled fallback, with no ANSI/control garbage inserted into notes.
6. Ctrl+S saves through existing editor persistence and preserves `.data` sidecars/derived indexes.
7. Escape/Ctrl+[ returns to Manager without trapping the user.
8. Ctrl+F still opens find mode; exiting find mode restores body editing.
9. Rerenders do not create duplicate focused body inputs.
10. Editor topbar shows note name, directory, and latest updated/modified label where available.
11. Editor bottom/status bar shows save/autosave state, cursor line/column, wrap mode, and priority shortcuts responsively.
12. Word-wrap toggle works and is visible in status/chrome.
13. Overflow/scroll indicator is visible when body content extends beyond the viewport.
14. The tmux interactive smoke proves the critical editor input path.
15. Full verification gate passes:
    - `bun run typecheck`
    - `bun test`
    - `bun run smoke:opentui`
    - `bun run smoke:opentui:interactive`
    - `bun run smoke:cli`
    - `git status --short --branch`

---

## Viability decision rule

The first implementation slice must try the OpenTUI textarea path behind an explicit probe/smoke harness. Use this rule:

- If `TextareaRenderable` passes the tmux viability probe for typing, cursor arrows, newline, save, Escape/back, paste/fallback, resize anchoring, and no duplicate focused textarea after rerender, proceed with Textarea as the real editor body input owner.
- If it fails because OpenTUI does not deliver usable key/paste/cursor behavior in the real TTY path, commit the failing evidence in the task notes and switch the remaining tasks to the controlled custom editor fallback.
- Do not keep both input models active in production. One body input owner only.

---

## Task 1: Add editor input viability probe and body-input identity tests

**Files:**

- Modify: `tests/unit/tui/render-routing.test.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/app.ts`

**Step 1: Write failing tests**

Add unit tests that describe the target body-input contract before implementation:

- In `tests/unit/tui/render-routing.test.ts`, add a test named `editor body has exactly one focusable input owner after repeated rerenders`.
  - Render the editor three times, add each screen to a testing renderer, call `focusActiveWorkspaceInput()`, and assert exactly one descendant has id `bluenote-editor-body-input` and `focused === true`.
  - Assert no focused `bluenote-editor-body` display surface remains.
- In `tests/unit/tui/render-view-models.test.ts`, add assertions that the editor body view model exposes:
  - `inputId: "bluenote-editor-body-input"`
  - `cursor: { line: 1, column: 1 }` initially
  - `wrapMode: "word"`
  - `overflow: false` for short body
- In `scripts/smoke-opentui-interactive.ts`, extend the existing editor section after `typedEditorText` to include:
  - a left-arrow edit that inserts a marker before the last character, proving cursor navigation is not append-only
  - newline insertion
  - paste or literal multi-character fallback
  - Escape returning to Manager
  - a pane assertion that only the latest editor screen is visible, not duplicated after rerender

**Step 2: Run tests — confirm intended failure**

Command:

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts && bun run smoke:opentui:interactive
```

Expected: FAIL because current editor body is a non-focusable `TextRenderable` display surface and the runtime input handler appends at the end.

**Step 3: Minimal implementation for the probe**

- Add editor body input identity fields to `EditorBodyViewModel` in `src/tui/render-editor.ts`.
- Create a body-input renderable using OpenTUI `TextareaRenderable` with:
  - id `bluenote-editor-body-input`
  - `initialValue: vm.body.value`
  - `placeholder: vm.body.placeholder`
  - `wrapMode: vm.body.wrapMode`
  - `showCursor: true`
  - blue cursor/accent colors from the restrained theme
  - `onContentChange` reading `textarea.plainText` and calling `controller.updateEditorBody(...)`
  - `onCursorChange` forwarding cursor data once Task 2 adds state support; for Task 1, keep local rendering safe and typed.
- Update `focusActiveWorkspaceInput()` and `blurWorkspaceInputs()` in `src/tui/app.ts` so `bluenote-editor-body-input` is the active body input when editor body mode is active.
- Disable the legacy append-only fallback in `workspaceInputHandler` when the focused body textarea exists, so printable keys are not double-applied.

**Step 4: Run test — confirm probe path**

Command:

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts && bun run smoke:opentui:interactive
```

Expected: PASS if Textarea is viable. If the tmux smoke fails on real body input/cursor behavior, stop and switch Tasks 2–7 to the fallback path described in Task 2B.

**Step 5: Commit**

```bash
git add src/tui/render-editor.ts src/tui/app.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts scripts/smoke-opentui-interactive.ts && git commit -m "test: prove editor textarea input ownership"
```

---

## Task 2A: Textarea path — persist cursor/wrap metadata in editor state

Use this task only if Task 1 proves `TextareaRenderable` viable.

**Files:**

- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `tests/unit/tui/state.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write failing tests**

Add tests for:

- Opening an editor initializes cursor state to line 1, column 1, offset 0.
- `controller.updateEditorCursor({ line, column, offset })` updates editor state without marking dirty.
- `controller.toggleEditorWrapMode()` toggles `word -> none -> word`.
- `buildEditorViewModel()` exposes cursor label and wrap mode in the bottom bar.
- `onCursorChange` in `renderEditorScreen()` calls the controller cursor updater.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts
```

Expected: FAIL because editor state/controller do not expose cursor/wrap APIs yet.

**Step 3: Implement**

- Extend `EditorBufferState` with:

```ts
cursor?: { line: number; column: number; offset: number }
wrapMode?: "word" | "none"
overflow?: { above: boolean; below: boolean }
```

- Add pure state helpers:
  - `setEditorCursor(state, cursor)`
  - `toggleEditorWrapMode(state)`
  - `setEditorOverflow(state, overflow)`
- Extend `WorkspaceController` with:
  - `updateEditorCursor(cursor)`
  - `toggleEditorWrapMode()`
  - `updateEditorOverflow(overflow)`
- Update `buildEditorViewModel()`:
  - topbar: note title, directory, filename, key, dirty/saved/autosave label
  - body: input id, value, focused, cursor, wrap mode, overflow
  - bottombar: `Ln X, Col Y · Wrap word|none · <save status>`

**Step 4: Run test — confirm pass**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts src/tui/render-editor.ts tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: track editor cursor and wrap state"
```

---

## Task 2B: Fallback path — add controlled cursor-aware editor adapter

Use this task only if Task 1 proves `TextareaRenderable` is not viable in the real TTY probe.

**Files:**

- Modify: `src/tui/adapters/editor-buffer-adapter.ts`
- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/app.ts`
- Modify: `tests/unit/tui/editor-buffer-adapter.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**

Add tests for controlled editing operations:

- Insert text at cursor offset, not only at end.
- Backspace/delete at cursor.
- Arrow left/right/up/down changes cursor predictably across Unicode code points and lines.
- Newline inserts at cursor.
- Paste inserts at current selection/cursor.
- Selection/copy/cut remains Unicode-safe.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: FAIL because runtime editing is append-only and cursor state is missing.

**Step 3: Implement**

- Add cursor-aware helpers to `editor-buffer-adapter.ts`:
  - `insertTextAtSelection(editor, selection, text)`
  - `deleteBackwardAtSelection(editor, selection)`
  - `deleteForwardAtSelection(editor, selection)`
  - `moveEditorCursor(editor, selection, direction)`
  - line/column conversion helpers using Unicode code-point offsets.
- Add cursor/selection/wrap state to `EditorBufferState`.
- Add controller methods for editor input events.
- Update `workspaceInputHandler` to route printable text, arrows, delete, backspace, newline, and paste to the controlled adapter.
- Keep body rendering as a display surface, but render a visible cursor marker/line highlight if Textarea is not used.

**Step 4: Run test — confirm pass**

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/adapters/editor-buffer-adapter.ts src/tui/state.ts src/tui/workspace-controller.ts src/tui/app.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts && git commit -m "feat: add controlled cursor-aware editor fallback"
```

---

## Task 3: Wire editor shortcuts for wrap toggle, paste, and safe body routing

**Files:**

- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/app.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`

**Step 1: Write failing tests**

Add tests that verify:

- `Alt+Z` or equivalent terminal sequence toggles wrap mode.
- Ctrl+S still saves while body input is active.
- Ctrl+F still enters find mode from body input.
- Escape/Ctrl+[ still goes back to Manager.
- Ctrl+P still opens Search Everything.
- Paste input does not trigger global shortcuts embedded inside pasted text.
- Printable slash `/` remains body text in editor body mode, not Search Everything.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts
```

Expected: FAIL for wrap toggle and paste-safe routing.

**Step 3: Implement**

- Add a wrap-toggle shortcut to `routeEditorKey()` and/or textarea key bindings.
- Prefer `Alt+Z` if OpenTUI/tmux sends a stable sequence; document and test the exact accepted sequence.
- Ensure command shortcuts are handled before body mutation only for known control sequences, never for literal pasted text.
- If using Textarea path, keep body content changes from `onContentChange`; if using fallback path, route body mutations through controller adapter methods.
- Update bottom-bar hints to include wrap toggle only when there is room after Task 5 responsive logic.

**Step 4: Run test — confirm pass**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/render-editor.ts src/tui/app.ts src/tui/workspace-controller.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts && git commit -m "feat: wire editor wrap and paste-safe shortcuts"
```

---

## Task 4: Redesign editor topbar and bottom/status bar view models

**Files:**

- Modify: `src/tui/render-editor.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write failing tests**

Add tests that verify `buildEditorViewModel()` exposes:

- topbar note display:
  - note title/name
  - directory path separately from filename
  - filename
  - key
  - latest updated/modified label if available from note metadata/state; otherwise a calm fallback like `Updated unknown`
  - dirty/autosave status with restrained semantic intent
- bottombar display:
  - line/column
  - save/autosave state
  - latest updated/modified label where available
  - wrap mode
  - shortcut priority list
- no over-coloring or decorative full-screen title.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts
```

Expected: FAIL because current view model has only a simple topbar string and static bottom hints.

**Step 3: Implement**

- Extend `EditorTopbarViewModel` and `EditorBottombarViewModel` with structured fields instead of relying on one concatenated string.
- Add helpers:
  - directory extraction from `relativePath`
  - filename extraction
  - updated label from note metadata if available
  - status label from dirty/autosave state
- Preserve restrained color roles already used by the theme.
- Do not add broad theme palette changes here unless required by the editor status contract.

**Step 4: Run test — confirm pass**

```bash
bun test tests/unit/tui/render-view-models.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/render-editor.ts tests/unit/tui/render-view-models.test.ts && git commit -m "feat: refine editor chrome view model"
```

---

## Task 5: Render responsive editor chrome and overflow indicators

**Files:**

- Modify: `src/tui/render-editor.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`

**Step 1: Write failing tests**

Add tests that verify:

- Editor body height flexes between topbar/find bar/bottombar instead of fixed `height: 20`.
- Bottom bar anchors to the bottom after rerender/resize.
- Narrow-width view model hides lower-priority shortcuts first.
- Overflow indicator shows when there is content above/below viewport.
- Find bar and body input do not compete for focus.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && bun run smoke:opentui:interactive
```

Expected: FAIL because current editor body has fixed height and no responsive/overflow model.

**Step 3: Implement**

- Replace fixed editor body height with flex sizing consistent with OpenTUI layout.
- Add a lightweight responsive helper for editor chrome. Keep it local to `render-editor.ts` unless another subplan needs it later.
- Add overflow indicator fields to the view model and render them in the bottom/status bar or a one-cell gutter.
- Update interactive smoke to resize tmux or launch a smaller pane and assert the bottom bar is still reachable and editor remains usable.

**Step 4: Run test — confirm pass**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts && bun run smoke:opentui:interactive && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/render-editor.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts scripts/smoke-opentui-interactive.ts && git commit -m "feat: make editor chrome responsive"
```

---

## Task 6: Preserve save/autosave and dirty-guard behavior under real editor input

**Files:**

- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/app.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`

**Step 1: Write failing tests**

Add/extend tests to verify:

- Textarea or fallback body input changes call `updateEditorBody()` exactly once per content change.
- Autosave pending/saving/saved/error transitions still work.
- Manual save after cursor-aware edits persists body through the existing core service path.
- Dirty guard still blocks manager navigation/create/delete/search destructive replacement when editor content is dirty or autosave failed.
- Search Everything open/cancel does not lose editor input focus or dirty body.

**Step 2: Run tests — confirm failure where behavior is not wired**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

Expected: FAIL for any missing body-input/autosave/dirty-guard integration.

**Step 3: Implement**

- Ensure editor body updates keep autosave debouncing exactly once per logical change.
- Ensure rerender after autosave state changes restores the body input owner/focus.
- Ensure manager/search transitions preserve dirty body and require confirmation where existing controller rules demand it.
- Do not rebuild indexes per keystroke; preserve existing save/autosave persistence behavior.

**Step 4: Run test — confirm pass**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/workspace-controller.ts src/tui/app.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts scripts/smoke-opentui-interactive.ts && git commit -m "fix: preserve editor save and dirty guards"
```

---

## Task 7: Update docs and smoke contracts for Phase 4B editor behavior

**Files:**

- Modify: `README.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`
- Modify: `docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md` only if final implementation chooses fallback and the design needs a factual note
- Modify: `tests/integration/docs-phase3-tui.test.ts`
- Modify: `scripts/smoke-opentui.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`

**Step 1: Write failing tests**

Update docs/smoke assertions to require editor behavior now delivered by Phase 4B:

- TUI docs mention real editor body input, visible cursor, save/autosave status, wrap toggle, and responsive bottom bar.
- Interactive smoke contract includes editor cursor/input regression coverage.
- Bootstrap/status metadata should remain accurate and must not advertise Phase 4B as incomplete after acceptance.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts && bun run smoke:opentui
```

Expected: FAIL until docs/smoke text is aligned.

**Step 3: Implement**

- Update docs with current Phase 4B editor behavior and keep `.data`/plain-note contract intact.
- Update smoke status text only where it is an active status surface, not historical plans.
- Avoid broad roadmap rewrites outside Phase 4B acceptance surfaces.

**Step 4: Run test — confirm pass**

```bash
bun test tests/integration/docs-phase3-tui.test.ts tests/integration/cli-help.test.ts && bun run smoke:opentui && bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/phases/phase-3-tui-workspace.md docs/plans/2026-05-27-phase-4-search-editing-recovery-design.md tests/integration/docs-phase3-tui.test.ts scripts/smoke-opentui.ts scripts/smoke-opentui-interactive.ts && git commit -m "docs: document phase 4b editor refinement"
```

---

## Task 8: Final Phase 4B verification and reviews

**Files:**

- No planned source edits unless verification/reviews find blockers.

**Step 1: Run focused editor/TUI suite**

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
```

Expected: PASS.

**Step 2: Run full required gate**

```bash
bun run typecheck && bun test && bun run smoke:opentui && bun run smoke:opentui:interactive && bun run smoke:cli && git status --short --branch
```

Expected: PASS and clean working tree.

**Step 3: Dispatch final reviews**

Use the subagent-driven workflow:

- Spec reviewer: verify Phase 4B acceptance criteria and approved umbrella design only.
- Code-quality reviewer: verify editor/input architecture, focus ownership, no duplicate body input, no broad scope creep, no `.data`/storage regressions.

**Step 4: Fix blockers if found**

If reviewers find Critical/Important issues, write a failing regression first, fix narrowly, rerun targeted tests plus full gate, and repeat review.

**Step 5: Finish branch decision**

If reviews pass, use the finishing-branch workflow and present the four branch options.

---

## Parent-session verification checklist after every subagent task

After each implementer returns:

1. Re-read every file the parent previously loaded if it changed.
2. Run the task-specific tests in the parent session.
3. Run `bun run typecheck` for any TypeScript/source change.
4. If key routing or focus changed, run adjacent routing/render tests.
5. If real editor input changed, run `bun run smoke:opentui:interactive` before accepting the task.
6. Dispatch spec and code-quality reviewers before moving to the next task.
7. Commit must be scoped to the task and working tree must be clean unless the task intentionally chains into the next fix.

## Known risks and mitigations

- **Risk:** Textarea captures keys but content does not update controller state.  
  **Mitigation:** TTY smoke must assert typed text appears and `Ctrl+S` persists it.

- **Risk:** Textarea and legacy fallback both process printable keys.  
  **Mitigation:** Unit tests assert exactly one body input owner and smoke asserts no duplicate characters.

- **Risk:** Rerender destroys/recreates body input and loses focus/cursor.  
  **Mitigation:** Post-attach focus tests and repeated-rerender tests.

- **Risk:** Paste injects control sequences or triggers shortcuts.  
  **Mitigation:** Bracketed paste/fallback tests and smoke coverage.

- **Risk:** Wrap/overflow/status chrome becomes too busy.  
  **Mitigation:** View model uses priority hints and restrained blue theme; no decorative over-coloring.

- **Risk:** Autosave rebuilds on every keystroke or blocks input.  
  **Mitigation:** Preserve debounce and save path; do not add per-keystroke index rebuilds.
