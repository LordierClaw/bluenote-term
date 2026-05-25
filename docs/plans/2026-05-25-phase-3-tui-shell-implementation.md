# Phase 3 TUI Shell Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** Turn BlueNote’s current OpenTUI scaffold into a working Phase 3 terminal shell with a real inline editing buffer, pane layout, startup/root-state handling, keymap-driven navigation, and a `bn tui` entrypoint that reuses existing core/storage services.

**Architecture:** Keep the TUI as a presentation/input layer over the existing Phase 2 CLI/core/storage contract. Introduce focused TUI modules for app bootstrap, shell state, layout/view rendering, note browsing adapters, and inline editor buffer behavior. Persist note changes through the existing core/service layer rather than creating any TUI-only storage path.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, existing BlueNote core/storage/index/config services, Bun test, current smoke scripts.

---

## Task 1: Replace the scaffold-only TUI bootstrap with explicit root/app-state discovery

**Files:**
- Modify: `src/tui/app.ts`
- Create: `src/tui/bootstrap.ts`
- Create: `src/tui/types.ts`
- Test: `tests/unit/tui/bootstrap.test.ts`
- Test: `tests/unit/tui/app.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- bootstrap returns a `missing-root` status when no managed root is available
- bootstrap returns a `ready` status with the resolved root path when a managed root exists
- `getTuiBootstrapInfo()` no longer reports the old scaffold-only status string
- the app bootstrap object includes the next phase marker `phase-3-tui-shell`

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/bootstrap.test.ts tests/unit/tui/app.test.ts
```
Expected: FAIL because the bootstrap module does not exist and `src/tui/app.ts` only reports static scaffold metadata.

**Step 3: Implement the minimum bootstrap layer**
- add `src/tui/types.ts` for shared TUI status/app-state types
- add `src/tui/bootstrap.ts` to resolve root availability and produce a typed bootstrap summary
- update `src/tui/app.ts` to call the bootstrap helper instead of returning hard-coded scaffold-only data
- keep this task limited to bootstrap data and pure app-state discovery, not rendering or key handling

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/bootstrap.test.ts tests/unit/tui/app.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/app.ts src/tui/bootstrap.ts src/tui/types.ts tests/unit/tui/bootstrap.test.ts tests/unit/tui/app.test.ts && git commit -m "feat: add phase 3 tui bootstrap state"
```

---

## Task 2: Add shell state and focus/mode transitions for sidebar, note pane, and editor mode

**Files:**
- Create: `src/tui/shell/shell-state.ts`
- Create: `src/tui/shell/shell-actions.ts`
- Test: `tests/unit/tui/shell-state.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- initial shell state starts in navigation mode with sidebar focus
- focus cycles predictably between sidebar and main pane
- opening a selected note moves the shell into note mode
- entering editor mode marks the editor as active without mutating note storage
- status/error message slots can be set and cleared without affecting selection state

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/shell-state.test.ts
```
Expected: FAIL because the shell state and transition helpers do not exist.

**Step 3: Implement the minimum shell state model**
- define a serializable shell state shape for mode, focus region, selected note key, transient message, and editor dirty flag
- add pure transition helpers in `shell-actions.ts`
- keep the logic UI-framework-agnostic so later view modules can consume it directly

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/shell-state.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/shell/shell-state.ts src/tui/shell/shell-actions.ts tests/unit/tui/shell-state.test.ts && git commit -m "feat: add tui shell focus and mode state"
```

---

## Task 3: Add note-list and note-detail adapters over existing core services

**Files:**
- Create: `src/tui/adapters/note-browser.ts`
- Modify: `src/core/show-note.ts`
- Test: `tests/unit/tui/note-browser.test.ts`
- Test: `tests/integration/tui-bootstrap-root.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- the TUI note browser can load note summaries from the existing list flow
- selecting a note returns title, key, description, path, and body for the main pane
- missing-root startup produces a structured empty-state result instead of throwing opaque errors
- root-ready startup loads the first note selection predictably when notes exist

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/note-browser.test.ts tests/integration/tui-bootstrap-root.test.ts
```
Expected: FAIL because no TUI note-browser adapter exists and the current app bootstrap has no ready-root loading behavior.

