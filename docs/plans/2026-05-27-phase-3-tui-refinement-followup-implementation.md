# Phase 3 TUI Refinement Follow-up Implementation Plan

> **For implementer:** Use TDD throughout. Write or adjust the failing test first, watch it fail for the intended reason, then implement the minimum change to make it pass. Keep commits small and task-scoped.

**Status:** Draft for approval
**Date:** 2026-05-27
**Goal:** Address the second manual-test feedback pass for the Phase 3 OpenTUI workspace: reduce noisy color usage, make the editor actually accept/route text input, simplify the manager chrome, and add manager create/delete-with-confirm actions.

**Architecture:** This is a narrow follow-up to Phase 3. It must not restart or accidentally execute the older `2026-05-26` Phase 3 refinement tasks by phase label alone. Keep the existing service-backed TUI architecture and the plain-note storage contract; route manager mutations through existing core services and make runtime focus/input ownership explicit.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, existing `src/tui/*` modules, BlueNote core services (`createNote`, `deleteNote`, `rebuildIndexes`, `showNote`, `listNotes`), tmux-backed interactive smoke checks.

**Do not confuse with previous plans:**
- Previous baseline design: `docs/plans/2026-05-26-phase-3-tui-workspace-design.md`
- Previous refinement design/plan: `docs/plans/2026-05-26-phase-3-tui-refinement-design.md`, `docs/plans/2026-05-26-phase-3-tui-refinement-implementation.md`
- This new follow-up plan is only for the fresh feedback below. Dispatch subagents with this exact file path and task number; do not rely on the phrase “Phase 3 TUI refinement” alone.

## Fresh user feedback to address

1. Color is overused. Keep dark/white backgrounds if useful, but use a restrained blue theme with only 2–3 purposeful colors: primary, secondary, and destructive/error. Avoid decorative colors for meaningless states.
2. The editor is not working interactively. After opening the editor, the user cannot type, close, or trigger shortcuts. The topbar changes to “dirty”, so keypresses may be captured but not applied or routed correctly.
3. The navigation manager screen should be simpler and more minimal: no “BlueNote” title/chrome for its own sake.
4. The manager must be able to create notes and delete notes with confirmation.

## Locked decisions for this follow-up

- **Storage contract stays unchanged:** notes are plain Markdown under `notes/`; BlueNote metadata stays in `.state/notes/`; no frontmatter or TUI-only metadata format.
- **Theme:** neutral background + blue primary + blue/cyan secondary + red only for destructive/error confirmation. Saved/dirty/pending states should use text labels/icons and restrained emphasis, not rainbow success/warning colors.
- **Editor input model:** the editor body uses a controller-owned, controlled display surface for this follow-up. Manual testing and tmux smoke reproduced that OpenTUI `TextareaRenderable` focus can accept/dirty keys without reliable live text entry in this runtime; therefore screen-level routing owns plain body text updates while global shortcuts remain explicit and find/search inputs stay focused OpenTUI inputs.
- **Manager create:** `n` opens a minimal create-note prompt from the manager. Enter creates the note through the existing core create path, rebuilds indexes, refreshes manager state, and opens the new note in the editor.
- **Manager delete:** `d` opens an explicit confirmation for the focused note. Confirmed delete uses the existing core delete path, rebuilds indexes, refreshes manager state, and never deletes folders in this follow-up.

---

## Task 1: Replace rainbow semantic colors with restrained blue theme tokens

**Files:**
- Modify: `src/tui/theme.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/render-search-everything.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/integration/docs-phase3-tui.test.ts`

**Step 1: Write the failing tests**

Add or adjust tests proving:
- `tuiTheme` uses a restrained palette: neutral background/panel colors, blue primary accent, blue/cyan secondary accent, muted text, and destructive/error red.
- Normal saved/dirty/autosave statuses do not require green/yellow/purple color intents; they expose text labels plus neutral/blue emphasis.
- manager/editor/search view models use color only for focus, active item, muted metadata, input focus, and destructive confirmation.
- docs/tests no longer describe broad semantic rainbow colors as the Phase 3 target.

