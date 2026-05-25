# Phase 3 TUI Shell Polish Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** Close the three highest-value gaps in the current Phase 3 TUI slice by making `bn tui` behave like a live shell, restoring note-to-browser navigation, and wiring deletion keys through the real shell keymap.

**Architecture:** Keep the TUI as a presentation/input layer over existing core services, but move the `bn tui` entrypoint from one-shot frame rendering to a real OpenTUI runtime loop. Extend the existing pure shell-state/keymap model rather than introducing a second interaction path, so the same state transitions remain testable in unit and integration coverage.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, existing `src/tui/*` modules, Bun test, OpenTUI smoke scripts.

---

## Task 1: Convert `bn tui` from one-shot render output into a live interactive runtime

**Files:**
- Modify: `bin/bn.ts`
- Modify: `src/cli/entry.ts`
- Modify: `src/tui/app.ts`
- Modify: `scripts/smoke-opentui.ts`
- Test: `tests/integration/cli-tui.test.ts`
- Test: `tests/integration/smoke-opentui.test.ts`
- Test: `tests/unit/cli-entry.test.ts`

**Step 1: Write the failing tests**
Add/adjust tests that prove:
- `runCli(["tui"])` returns a dedicated launch result instead of only a pre-rendered frame string
- the real bin entrypoint can boot the TUI shell path without falling back to static stdout-only behavior
- the OpenTUI smoke script validates runtime shell startup, not just a single rendered snapshot
- missing-root startup still shows the same user guidance after the runtime conversion

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-tui.test.ts tests/integration/smoke-opentui.test.ts
```
Expected: FAIL because the current `bn tui` path just renders once and exits.

**Step 3: Implement the minimum runtime launch path**
- change `runCli()` so the `tui` command returns a structured launch mode/result rather than a plain rendered frame
- update `bin/bn.ts` to detect that result and hand off to the real TUI bootstrap/runtime path instead of printing once then exiting immediately
- keep non-TUI CLI commands on the current synchronous stdout flow
- preserve the current missing-root/ready-root shell rendering contract during runtime startup
- update the smoke script to validate runtime startup semantics instead of only checking static frame text

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/cli-entry.test.ts tests/integration/cli-tui.test.ts tests/integration/smoke-opentui.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add bin/bn.ts src/cli/entry.ts src/tui/app.ts scripts/smoke-opentui.ts tests/unit/cli-entry.test.ts tests/integration/cli-tui.test.ts tests/integration/smoke-opentui.test.ts && git commit -m "feat: launch bn tui as a live shell runtime"
```

---

## Task 2: Restore navigation flow after opening a note

**Files:**
- Modify: `src/tui/shell/shell-actions.ts`
- Modify: `src/tui/shell/shell-keymap.ts`
- Modify: `src/tui/shell/shell-state.ts`
- Modify: `src/tui/app.ts`
- Test: `tests/unit/tui/shell-state.test.ts`
- Test: `tests/unit/tui/shell-keymap.test.ts`
- Test: `tests/integration/tui-keyflow.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- after `Enter` opens a note, a documented key path can return the shell to browsing/navigation mode
- once back in navigation mode, `j/k` and arrow keys resume moving the sidebar selection
- focus and mode state stay consistent when moving note → navigation → note again
- stale selection fallback in `app.ts` still works after the new transition path

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/shell-state.test.ts tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts
```
Expected: FAIL because the current shell has no way to leave note mode and resume browsing.