**Step 3: Implement the minimum note-browser adapter**
- add `note-browser.ts` as a thin wrapper around `listNotes()` and `showNote()`
- make any small `showNote()` cleanup needed so the TUI can consume a stable summary/body shape without duplicating storage reads
- keep all note lookup behavior aligned with the Phase 2 `key|path` selector contract

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/note-browser.test.ts tests/integration/tui-bootstrap-root.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/adapters/note-browser.ts src/core/show-note.ts tests/unit/tui/note-browser.test.ts tests/integration/tui-bootstrap-root.test.ts && git commit -m "feat: add tui note browser adapters"
```

---

## Task 4: Implement the inline editor buffer with cursor, text mutation, and dirty-state tracking

**Files:**
- Create: `src/tui/editor/editor-buffer.ts`
- Create: `src/tui/editor/editor-input.ts`
- Test: `tests/unit/tui/editor-buffer.test.ts`
- Test: `tests/unit/tui/editor-input.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- the editor buffer initializes from note body text and preserves line structure
- inserting characters updates the current line and cursor position
- backspace/delete update text safely at line boundaries
- arrow movement stays within valid row/column bounds
- dirty-state flips to `true` after text mutation and remains `false` for pure cursor movement
- editor input mapping only mutates the buffer while the shell is in editor mode

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/editor-buffer.test.ts tests/unit/tui/editor-input.test.ts
```
Expected: FAIL because no inline editor buffer or input translation layer exists.

**Step 3: Implement the minimum inline editor primitives**
- add a line-oriented buffer model that can round-trip plain note content
- add cursor and mutation helpers for insert, newline, backspace, delete, and arrow movement
- add an input translation layer that turns key intents into editor-buffer operations
- do not persist anything yet; keep this task strictly in-memory

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/editor-buffer.test.ts tests/unit/tui/editor-input.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/editor/editor-buffer.ts src/tui/editor/editor-input.ts tests/unit/tui/editor-buffer.test.ts tests/unit/tui/editor-input.test.ts && git commit -m "feat: add tui inline editor buffer"
```

---

## Task 5: Wire inline editor save/discard flows through existing core note-edit/update behavior

**Files:**
- Create: `src/tui/adapters/editor-session.ts`
- Modify: `src/core/edit-note.ts`
- Modify: `src/core/rename-note.ts`
- Test: `tests/unit/tui/editor-session.test.ts`
- Test: `tests/integration/tui-inline-save.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- saving an edited buffer updates the note body through core services
- save updates note metadata/indexes the same way the Phase 2 edit path does
- save can trigger title-derived rename behavior when the first Markdown heading changes
- discard resets the dirty buffer back to the last loaded persisted content
- failed saves surface a structured error state instead of silently dropping edits

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/editor-session.test.ts tests/integration/tui-inline-save.test.ts
```
Expected: FAIL because the TUI has no persistence adapter and the current edit flow is editor-launch oriented.

**Step 3: Implement the minimum save/discard adapter**
- add `editor-session.ts` to connect the in-memory buffer to core persistence behavior
- refactor `edit-note.ts` only as needed so inline-save and external-editor flows can share update/rename logic safely
- preserve existing rebuild/index behavior after successful writes
- keep transactional rename behavior intact when the note title changes

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/editor-session.test.ts tests/integration/tui-inline-save.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/adapters/editor-session.ts src/core/edit-note.ts src/core/rename-note.ts tests/unit/tui/editor-session.test.ts tests/integration/tui-inline-save.test.ts && git commit -m "feat: wire tui inline saves through core edit flows"
```

---

## Task 6: Add shell layout/view modules and render ready-root vs missing-root states

**Files:**
- Create: `src/tui/views/sidebar.ts`
- Create: `src/tui/views/note-pane.ts`
- Create: `src/tui/views/status-bar.ts`
- Create: `src/tui/views/empty-state.ts`
- Create: `src/tui/shell/shell-layout.ts`
- Modify: `src/tui/app.ts`
- Test: `tests/unit/tui/views.test.ts`
- Test: `tests/integration/tui-render.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- missing-root render includes a helpful init instruction
- ready-root render includes sidebar, main note pane, and status bar regions
- selected note details appear in the main pane
- status bar reflects current mode/focus/dirty-state summary
- empty note collections render a stable no-notes state instead of crashing

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/views.test.ts tests/integration/tui-render.test.ts
```
Expected: FAIL because no view or layout modules exist and the TUI app still only reports bootstrap metadata.

**Step 3: Implement the minimum view/layout layer**
- add small view builders for sidebar, note pane, status bar, and empty state
- add `shell-layout.ts` to compose the regions in one predictable frame
- update `src/tui/app.ts` to build a renderable shell from bootstrap + shell state + adapters
- keep view modules presentational; do not bury storage logic inside them

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/views.test.ts tests/integration/tui-render.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/views/sidebar.ts src/tui/views/note-pane.ts src/tui/views/status-bar.ts src/tui/views/empty-state.ts src/tui/shell/shell-layout.ts src/tui/app.ts tests/unit/tui/views.test.ts tests/integration/tui-render.test.ts && git commit -m "feat: add tui shell layout and views"
```

---

## Task 7: Add starter keymap and event handling for navigation, editor mode, save, discard, refresh, help, and quit