**Step 2: Run tests — confirm they fail**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts
```

Expected: FAIL because the current theme still exposes/advertises too many color meanings (`success`, `warning`, purple secondary, etc.) and docs still describe broad semantic colors.

**Step 3: Write minimal implementation**

- Narrow `TuiColorIntent` to purposeful intents such as `background`, `panel`, `focusedRow`, `activeItem`, `mutedText`, `primaryAccent`, `secondaryAccent`, and `danger`.
- Map normal state labels (`Dirty`, `Autosaving…`, `Saved`) to text/neutral or blue emphasis, not green/yellow.
- Keep red/danger only for destructive confirmation and actual errors.
- Update renderers and tests to use the renamed intents.

**Step 4: Run tests — confirm they pass**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/theme.ts src/tui/render-manager.ts src/tui/render-editor.ts src/tui/render-search-everything.ts tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts && git commit -m "style: restrain tui color palette"
```

---

## Task 2: Fix editor runtime focus so body typing and shortcuts work

**Files:**
- Modify: `src/tui/app.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `scripts/smoke-opentui-interactive.ts`

**Step 1: Write the failing tests/checks**

Add tests proving:
- when `state.screen === "editor"` and `state.mode === "editor.body"`, route-only logic does not steal printable editor text from the body input path.
- editor body changes update `controller.updateEditorBody(...)` with the actual body text, not only dirty status.
- editor `Escape`/`Ctrl+[` returns via the global back rule, and `Ctrl+S` still saves.
- repeated render invalidations do not focus or stack stale body capture components.
- the interactive smoke script opens a note, sends normal text, captures that text in the pane, sends `Ctrl+S` or waits for autosave, and can return/quit cleanly.

**Step 2: Run tests/smoke — confirm they fail**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts
bun run smoke:opentui:interactive
```

Expected: FAIL or reproduce the reported behavior: editor dirty state changes but typed text/shortcuts do not behave correctly in the live TTY path.

**Step 3: Root-cause and implement minimal fix**

- Inspect the exact OpenTUI key/input event path in `startTuiWorkspace`, `routeWorkspaceKey`, and `renderEditorScreen` before patching.
- Keep the editor body as a controlled display surface and route plain printable text/newline/backspace through the workspace input handler.
- Do not consume printable keys in `routeWorkspaceKey`/`routeEditorKey`; only the runtime workspace input handler should mutate body text in editor body mode.
- Keep screen-level shortcuts (`Ctrl+S`, `Ctrl+F`, `Escape`, `Ctrl+[`, `Ctrl+C`) routed once and only once.
- Remove/reuse stale body renderables when the screen re-renders so an old component cannot trap input or display stale text.

**Step 4: Run tests/smoke — confirm they pass**

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts
bun run smoke:opentui:interactive
```

Expected: PASS. The smoke capture must show typed editor content and a usable exit path.

**Step 5: Commit**

```bash
git add src/tui/app.ts src/tui/render-editor.ts src/tui/workspace-controller.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts scripts/smoke-opentui-interactive.ts && git commit -m "fix: route tui editor input through focused textarea"
```

---

## Task 3: Add a regression-focused editor interaction smoke slice

**Files:**
- Modify: `scripts/smoke-opentui-interactive.ts`
- Modify: `tests/integration/cli-help.test.ts`

**Step 1: Write the failing smoke assertions**

Extend the interactive smoke fixture and assertions so it verifies the exact reported failure cannot return:
- launch `bun run ./bin/bn.ts tui` in tmux against a temp BlueNote root.
- open a known note from the manager into the editor.
- send a unique text token, for example `editor-input-regression-token`.
- verify the token appears in the captured editor pane.
- press `Ctrl+S` and verify the saved/clean status text changes without losing the token.
- press `Escape` or `Ctrl+[` and verify the app returns to the manager or documented previous screen.
- assert the smoke script is still covered by the project verification command list.

**Step 2: Run smoke — confirm it fails before the Task 2 fix if possible**

```bash
bun run smoke:opentui:interactive
```

Expected: FAIL on the current broken interaction path or PASS only after Task 2 is complete. If Task 2 already made it pass, keep this as permanent regression coverage.

**Step 3: Write minimal implementation**

- Use deterministic fixture notes and selectors.
- Prefer tmux `send-keys` for printable text, `C-s`, `Escape`, `C-c`, arrows, and Enter.
- Assert user-visible pane text; do not assert private implementation IDs.
- Keep timeouts local to this smoke flow if realistic TTY interactions need more than the old budget.

**Step 4: Run smoke — confirm it passes**

```bash
bun run smoke:opentui:interactive
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/smoke-opentui-interactive.ts tests/integration/cli-help.test.ts && git commit -m "test: cover live tui editor typing"
```

---

## Task 4: Simplify manager chrome and remove decorative title noise

**Files:**
- Modify: `src/tui/render-manager.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/integration/docs-phase3-tui.test.ts`
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`

**Step 1: Write the failing tests**

Add tests proving:
- the manager topbar/title model does not render decorative `BlueNote`, `BlueNote TUI`, or redundant product-name chrome.
- manager topbar focuses on useful context only: current folder/path, focused item path, and short action hints.
- manager status/help text remains minimal and does not repeat the app name.
- docs describe a minimal manager screen rather than a branded title screen.

**Step 2: Run tests — confirm they fail**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts
```

Expected: FAIL because existing manager/bootstrap wording still exposes decorative title/chrome.

**Step 3: Write minimal implementation**

- Replace manager title text with current context such as `notes/` or the current folder path.
- Keep only compact hints such as `↑↓ move · →/Enter open · n new · d delete · / filter · Esc back · q quit`.
- Preserve accessibility via text/icons; do not compensate for removed title by adding more colors.

**Step 4: Run tests — confirm they pass**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/render-manager.ts tests/unit/tui/render-view-models.test.ts tests/integration/docs-phase3-tui.test.ts README.md docs/product/overview.md docs/phases/phase-3-tui-workspace.md && git commit -m "style: simplify tui manager chrome"
```

---

## Task 5: Add manager create-note prompt backed by core services

**Files:**
- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/app.ts`
- Modify: `tests/unit/tui/state.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- pressing `n` in manager browse mode enters `manager.create` mode with exactly one focused title input.
- typing a title updates draft create state.
- `Enter` calls an injected create dependency with the title and empty body, then refreshes manager data/indexes.
- successful create opens the new note in the editor.
- `Escape`/`Ctrl+[` cancels create mode without creating a note.
- empty title submission shows a calm validation status and stays in the prompt.
- the integration workflow creates a real plain Markdown note through the same core service path as the CLI and does not add frontmatter.

**Step 2: Run tests — confirm they fail**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
```

Expected: FAIL because manager create mode/action is not implemented.

**Step 3: Write minimal implementation**

- Add `manager.create` mode and draft title/status fields to `TuiState`.
- Add controller methods such as `openManagerCreate()`, `updateManagerCreateTitle(title)`, `submitManagerCreate()`, and `cancelManagerCreate()`.
- Extend controller dependencies with `createNote(title, body)` or a narrow adapter wrapping `src/core/create-note.ts`, plus index rebuild/refresh through existing runtime dependencies.
- In `createDefaultWorkspaceController`, wire the dependency to `createNote({ override: rootPath, title, body: "" })`, rebuild indexes, then `showNote` the created key.
- Render one bounded, minimal prompt panel/input from manager mode.
- Route `n`, printable input in create mode, `Enter`, `Escape`, and `Ctrl+[` without creating stacked inputs.

**Step 4: Run tests — confirm they pass**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts src/tui/render-manager.ts src/tui/app.ts tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: create notes from tui manager"
```

---

## Task 6: Add manager delete confirmation backed by core services

**Files:**
- Modify: `src/tui/state.ts`
- Modify: `src/tui/workspace-controller.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/app.ts`
- Modify: `tests/unit/tui/state.test.ts`
- Modify: `tests/unit/tui/workspace-controller.test.ts`
- Modify: `tests/unit/tui/render-routing.test.ts`
- Modify: `tests/unit/tui/render-view-models.test.ts`
- Modify: `tests/integration/tui-workflow.test.ts`

**Step 1: Write the failing tests**

Add tests proving:
- pressing `d` on a focused note enters `manager.deleteConfirm` mode.
- pressing `d` on a folder does not delete and shows a non-destructive status message.
- confirmation panel names the note filename/key/path and uses the danger intent only here.
- `Escape`, `Ctrl+[`, or `n` cancels without deleting.
- `y` or `Enter` confirms deletion, calls an injected delete dependency with the selected note key/path, rebuilds indexes, refreshes manager state, and returns to manager browse mode.
- if the deleted note is the currently open editor note, editor state is cleared or safely returned to manager without dirty data loss.
- the integration workflow deletes a real note file and sidecar through the same core service path as the CLI.

**Step 2: Run tests — confirm they fail**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
```

Expected: FAIL because manager delete confirmation/action is not implemented.

**Step 3: Write minimal implementation**

- Add `manager.deleteConfirm` mode and selected-note confirmation state.
- Add controller methods such as `openManagerDeleteConfirmation()`, `confirmManagerDelete()`, and `cancelManagerDelete()`.
- Extend runtime dependencies with a narrow delete adapter wrapping `src/core/delete-note.ts` using `force: true` only after TUI confirmation.
- Rebuild indexes and refresh manager rows after delete.
- Clamp selection after deletion so focus lands on a nearby valid row.
- Render a small confirmation panel; do not introduce colorful modal chrome beyond the danger marker.

**Step 4: Run tests — confirm they pass**

```bash
bun test tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/tui/state.ts src/tui/workspace-controller.ts src/tui/render-manager.ts src/tui/app.ts tests/unit/tui/state.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts && git commit -m "feat: delete notes from tui manager with confirmation"
```

---

## Task 7: Add live manager create/delete interactive smoke coverage

**Files:**
- Modify: `scripts/smoke-opentui-interactive.ts`
- Modify: `tests/integration/cli-help.test.ts`

**Step 1: Write the failing smoke assertions**

Extend the tmux-backed interactive smoke script to verify:
- manager opens with minimal chrome and no decorative `BlueNote` manager title.
- pressing `n`, typing a unique title, and pressing Enter creates a note and opens it in editor.
- returning to manager shows the created note in the list.
- focusing the created note and pressing `d` opens a confirmation panel.
- cancelling delete leaves the note present.
- confirming delete removes the note from the manager list and from disk/sidecar through post-run filesystem assertions.

**Step 2: Run smoke — confirm it fails**

```bash
bun run smoke:opentui:interactive
```

Expected: FAIL until Tasks 5 and 6 are implemented.

**Step 3: Write minimal implementation**

- Reuse existing temp-root setup helpers in the smoke script.
- Keep created-note title unique to avoid collisions.
- Use pane-captured text for UI assertions and filesystem checks after clean shutdown for storage assertions.
- Avoid date-dependent assertions.

**Step 4: Run smoke — confirm it passes**

```bash
bun run smoke:opentui:interactive
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/smoke-opentui-interactive.ts tests/integration/cli-help.test.ts && git commit -m "test: cover tui manager create and delete flows"
```

---

## Task 8: Align docs/help/status text for the follow-up contract

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/phases/phase-3-tui-workspace.md`
- Modify: `docs/architecture/runtime-and-dependencies.md`
- Modify: `tests/integration/docs-phase3-tui.test.ts`

**Step 1: Write the failing docs tests**

Update docs tests to require mention of:
- restrained blue theme / minimal color usage.
- editor typing/input regression coverage.
- minimal manager chrome.
- manager create note via `n`.
- manager delete note via `d` with confirmation.
- continued plain-note/no-frontmatter storage contract.

**Step 2: Run test — confirm it fails**

```bash
bun test tests/integration/docs-phase3-tui.test.ts
```

Expected: FAIL because docs do not yet describe the new follow-up behavior.

**Step 3: Write minimal docs update**

- Update only current canonical docs and user-facing status/help surfaces.
- Avoid rewriting older historical plan files except this new plan.
- Do not overclaim folder deletion, rename, true inline rich editing, or network/cloud behavior.

**Step 4: Run test — confirm it passes**

```bash
bun test tests/integration/docs-phase3-tui.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/product/overview.md docs/phases/phase-3-tui-workspace.md docs/architecture/runtime-and-dependencies.md tests/integration/docs-phase3-tui.test.ts && git commit -m "docs: document tui refinement follow-up behavior"
```

---

## Task 9: Final verification and review readiness

**Files:**
- Modify only if verification reveals task-scoped drift.

**Step 1: Run required verification**

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```

Expected: all checks pass and working tree is clean.

**Step 2: Review passes**

Dispatch two independent review passes against this exact plan file:
- spec-compliance review: verifies all fresh feedback was satisfied and no previous Phase 3 plan was accidentally conflated.
- code-quality review: verifies focus routing, input ownership, create/delete side effects, tests, and docs quality.

**Step 3: Fix review findings if any**

If either review finds issues, fix with targeted tests first and repeat the review loop.

**Step 4: Finish branch flow**

After all checks and reviews pass, present branch options per the finishing-branch workflow.

## Approval checkpoint

This plan intentionally stops at planning. After approval, execute task-by-task with subagent-driven TDD and parent-session verification. Do not implement from this draft until the user explicitly approves it.
