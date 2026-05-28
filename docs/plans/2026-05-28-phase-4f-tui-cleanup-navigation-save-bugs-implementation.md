# Phase 4F — TUI Cleanup, Navigation, Filtering, and Save-Bug Fixes Implementation Plan

> **For implementer:** Use TDD throughout. Write failing tests first. Watch them fail. Then implement the smallest root-cause fix. Commit after each green task.

**Status:** Draft for approval.

**Goal:** Fix the current BlueNote TUI manual-testing regressions around Manager chrome/filtering/navigation and Editor chrome/autosave while keeping the local-first/plain-note storage contract unchanged.

**Architecture:** This is a focused Phase 4 subplan layered on top of completed Phase 4A–4E work. Keep the TUI as a presentation/input layer over existing core services; do not change note storage, `.data/` sidecars, search semantics, or the atomic note writer contract unless root-cause evidence proves a save-path bug there. Start with real TTY/runtime reproductions for the urgent bugs, then apply small screen-specific rendering/routing fixes.

**Tech Stack:** Bun, TypeScript, OpenTUI, tmux-backed interactive smoke harness, existing BlueNote core storage/search services.

---

## Scope and plan disambiguation

This plan is the new **Phase 4F** subplan for TUI cleanup and urgent save/navigation bugs.

Use this exact plan file when dispatching implementers/reviewers:

- `docs/plans/2026-05-28-phase-4f-tui-cleanup-navigation-save-bugs-implementation.md`

Do **not** confuse this with historical similarly named plans:

- Out of scope: `docs/plans/2026-05-26-phase-3-tui-workspace-design.md`
- Out of scope: `docs/plans/2026-05-26-phase-3-tui-workspace-implementation.md`
- Out of scope: `docs/plans/2026-05-26-phase-3-tui-refinement-design.md`
- Out of scope: `docs/plans/2026-05-26-phase-3-tui-refinement-implementation.md`
- Out of scope: `docs/plans/2026-05-27-phase-3-tui-refinement-followup-implementation.md`
- Dependency only: `docs/plans/2026-05-28-phase-4b-editor-input-cursor-responsive-chrome-implementation.md`
- Dependency only: `docs/plans/2026-05-28-phase-4c-manager-performance-responsive-layout-style-implementation.md`
- Dependency only: `docs/plans/2026-05-28-phase-4e-autosave-atomicity-implementation.md`

Preserve delivered contracts from prior Phase 4 work:

- Notes remain plain Markdown.
- Metadata remains in `.data/notes/` sidecars.
- Manager filtering stays contains-style, not fuzzy subsequence matching.
- Autosave and manual `Ctrl+S` continue through the shared Phase 4E safe note-body write path.
- No recovery-copy/draft/prompt/list workflow is introduced.

---

## Current user-reported issues

### Manager

1. Top bar is too noisy.
   - Desired left: `BlueNote`
   - Desired right: `x items | <app status>`
   - Examples: `12 items | Latest Updated: 2026-05-28 10:30`, `12 items | Indexing...`
2. Bottom bar should display only the currently opened note full path.
3. Item selected/hover display is wrong.
   - Only hovered item gets background highlight.
   - Do not highlight the currently opened item.
   - Remove leading whitespace/padding before each item.
4. Filtering display should only update item count to `x items (filtered)`.
5. Filtering navigation must still work.
   - `Arrow Up` / `Arrow Down`: navigate filtered rows.
   - `Enter`: open selected note.
   - `Arrow Right`: open selected note.
   - `Arrow Left`: go back and clear filter.
6. Urgent bug: after editing current note, user cannot open another note; `Enter`, `Arrow Right`, `Esc`, quit-like actions stop working, while reopening the same note still works.

### Editor

1. Remove the outer full-screen editor border.
2. Remove the inner editor border title `Editor body · Line x, Col y`.
3. Update top bar to: `Note Name | full-path/file-name.md | latest_updated_time`
   - note name and full path left-aligned.
   - full path gray/muted.
   - latest updated time right-aligned.
4. Bottom bar becomes two rows.
   - Row 1: `Line x, Col y                  Wrap word: Enabled                  Unsaved`
   - Row 2: shortcut list.
   - Wrap status: Enabled green, Disabled red.
   - Save status: Unsaved red, Saving orange, Saved green.