**Step 3: Implement the minimum note-to-browser transition**
- add one explicit, documented escape path from note mode back to navigation mode (for example `Escape`)
- keep the transition in pure shell-action helpers so it remains easy to test
- ensure the current selected note stays aligned with the sidebar selection when returning to navigation mode
- do not widen scope into new panes or search flows

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/shell-state.test.ts tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/shell/shell-actions.ts src/tui/shell/shell-keymap.ts src/tui/shell/shell-state.ts src/tui/app.ts tests/unit/tui/shell-state.test.ts tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts && git commit -m "feat: restore tui note-to-browser navigation"
```

---

## Task 3: Wire `Backspace` and `Delete` through the shell keymap for inline editing

**Files:**
- Modify: `src/tui/shell/shell-keymap.ts`
- Modify: `src/tui/editor/editor-input.ts`
- Test: `tests/unit/tui/editor-input.test.ts`
- Test: `tests/unit/tui/shell-keymap.test.ts`
- Test: `tests/integration/tui-keyflow.test.ts`

**Step 1: Write the failing tests**
Add tests that prove:
- pressing `Backspace` in editor mode routes through the shell keymap to the editor buffer delete-backward path
- pressing `Delete` in editor mode routes through the shell keymap to the delete-forward path
- these keys remain inert outside editor mode
- integration coverage shows deletion actually mutates note content before save/discard handling

**Step 2: Run the targeted tests — confirm they fail**
Command:
```bash
bun test tests/unit/tui/editor-input.test.ts tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts
```
Expected: FAIL because deletion exists in editor primitives but is not exposed from the shell key dispatcher.

**Step 3: Implement the minimum keymap wiring**
- map `Backspace` and `Delete` to the existing editor intents in `shell-keymap.ts`
- keep editor-input semantics unchanged except for any tiny adapter cleanup needed for shell dispatch
- avoid introducing new text-edit commands beyond these missing key routes

**Step 4: Run the targeted tests — confirm they pass**
Command:
```bash
bun test tests/unit/tui/editor-input.test.ts tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts
```
Expected: PASS.

**Step 5: Commit**
```bash
git add src/tui/shell/shell-keymap.ts src/tui/editor/editor-input.ts tests/unit/tui/editor-input.test.ts tests/unit/tui/shell-keymap.test.ts tests/integration/tui-keyflow.test.ts && git commit -m "feat: add tui editor deletion key bindings"
```

---

## Task 4: Re-run full verification and align user-facing wording with actual shell behavior

**Files:**
- Modify: `README.md`
- Modify: `docs/product/overview.md`
- Modify: `docs/phases/phase-3-tui-shell.md`
- Test: `tests/integration/cli-help.test.ts`
- Verify: `bun run typecheck`
- Verify: `bun test`
- Verify: `bun run smoke:opentui`
- Verify: `bun run smoke:cli`

**Step 1: Write/adjust the failing assertions**
Add or tighten assertions that prove:
- help/docs describe `bn tui` consistently with the now-implemented runtime behavior
- no stale wording still describes the TUI as scaffold-only or over-promises unsupported interaction beyond this plan’s scope

**Step 2: Run the targeted tests — confirm any wording drift fails first**
Command:
```bash
bun test tests/integration/cli-help.test.ts
```
Expected: FAIL if docs/help text still mismatches the delivered shell behavior.

**Step 3: Implement the wording/docs alignment**
- update README/product/phase docs to match the delivered runtime shell and navigation/editing capabilities
- keep claims scoped to what is actually verified in tests and smoke coverage

**Step 4: Run full verification — confirm it passes**
Command:
```bash
bun run typecheck && bun test && bun run smoke:opentui && bun run smoke:cli
```
Expected: PASS.

**Step 5: Commit**
```bash
git add README.md docs/product/overview.md docs/phases/phase-3-tui-shell.md tests/integration/cli-help.test.ts && git commit -m "docs: align phase 3 shell wording with runtime behavior"
```

---

## Done criteria

This polish plan is complete when:
- `bn tui` launches through a live runtime path instead of printing one frame and exiting
- the user can open a note and return to browsing mode without restarting the shell
- `Backspace` and `Delete` work through the actual shell keymap while editing
- help/docs accurately describe the delivered Phase 3 shell behavior
- `bun run typecheck`, `bun test`, `bun run smoke:opentui`, and `bun run smoke:cli` all pass
