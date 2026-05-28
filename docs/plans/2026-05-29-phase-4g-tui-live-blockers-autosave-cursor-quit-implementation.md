# Phase 4G TUI Live Blockers: Autosave, Cursor, and Quit Implementation Plan

> **For implementer:** Use systematic debugging and TDD throughout. Do not write fixes before reproducing and root-causing each live blocker. Write the failing test that captures the proven root cause, watch it fail, implement the minimal fix, then verify with both automated tests and live `computer-use-linux` TUI verification when available.

**Goal:** Repair the live BlueNote TUI blockers reported by the user: autosave always fails, the editor cursor does not show, and `Ctrl+C` / `q` do not reliably quit.

**Architecture:** Keep this as a Phase 4 subplan because it hardens the Phase 4 TUI workflow after the earlier 4B–4F work. Treat controller/unit tests as necessary but insufficient: these failures are reported in the real TUI, so final acceptance requires a real terminal session driven through `computer-use-linux` whenever the tool is available. Defer visual polish until the live blockers are fixed and verified.

**Tech Stack:** Bun, TypeScript, `@opentui/core`, BlueNote `src/tui/*`, existing core storage services, Bun test suite, Ubuntu Terminal, `computer-use-linux` MCP tools.

**Why this is a new Phase 4G subplan:** Existing Phase 4 subplans already cover 4B editor input/chrome, 4C manager layout, 4D Search Everything, 4E autosave atomicity, and 4F cleanup/navigation/save-bugs. This plan is deliberately named `phase-4g-tui-live-blockers-autosave-cursor-quit` to avoid confusion with those older plans while keeping the work in Phase 4.

**Source reports:**

- User reports autosave always fails in the live TUI.
- User reports the editor cursor does not show.
- User reports `Ctrl+C` and `q` cannot quit reliably.
- Previous finish-branch attempt is invalid; do not resume finish-branch flow until this plan is complete.

**Global acceptance gates:**

- No implementation before root-cause investigation.
- Every bug fix must have RED→GREEN automated coverage for the proven root cause.
- Every bug fix must have parent-session verification, not only subagent self-reporting.
- If `computer-use-linux` is available, final verification must include live computer-use interaction with the TUI, not only smoke/unit tests.
- Use a disposable `BLUENOTE_ROOT`; never use personal notes for blocker reproduction.
- Keep note files plain Markdown with no frontmatter.
- Do not treat screenshot capture as required for functional acceptance if GNOME/XDG portal denies screenshots, but clearly label visual screenshot acceptance as blocked when that happens.

---

## Task 1: Record the blocker scope in QA results

**Files:**

- Modify: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`

**Step 1: Write the doc expectation check**

Run:

```bash
grep -n "User-reported blocker update" docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md || true
```

Expected before edit: no matching section or stale wording that does not include all three blockers.

**Step 2: Add the blocker update section**

Append near the top of the QA results document, after the executive summary / continuation note:

```markdown
## User-reported blocker update — 2026-05-29

The previous finish-branch attempt is invalidated by live user reports:

- Autosave always fails in the real TUI.
- The editor cursor does not show.
- `Ctrl+C` and `q` do not reliably quit.

Treat these as Blocker severity until disproven by reproducible evidence. Phase 4G now owns reproducing, root-causing, fixing, and live-verifying these issues before any visual-polish-only work resumes.
```

**Step 3: Verify docs**

Run:

```bash
grep -n "User-reported blocker update" docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md
grep -n "Phase 4G" docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md
```

Expected: both commands find the new section/text.

**Step 4: Commit**

```bash
git add docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md docs/plans/2026-05-29-phase-4g-tui-live-blockers-autosave-cursor-quit-implementation.md && git commit -m "docs: plan phase 4g tui live blocker fixes"
```

---

## Task 2: Build a safe live TUI reproduction harness

**Files:**

- Create if useful: `scripts/smoke-opentui-live-blockers.ts`
- Modify if useful: `package.json`
- QA evidence doc: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`

**Step 1: Check available live-verification tools**

Run:

```bash
command -v tmux || true
command -v gnome-terminal || true
bun --version
```

Also run with computer-use:

```text
mcp_computer_use_linux_doctor
mcp_computer_use_linux_list_windows
```

Expected:

- If `computer-use-linux` reports readiness, it must be used for live verification.
- If screenshots fail with portal denial, record that as a screenshot limitation but continue with targeted keyboard input and disk/process verification.

**Step 2: Prepare disposable QA root**

Run:

```bash
cd /home/hainn/blue/code/bluenote-term
QA_ROOT="$(mktemp -d -t bluenote-tui-phase4g-XXXXXX)"
printf '%s' "$QA_ROOT" > /tmp/bluenote-phase4g-root.txt
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts init
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts new --title "Autosave Blocker Probe"
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts new --title "Cursor Blocker Probe"
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts new --title "Quit Blocker Probe"
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts rebuild
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts list
```

Expected: three probe notes exist with keys and paths recorded.

**Step 3: Launch live TUI in Ubuntu Terminal**

Preferred launch:

```bash
ROOT="$(cat /tmp/bluenote-phase4g-root.txt)"
gnome-terminal --title='BlueNote Phase 4G Live Blocker QA' -- bash -lc "cd /home/hainn/blue/code/bluenote-term; export BLUENOTE_ROOT='$ROOT'; bun run ./bin/bn.ts tui; printf '\nTUI exited. Press Enter to close...'; read"
```

Then run:

```text
mcp_computer_use_linux_list_windows
```

Expected: a terminal window titled `BlueNote Phase 4G Live Blocker QA` with active process `bun run ./bin/bn.ts tui`.

**Step 4: Record harness evidence**

Update QA results with:

- `QA_ROOT`,
- terminal title/window id,
- terminal size if available,
- whether screenshots are available,
- whether targeted keyboard input is available,
- exact launch command.

**Step 5: Commit only if scripts/package docs changed**

If no repo files changed except QA results, include this evidence in the Task 1 or next task commit. If a reusable script was added:

```bash
git add scripts/smoke-opentui-live-blockers.ts package.json docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md && git commit -m "test: add phase 4g live tui blocker harness"
```

---

## Task 3: Reproduce and root-cause autosave failure

**Files:**

- Inspect: `src/tui/app.ts`, `src/tui/workspace-controller.ts`, `src/tui/render-routing.ts`, `src/tui/state.ts`, `src/tui/editor-buffer-adapter.ts`, storage service files used by TUI persistence
- Modify after root cause only: minimal files among the above
- Tests likely: `tests/unit/tui/workspace-controller.test.ts`, `tests/unit/tui/render-routing.test.ts`, `tests/integration/tui-workflow.test.ts`
- QA evidence: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`

**Step 1: Reproduce without fixing**

In the live TUI, drive with `computer-use-linux` targeted input if available:

1. Open `Autosave Blocker Probe` from Manager.
2. Type a unique line, e.g. `autosave phase4g probe <timestamp>`.
3. Wait at least 2 seconds.
4. Observe status if possible.
5. Inspect disk:

```bash
ROOT="$(cat /tmp/bluenote-phase4g-root.txt)"
find "$ROOT/notes" -type f -maxdepth 3 -print -exec sed -n '1,80p' {} \;
find "$ROOT/.data/notes" -type f -maxdepth 1 -print -exec sed -n '1,120p' {} \;
```

Expected if reproduced: status shows autosave failure or the Markdown file does not contain the unique line after debounce.

**Step 2: Trace data flow**

Investigate boundaries in this order:

```text
OpenTUI key event
→ route/editor input handler
→ editor buffer state mutation
→ dirty/autosave pending state
→ debounce scheduler
→ persistEditorBody dependency in src/tui/app.ts
→ syncEditedNote / atomic writer
→ sidecar/index refresh
→ editor saved/error state
```

Use temporary diagnostics only where needed. Remove or gate diagnostic noise before committing.

**Step 3: Test one hypothesis at a time**

Candidate hypotheses:

- Printable input mutates the terminal widget but not the controller buffer.
- Autosave timer is not scheduled in the real runtime.
- Autosave fires but uses stale note/body identity and marks itself failed.
- TUI app adapter `persistEditorBody` throws due to root/path mismatch.
- Persistence succeeds but stale failure overwrites saved state.

Each hypothesis must have a minimal proof/disproof command or test before moving on.

**Step 4: Write RED test for proven root cause**

Add the narrowest failing test. Candidate locations:

- `tests/unit/tui/render-routing.test.ts` if input routing fails.
- `tests/unit/tui/workspace-controller.test.ts` if autosave state/scheduler fails.
- `tests/integration/tui-workflow.test.ts` if the app adapter/core persistence path fails.

Run the targeted test and confirm it fails for the real reason.

**Step 5: Implement minimal fix**

Do not broaden into cursor or quit fixes unless the same proven root cause directly explains them.

**Step 6: Automated verification**

Run:

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-routing.test.ts tests/integration/tui-workflow.test.ts
bun run typecheck
```