**Files:**
- Create: `src/tui/shell/shell-keymap.ts`
- Modify: `src/tui/app.ts`
- Test: `tests/unit/tui/shell-keymap.test.ts`
- Test: `tests/integration/tui-keyflow.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- `j`/`k` and arrow keys move selection in navigation mode
- `tab` cycles focus regions
- `enter` opens/focuses the selected note
- `i` or `e` enters editor mode for inline editing
- save/discard shortcuts operate only when the buffer is dirty
- `?` toggles help state and `q` exits cleanly from non-dirty states
- quit from a dirty buffer requires a clear discard/confirm path instead of silently losing edits

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts
```
Expected: FAIL because the TUI currently has no keymap or event dispatch layer.

**Step 3: Implement the minimum key handling**
- add a typed keymap module that maps key intents by shell mode
- connect key actions to shell state transitions, note browsing, and editor buffer/session behavior
- keep quit/discard behavior explicit when unsaved edits exist

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/shell/shell-keymap.ts src/tui/app.ts tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts && git commit -m "feat: add tui keymap and shell event handling"
```

---

## Task 8: Expose the TUI through a `bn tui` CLI entrypoint without regressing the Phase 2 CLI contract

**Files:**
- Modify: `src/cli/entry.ts`
- Modify: `tests/unit/cli-entry.test.ts`
- Modify: `tests/integration/cli-help.test.ts`
- Create: `tests/integration/cli-tui.test.ts`
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/phases/phase-3-tui-shell.md`

**Step 1: Write the failing tests**
Add tests that prove:
- `bn tui` is now a recognized command
- help output includes the Phase 3 TUI command line with accurate wording
- `bn tui` surfaces a friendly missing-root startup state instead of a generic crash
- adding the TUI command does not remove or rename any existing Phase 2 CLI commands

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts tests/integration/cli-tui.test.ts
```
Expected: FAIL because `tui` is still hidden/unknown and the docs/help text do not advertise it.

**Step 3: Implement the minimum CLI/docs exposure**
- add `tui` command routing in `src/cli/entry.ts`
- keep the visible Phase 2 CLI/storage behavior unchanged while adding the Phase 3 shell entrypoint
- update README/product/phase docs so the user-facing command surface and phase descriptions agree

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts tests/integration/cli-tui.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/cli/entry.ts tests/unit/cli-entry.test.ts tests/integration/cli-help.test.ts tests/integration/cli-tui.test.ts README.md docs/product/overview.md docs/phases/phase-3-tui-shell.md && git commit -m "feat: expose phase 3 tui shell from cli"
```

---

## Task 9: Upgrade the OpenTUI smoke check so it boots the actual shell contract

**Files:**
- Modify: `scripts/smoke-opentui.ts`
- Create: `tests/integration/smoke-opentui.test.ts`
- Modify: `src/tui/app.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- the smoke script no longer only checks package import availability
- the smoke script exercises real TUI bootstrap/shell startup behavior
- smoke output reflects missing-root vs ready-root shell startup meaningfully

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/integration/smoke-opentui.test.ts
bun run smoke:opentui
```
Expected: FAIL because the current smoke script only verifies the OpenTUI dependency import and scaffold metadata.

**Step 3: Implement the minimum smoke upgrade**
- make `smoke-opentui.ts` boot the Phase 3 shell entry contract rather than only importing `@opentui/core`
- preserve a fast non-interactive smoke path suitable for CI
- keep output concise and stable for tests

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/integration/smoke-opentui.test.ts
bun run smoke:opentui
```
Expected: PASS.

**Step 5: Commit**
```bash
git add scripts/smoke-opentui.ts tests/integration/smoke-opentui.test.ts src/tui/app.ts && git commit -m "test: boot real phase 3 tui shell in smoke checks"
```

---

## Task 10: Run full verification and fix adjacent TUI/CLI expectation drift before sign-off

**Files:**
- Modify only as needed based on failures from verification

**Step 1: Run the full project verification suite**
Command:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```
Expected: PASS, or clear identification of any pre-existing unrelated suite debt.

**Step 2: Review user-facing contract alignment**
Verify that these agree on the command surface and TUI wording:
- `README.md`
- `docs/product/overview.md`
- `docs/phases/phase-3-tui-shell.md`
- CLI `--help`
- TUI smoke output

**Step 3: Fix any adjacent drift discovered during full verification**
- update stale tests if the new TUI command surface is correct and the tests lag behind
- fix docs/help mismatches immediately
- do not leave known `tui` contract drift for a later task

**Step 4: Re-run verification after fixes**
Command:
```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:cli
```
Expected: PASS.

**Step 5: Commit**
```bash
git add . && git commit -m "chore: finalize phase 3 tui shell verification"
```

---

## Expected end state

After this plan:
- BlueNote has a real Phase 3 TUI shell, not just a scaffold banner
- the shell can start from `bn tui`
- the shell supports note browsing, focus/mode transitions, and a true inline editor buffer
- inline saves reuse existing core/storage/index behavior
- smoke/tests/docs all agree on the new Phase 3 TUI surface