5. Do not render a custom cursor character (`|` or `▌`) inside the editor body.
6. Urgent bug: after typing, state becomes `Unsaved`, then `Autosave failed`; investigate if this also causes the Manager bug.

---

## Suggested implementation order

1. Add real TTY/runtime reproductions for the urgent save/navigation bugs first.
2. Perform root-cause investigation from those reproductions; fix the autosave failure and trapped navigation before visual polish.
3. Fix Manager filtering navigation because it intersects with input routing/trapped-key behavior.
4. Apply Manager chrome/row visual cleanup.
5. Apply Editor chrome/cursor visual cleanup.
6. Align docs/smoke metadata and run the full verification gate.

Do not begin visual-only tasks until the urgent bug reproduction task has either:

- a failing regression that reproduces the bug, or
- documented evidence that the current code cannot reproduce it and a narrower failing unit/integration path has been found instead.

---

## Task 1: Real TTY regression for autosave failure and manager lockup

**Files:**

- Modify: `scripts/smoke-opentui-interactive.ts`
- Modify: `tests/integration/tui-workflow.test.ts`
- Modify if needed: `tests/unit/tui/render-routing.test.ts`

**Purpose:** Reproduce the two urgent user-reported bugs before changing product code.

**Step 1: Write failing tests / smoke probes**

Add a tmux-backed scenario to `scripts/smoke-opentui-interactive.ts` that:

1. Creates at least two notes in a temp BlueNote root.
2. Launches `bun run ./bin/bn.ts tui` in tmux.
3. Opens note A in the editor.
4. Types a few normal characters through the real editor input path.
5. Waits beyond the 750ms autosave debounce.
6. Captures pane text and asserts it does **not** show `Autosave failed`.
7. Reads note A from disk and asserts the typed characters are present.
8. Presses `Esc` / `Ctrl+[` to return to Manager.
9. Moves to note B with `Arrow Down` or the filtered result list.
10. Opens note B with `Enter` and `Arrow Right` in separate attempts.
11. Verifies note B becomes the active editor note.
12. Verifies `Esc`, `q`, and `Ctrl+C` still route after typing/autosave.

Add a core-service-backed integration test in `tests/integration/tui-workflow.test.ts` that models the same sequence without tmux:

- open note A,
- insert text,
- allow autosave to complete through the real persistence dependency,
- return to manager,
- open note B,
- assert the controller state is note B and not blocked.

If route-level behavior is implicated, add a focused `tests/unit/tui/render-routing.test.ts` regression for the exact key sequence that gets trapped.

**Step 2: Run tests — confirm failure or document no-repro evidence**

Commands:

```bash
bun run smoke:opentui:interactive
bun test tests/integration/tui-workflow.test.ts tests/unit/tui/render-routing.test.ts
```

Expected before fix:

- At least one new regression fails with visible `Autosave failed`, unchanged note file, or trapped Manager navigation; OR
- the smoke/integration path passes, in which case capture pane/file evidence in the task review and narrow investigation to a different manual-only condition before product edits.

**Step 3: Commit only after a product fix makes the new regressions green**

Commit message after implementation and verification:

```bash
git add scripts/smoke-opentui-interactive.ts tests/integration/tui-workflow.test.ts tests/unit/tui/render-routing.test.ts <fixed-files>
git commit -m "fix: cover TUI autosave and note-switch regressions"
```

---

## Task 2: Root-cause fix for autosave failure after typing

**Files:**

- Inspect/modify: `src/tui/app.ts`
- Inspect/modify: `src/tui/workspace-controller.ts`
- Inspect/modify: `src/tui/render-editor.ts`
- Inspect/modify only if evidence points there: `src/storage/atomic-note-writer.ts`
- Inspect/modify only if evidence points there: `src/storage/note-repository.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`
- Test/smoke: `scripts/smoke-opentui-interactive.ts`

**Root-cause investigation checklist:**