Expected: PASS.

**Step 7: Live computer-use verification**

Using the live TUI or a fresh Phase 4G QA root, drive with `computer-use-linux` when available:

1. Open autosave probe note.
2. Type a new unique line.
3. Wait 2 seconds.
4. Verify disk contains the line without pressing `Ctrl+S`.
5. Verify sidecar metadata is valid.
6. Verify no frontmatter was added.

If screenshots are unavailable, record targeted key input results plus disk/process evidence. Do not claim screenshot visual verification.

**Step 8: Commit**

```bash
git add <minimal autosave files/tests> docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md && git commit -m "fix: repair phase 4g tui autosave blocker"
```

---

## Task 4: Reproduce and root-cause missing editor cursor

**Files:**

- Inspect: `src/tui/render-editor.ts`, `src/tui/render-routing.ts`, `src/tui/editor-buffer-adapter.ts`, `src/tui/theme.ts`, `src/tui/state.ts`
- Modify after root cause only: minimal render/input ownership files
- Tests likely: `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/render-view-models.test.ts`
- QA evidence: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`

**Step 1: Reproduce without fixing**

In live TUI:

1. Open `Cursor Blocker Probe`.
2. Type `cursor probe start`.
3. Move left several times, type `MID`, move down/up if possible.
4. Observe whether cursor/focus position is visible and whether text lands where expected.
5. Save/autosave and inspect disk for cursor glyph artifacts.

Expected if reproduced: editing position is invisible or unclear even though typing may still work.

**Step 2: Root-cause cursor ownership**

Investigate:

- Does editor body have exactly one focusable input owner after open/rerender?
- Does OpenTUI receive focus/cursor metadata for editor body mode?
- Did removal of the old custom cursor glyph leave no visible replacement?
- Is cursor color/theme indistinguishable from background?
- Does find/search mode steal focus permanently from editor body?

**Step 3: Write RED test for proven root cause**

Candidate tests:

- focused editor body has exactly one focused input owner after open and repeated rerender,
- editor body passes cursor/focus metadata in body mode but not find mode,
- cursor/focus style is visible and not transparent/background-equivalent,
- saved Markdown never contains visual cursor glyphs.

**Step 4: Implement minimal fix**

Prefer terminal-native/OpenTUI cursor visibility. Do not reinsert `|` or `▌` into the actual note body text.

**Step 5: Automated verification**

Run:

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/render-view-models.test.ts
bun run typecheck
```

Expected: PASS.

**Step 6: Live computer-use verification**

Using `computer-use-linux` when available:

1. Open cursor probe note.
2. Move cursor, type in the middle of text, and verify disk content lands at intended location.
3. Visually inspect directly if screenshots are available; otherwise record that screenshot visual evidence is blocked and use terminal/user observation plus disk evidence.
4. Confirm no cursor glyph artifact is saved.

**Step 7: Commit**

```bash
git add <minimal cursor files/tests> docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md && git commit -m "fix: show phase 4g tui editor cursor"
```

---

## Task 5: Reproduce and root-cause quit shortcut failures

**Files:**