1. Confirm whether autosave failure happens in the default runtime dependency path, not only injected mocks.
2. Trace typed input from `routeControlledEditorBodyInput()` to `WorkspaceController.insertEditorText()` to `applyEditorChange()` to `scheduleAutosave()` to `persistTuiEditorBody()`.
3. Log or assert the values of:
   - note key,
   - note relative path,
   - submitted body,
   - current body at autosave completion,
   - persistence error class/message,
   - current screen/mode after failure.
4. Check whether rerender/focus re-registration after typing destroys or replaces state needed by autosave.
5. Check whether save success updates the editor to a note whose `relativePath`, key, title, or body no longer matches the submitted snapshot.
6. Check whether the manager preview cache or note summaries mutate stale state after save failure/success.
7. Do not mask errors by downgrading `Autosave failed` to `Unsaved`; fix the persistence failure at the source.

**Step 1: Write the failing focused regression**

Add or extend tests so a real `persistEditorBody` failure can be distinguished from a stale-completion no-op:

- successful autosave after typing must mark editor `Saved` and update `savedBody`;
- failed autosave must remain `Unsaved`/error only when the injected persistence actually throws;
- successful default runtime path must not show `Autosave failed`.

**Step 2: Run targeted failures**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui:interactive
```

**Step 3: Implement the root-cause fix**

Likely fix areas, depending on evidence:

- input routing inserts text but also lets a focused renderable consume/trap shortcuts;
- autosave completion compares against stale body/key and marks failure incorrectly;
- default persistence path returns a note shape that diverges from the current editor snapshot;
- focus/rerender ordering leaves the app in `editor.body` with trapped global shortcuts;
- `goBack`/quit/open routes are blocked by `autosaveStatus === "error"` after an avoidable autosave failure.

**Step 4: Verify**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui:interactive
```

Expected:

- Typing in editor autosaves successfully.
- No `Autosave failed` appears after normal typing.
- Actual Markdown file on disk includes typed text.
- Shortcuts still route after autosave.

**Step 5: Commit**

```bash
git add src/tui/app.ts src/tui/workspace-controller.ts src/tui/render-editor.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts scripts/smoke-opentui-interactive.ts
git commit -m "fix: keep TUI autosave and shortcuts working after typing"
```

---

## Task 3: Fix Manager note switching after editing

**Files:**

- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-manager.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**

Add tests for both successful and blocked cases:

1. If editor text has autosaved successfully, returning to Manager and pressing `Enter`/`Arrow Right` on another note opens the other note.
2. If editor is still dirty/pending/saving/error, opening another note is either:
   - blocked with clear visible status, or
   - allowed only after the approved confirmation flow.
3. Reopening the same note must not be the only action that works.
4. `Esc`, `q`, and `Ctrl+C` must still route after editing.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts
```

**Step 3: Implement**

Fix the state/routing bug at the root. Do not special-case only `Enter` if the same stale editor/autosave state traps `Esc` or quit.

Review these areas:

- `editorRequiresDestructiveConfirmation()` semantics after autosave success/failure;
- `openFocusedManagerItem()` dirty replacement logic;
- `goBack()` after editor edits;
- manager status feedback when a note switch is intentionally blocked;
- runtime key routing in `routeWorkspaceKey()` and `routeManagerKey()`.

**Step 4: Verify**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui:interactive
```

**Step 5: Commit**

```bash
git add src/tui/workspace-controller.ts src/tui/render-manager.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts scripts/smoke-opentui-interactive.ts
git commit -m "fix: restore manager navigation after editing"
```

---

## Task 4: Fix Manager filtering navigation

**Files:**

- Modify: `src/tui/render-manager.ts`
- Modify if needed: `src/tui/workspace-controller.ts`
- Test: `tests/unit/tui/render-routing.test.ts`
- Test: `tests/unit/tui/workspace-controller.test.ts`
- Test: `tests/integration/tui-workflow.test.ts`

**Step 1: Write failing tests**

Add tests for `manager.filter` mode:

- printable keys update the filter query;
- `Arrow Up` and `Arrow Down` move through filtered rows without editing the query;
- `Enter` opens the focused filtered note;
- `Arrow Right` opens the focused filtered note;
- `Arrow Left` clears the filter and returns to browse mode;
- `Esc`/`Ctrl+[` also leave filter mode without trapping navigation.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
```

Expected current failure risk:

- `manager.filter` currently treats `Enter` as `goBack()` and does not route arrows/open keys as required.

**Step 3: Implement**

Update `routeManagerKey()` filter-mode branch so it handles navigation/opening before printable query editing:

- `Arrow Up` -> `controller.moveManagerSelection("up")`
- `Arrow Down` -> `controller.moveManagerSelection("down")`
- `Enter`/`Arrow Right` -> `controller.openFocusedManagerItem()`
- `Arrow Left` -> `controller.clearManagerFilter()` or `controller.goBack()` if that reliably clears filter
- `Esc`/`Ctrl+[` -> close filter mode and keep or clear query according to the approved behavior; for this plan, `Arrow Left` specifically must clear the filter.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui:interactive
```

**Step 5: Commit**

```bash
git add src/tui/render-manager.ts src/tui/workspace-controller.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts scripts/smoke-opentui-interactive.ts
git commit -m "fix: navigate filtered manager results"
```

---

## Task 5: Simplify Manager top/bottom bars and filtered count

**Files:**

- Modify: `src/tui/render-manager.ts`
- Modify if status data needs a structured source: `src/tui/workspace-controller.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing view-model/render tests**

Expected Manager view model:

- topbar left label is exactly `BlueNote`;
- topbar right label is exactly `x items | <status>`;
- when filtered, count is exactly `x items (filtered)`;
- topbar excludes current path, hovered path, selected key, `Rebuild idle`, and `Index ready` unless those are the app status;
- bottom bar value is exactly the currently opened note full path, or empty/calm placeholder when no note is open.

Add renderer tests that inspect the render tree text where practical, not only the view model.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

**Step 3: Implement**

Refactor `ManagerTopbarViewModel` to expose structured fields such as:

- `leftTitle: "BlueNote"`
- `itemCountLabel: "12 items" | "12 items (filtered)"`
- `appStatusLabel: "Latest Updated: ..." | "Indexing..." | <calm fallback>`
- `rightLabel: `${itemCountLabel} | ${appStatusLabel}``
- `bottomPath: string`

Use the latest updated timestamp from available manager note summaries if already present. If no timestamp is available in the current TUI summary shape, use the existing calm status source as a fallback and do **not** add storage reads just for chrome.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

**Step 5: Commit**

```bash
git add src/tui/render-manager.ts src/tui/workspace-controller.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
git commit -m "style: simplify manager chrome"
```

---

## Task 6: Fix Manager row highlight and padding

**Files:**

- Modify: `src/tui/render-manager.ts`
- Modify if needed: `src/tui/theme.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`

**Step 1: Write failing tests**

Add assertions that:

- only `row.focused === true` receives `focusedRow` background;
- the currently opened note has no background highlight and no special open-row foreground unless still hovered;
- no open marker `●` is rendered;
- no leading focus marker/padding appears before the item text;
- rendered row content starts with the file/folder label, not spaces, `›`, `●`, or decorative icons unless explicitly retained by the approved UI.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts
```

**Step 3: Implement**

Update `toRowViewModel()` and `rowRenderable()`:

- remove `focusMarker` and `openMarker` from visible row text, or leave them as empty data-only fields for compatibility until all tests are updated;
- remove leading fixed-width prefix segments;
- ensure row background is based only on hover/focus;
- do not apply `activeItem` to the opened note merely because it is open;
- keep the palette restrained.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-view-models.test.ts
bun run smoke:opentui
```

**Step 5: Commit**

```bash
git add src/tui/render-manager.ts src/tui/theme.ts tests/unit/tui/render-view-models.test.ts
git commit -m "style: highlight only hovered manager rows"
```

---

## Task 7: Remove Editor borders, border title, and custom cursor glyph

**Files:**

- Modify: `src/tui/render-editor.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**

Assert that:

- root editor screen has `border: false`;
- editor body panel either has no border or has no title, according to the final chosen body container shape;
- no renderable contains text matching `Editor body`, `Line ... Col ...` as a border title;
- body content does not insert a custom cursor glyph such as `|` or `▌`;
- line/column remain available only in the bottom bar row.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

**Step 3: Implement**

- Set editor root `border: false`.
- Remove `title` from the body panel.
- Replace `renderControlledBodyValue()` so it returns normal body text or placeholder without injecting a cursor glyph.
- Keep controller cursor state for movement and line/column display, but let terminal/OpenTUI cursor behavior own visible cursor presentation where available.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run smoke:opentui:interactive
```

**Step 5: Commit**

```bash
git add src/tui/render-editor.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts scripts/smoke-opentui-interactive.ts
git commit -m "style: simplify editor body chrome"
```

---

## Task 8: Update Editor top bar and two-row bottom bar

**Files:**

- Modify: `src/tui/render-editor.ts`
- Modify if needed: `src/tui/theme.ts`
- Test: `tests/unit/tui/render-view-models.test.ts`
- Test: `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**

Assert the editor view model exposes:

Top bar:

- `noteName`
- full normalized path, e.g. `notes/inbox/file.md`
- latest updated time label
- separator fields rendered as `|`
- muted/gray style intent for the full path
- latest updated time aligned right in the renderer when width is known

Bottom row 1:

- left: `Line x, Col y`
- center: `Wrap word: Enabled` or `Wrap word: Disabled`
- right: `Unsaved`, `Saving`, or `Saved`
- wrap enabled intent: green/success
- wrap disabled intent: red/danger
- unsaved intent: red/danger
- saving intent: orange/warning
- saved intent: green/success

Bottom row 2:

- shortcut list only.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

**Step 3: Implement**

Update `EditorTopbarViewModel` and `EditorBottombarViewModel` to provide structured left/center/right fields instead of one joined status string.

Theme note:

- The existing palette intentionally limited colors. This task has explicit green/orange/red requirements for status labels. Add narrowly named semantic status tokens if needed, e.g. `success`, `warning`, `danger`, while keeping general UI chrome blue/muted.
- Do not reintroduce decorative color noise outside status labels.

Save label mapping:

- pending/dirty -> `Unsaved`
- saving -> `Saving`
- saved/clean -> `Saved`
- error should remain visible as an actual error state; if the user-facing row only permits three labels, render `Unsaved` plus a separate error/status message in a non-conflicting place, or get explicit approval before hiding `Autosave failed`.

**Step 4: Verify**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run smoke:opentui
```

**Step 5: Commit**

```bash
git add src/tui/render-editor.ts src/tui/theme.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
git commit -m "style: update editor status bars"
```

---

## Task 9: Update docs/status/smoke metadata for Phase 4F

**Files:**

- Modify: `README.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`
- Modify: `docs/phases/phase-4-search-editing-and-recovery.md`
- Modify: `docs/architecture/runtime-and-dependencies.md`
- Modify: `scripts/smoke-opentui.ts`
- Modify: `tests/integration/docs-phase3-tui.test.ts`

**Step 1: Write failing docs/status tests**

Update docs tests to expect Phase 4F delivered behavior:

- simplified Manager topbar/bottom path;
- filtered count behavior;
- filtered result navigation;
- editor border/title removal;
- editor top/bottom bar contract;
- real TTY smoke covers autosave and manager switching after edit.

**Step 2: Run tests — confirm failure**

```bash
bun test tests/integration/docs-phase3-tui.test.ts
bun run smoke:opentui
```

**Step 3: Implement docs/status updates**

Update only current canonical docs and smoke metadata. Do not rewrite historical Phase 3 plans.

Set bootstrap status to a Phase 4F marker such as:

- `phase-4f-tui-cleanup-navigation-save-bugs`

Set next marker back to the neutral follow-up marker unless a newer approved subplan exists:

- `phase-4-next-hardening-subplan`

**Step 4: Verify**

```bash
bun test tests/integration/docs-phase3-tui.test.ts
bun run smoke:opentui
```

**Step 5: Commit**

```bash
git add README.md docs/phases/phase-3-tui-workspace.md docs/phases/phase-4-search-editing-and-recovery.md docs/architecture/runtime-and-dependencies.md scripts/smoke-opentui.ts tests/integration/docs-phase3-tui.test.ts src/tui/app.ts
git commit -m "docs: document phase 4f tui cleanup"
```

---

## Task 10: Final verification and reviews

**Files:**

- No planned product edits.
- Review all files changed by Tasks 1–9.

**Step 1: Full verification**

Run:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```

If subprocess-heavy CLI tests time out unexpectedly after TUI work:

1. Check for stale `bun run ./bin/bn.ts tui` or smoke/tmux processes.
2. Kill only clearly stale project-owned processes.
3. Rerun failing slices.
4. Rerun the full gate from a clean process state.
5. Do not change timeouts unless the clean-state isolated tests prove timeout drift.

**Step 2: Dispatch final reviews**

Use this exact plan filename in review prompts:

- `docs/plans/2026-05-28-phase-4f-tui-cleanup-navigation-save-bugs-implementation.md`

Ask reviewers to verify:

- urgent autosave failure is reproduced/fixed or documented as no-repro with strong evidence;
- manager lockup after editing is fixed;
- manager filter mode routes arrows/open/back as specified;
- manager top/bottom bars and row highlight/padding match the requested contract;
- editor border/title/custom-cursor cleanup matches the requested contract;
- status colors are limited to meaningful status labels and do not reintroduce noisy styling;
- docs/smoke metadata do not mismatch old Phase 3 plans;
- no storage contract drift occurred.

**Step 3: Fix review blockers with TDD**

If final review finds a blocker:

1. Add a focused failing regression.
2. Fix the root cause.
3. Rerun the targeted slice.
4. Rerun the full gate.
5. Request focused re-review.
6. Commit the blocker fix.

**Step 4: Finish branch handoff**

After all reviews pass, present the standard branch options:

1. merge locally,
2. push + PR,
3. keep branch,
4. discard.

---

## Verification matrix

| Requirement | Primary tests/smoke |
| --- | --- |
| Autosave does not fail after typing | `scripts/smoke-opentui-interactive.ts`, `tests/integration/tui-workflow.test.ts`, `tests/unit/tui/workspace-controller.test.ts` |
| Can open another note after editing | `scripts/smoke-opentui-interactive.ts`, `tests/integration/tui-workflow.test.ts`, `tests/unit/tui/workspace-controller.test.ts`, `tests/unit/tui/render-routing.test.ts` |
| Manager topbar simplified | `tests/unit/tui/render-view-models.test.ts`, `tests/integration/docs-phase3-tui.test.ts` |
| Manager bottom bar shows only opened full path | `tests/unit/tui/render-view-models.test.ts` |
| Only hovered Manager row highlighted | `tests/unit/tui/render-view-models.test.ts` |
| No leading Manager row padding | `tests/unit/tui/render-view-models.test.ts` |
| Filtered count format | `tests/unit/tui/render-view-models.test.ts` |
| Filter navigation and open/back behavior | `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/workspace-controller.test.ts`, `tests/integration/tui-workflow.test.ts` |
| Editor outer border removed | `tests/unit/tui/render-view-models.test.ts` |
| Editor body title removed | `tests/unit/tui/render-view-models.test.ts` |
| Editor topbar layout | `tests/unit/tui/render-view-models.test.ts` |
| Editor two-row bottombar | `tests/unit/tui/render-view-models.test.ts` |
| No custom cursor glyph | `tests/unit/tui/render-view-models.test.ts`, `scripts/smoke-opentui-interactive.ts` |
| Docs/status aligned | `tests/integration/docs-phase3-tui.test.ts`, `bun run smoke:opentui` |

---

## Open questions before execution

1. **Autosave error label:** The requested save labels are `Unsaved`, `Saving`, `Saved`, but the current app shows `Autosave failed` for real errors. Should real save errors continue to show explicit error text somewhere, or should they display `Unsaved` with a separate error indicator?
2. **Manager bottom path when no note is open:** Should it be empty, `No note open`, or the focused note path? The requirement says the bottom bar should only display the currently opened note full path, so this plan assumes empty/calm placeholder when no note is open.
3. **Manager row icons:** The requirement explicitly removes leading whitespace/padding, but does not explicitly remove file/folder icons. This plan treats decorative leading markers/open markers as removable and keeps icons only if they do not create unwanted leading padding.