- Inspect: `src/tui/render-routing.ts`, `src/tui/workspace-controller.ts`, `src/tui/app.ts`, `src/tui/state.ts`
- Modify after root cause only: minimal routing/controller/runtime files
- Tests likely: `tests/unit/tui/render-routing.test.ts`, `tests/unit/tui/workspace-controller.test.ts`, `tests/integration/tui-workflow.test.ts`
- QA evidence: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`

**Step 1: Reproduce by mode without fixing**

Use a safe QA root and live TUI. Test these modes separately:

1. Manager browse: press `q`.
2. Manager browse: relaunch, press `Ctrl+C`.
3. Editor clean body: open note, press `Ctrl+C`.
4. Editor clean body: open note, press `Esc`, then `q`.
5. Editor dirty/autosave-pending/error: type text, then press `Ctrl+C`.
6. Search Everything: press `Ctrl+P`, then `Ctrl+C`, then relaunch and test `Esc`.
7. Manager filter/create/delete prompt modes if reachable.

For each mode record:

- input sequence,
- expected behavior,
- actual behavior,
- whether `bun run ./bin/bn.ts tui` process ended,
- whether terminal returned to a usable shell/prompt,
- visible blocker/status text if available.

Use `mcp_computer_use_linux_list_windows` process context or shell process checks after key input.

**Step 2: Root-cause routing/runtime exit**

Trace:

```text
terminal key event
→ OpenTUI app key handler
→ mode-specific router / global router
→ workspace controller requestQuit/goBack
→ dirty guard decision
→ app exit callback
→ process termination / terminal restoration
```

Candidate hypotheses:

- `Ctrl+C` is swallowed by focused editor input and never reaches global route.
- `q` is intentionally left to text input but not handled in Manager browse.
- Dirty/autosave error guard blocks quit without visible/recoverable UX.
- Controller allows quit but runtime exit callback is not invoked.
- Runtime exits but terminal alternate screen/restoration makes it appear stuck.

Test one hypothesis at a time.

**Step 3: Write RED test for proven root cause**

Candidate tests:

- `tests/unit/tui/render-routing.test.ts`: `Ctrl+C` routes to exit from manager/editor/search according to dirty-guard contract.
- `tests/unit/tui/render-routing.test.ts`: `q` exits only in Manager browse, not while typing in filter/create inputs.
- `tests/unit/tui/workspace-controller.test.ts`: `requestQuit()` blocks only where data-loss guard requires and exposes clear status.
- `tests/integration/tui-workflow.test.ts`: saved/clean workflow exits through app route.

**Step 4: Implement minimal fix**

Do not weaken data-loss protection silently. If dirty state blocks quit, user must get a visible message and a clear recovery/confirm path; clean states must quit reliably.

**Step 5: Automated verification**

Run:

```bash
bun test tests/unit/tui/render-routing.test.ts tests/unit/tui/workspace-controller.test.ts tests/integration/tui-workflow.test.ts
bun run typecheck
```

Expected: PASS.

**Step 6: Live computer-use verification**

Using `computer-use-linux` when available:

- Verify `q` exits Manager browse.
- Verify `Ctrl+C` exits Manager browse.
- Verify `Ctrl+C` exits clean Editor or follows the approved quit contract.
- Verify dirty editor does not trap the user; either it exits by approved behavior or visibly blocks with a recoverable path.
- Verify terminal is usable after exit and no TUI process remains.

**Step 7: Commit**

```bash
git add <minimal quit files/tests> docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md && git commit -m "fix: restore phase 4g tui quit shortcuts"
```

---

## Task 6: Phase 4G final regression and live acceptance pass

**Files:**

- Modify: `docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md`
- Modify docs only if user-facing TUI behavior/shortcuts changed: `README.md`, `docs/architecture/runtime-and-dependencies.md`, `docs/phases/phase-4-search-editing-and-recovery.md`

**Step 1: Full automated verification**

Run:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
bun run smoke:cli
git status --short --branch
```

Expected:

- Typecheck passes.
- Test suite passes.
- Non-interactive TUI smoke passes.
- CLI smoke passes.
- Interactive smoke either passes if `tmux` is available or fails with explicit `tmux is required for interactive OpenTUI smoke tests` message.
- Working tree contains only expected docs/result updates before final commit.

**Step 2: Live computer-use acceptance matrix**

If `computer-use-linux` is available, run a fresh live TUI session and verify:

| Area | Required live result |
| --- | --- |
| Autosave | Typed unique line persists to Markdown after debounce with no `Ctrl+S` |
| Manual save | `Ctrl+S` persists and status does not falsely report failure |
| Cursor | User can see or otherwise clearly identify edit position; text lands at intended location |
| Manager quit | `q` exits Manager browse |
| Global quit | `Ctrl+C` exits or follows approved dirty-guard behavior without trapping |
| Terminal restoration | Shell is usable after exit; no stale TUI process remains |
| Storage | Note files remain plain Markdown; metadata stays in `.data/notes` |

Record evidence in QA results:

- QA root,
- window id/title,
- input sequences,
- disk snippets,
- process/window state after quit,
- screenshot status: captured path or explicit portal-denied blocker.

**Step 3: Docs alignment**

If shortcuts, quit behavior, autosave status wording, or cursor contract changed, update user-facing docs so README/help/architecture match the final behavior.

**Step 4: Final commit**

```bash
git add docs/plans/2026-05-28-phase-4-tui-manual-qa-results.md README.md docs/architecture/runtime-and-dependencies.md docs/phases/phase-4-search-editing-and-recovery.md && git commit -m "docs: record phase 4g tui live blocker verification"
```

Only commit files that actually changed.

---

## Execution mode

Recommended execution mode after user approval: **subagent-driven**, one implementer per root-cause/fix task with spec review and code-quality review after each. Parent session must re-run targeted automated tests and live `computer-use-linux` verification before accepting each bug fix.

Do not proceed to visual-polish-only Task 7/old hardening work until Phase 4G is complete.
