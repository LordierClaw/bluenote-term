# Phase 4I TUI Stability, UI Corrections, Manual QA, and Performance Plan

> **For implementer/tester:** Use systematic debugging and TDD throughout. No fixes without root-cause evidence first. For every code change: write a failing test, watch it fail, implement the smallest fix, watch it pass, then run parent-session verification. Do not implement this plan until the user explicitly approves it.

**Goal:** Stabilize the OpenTUI workspace after Phase 4H by fixing leaked/stale `bun run ./bin/bn.ts tui` processes, post-save typing lag, requested visual/layout corrections, long-line unwrap usability, and performance/memory risks; then manually test the whole TUI as a real user with visual ratings and evidence.

**Architecture:** Keep TUI as a presentation/input layer over existing core services. First investigate process lifecycle/autosave/render-loop root causes with reproducible evidence, then add regression coverage around cleanup, autosave, input latency, layout view models, and long-line navigation before implementing fixes. Final acceptance requires automated verification, live `computer-use-linux` visual QA, disk-state checks, and a performance/memory review.

**Tech Stack:** Bun, TypeScript, OpenTUI, tmux smoke harnesses, `src/tui/*`, `tests/unit/tui/*`, `tests/integration/tui-workflow.test.ts`, `scripts/smoke-opentui*.ts`, Ubuntu default Terminal, `computer-use-linux`, `ps`/`pstree`/`time`/optional heap profiling.

**Canonical visual reference:** `docs/product/design-language.md`, with user-requested overrides in this plan taking precedence for Phase 4I.

---

## 0. Current evidence and user-reported issues

Live process evidence gathered on 2026-05-29 before drafting this plan:

```text
Multiple long-lived `bun run ./bin/bn.ts tui` processes are still running, many with PPID 2900 and elapsed times from ~1.5h to ~7.5h. Typical RSS is ~110–144 MB per process. This confirms stale TUI processes are real and can accumulate significant RAM.
```

User-reported functional/performance symptoms:

1. Many BlueNote/Bun background processes remain running and consume several GB of RAM.
2. After saving the first note, the TUI becomes laggy; typing is delayed.
3. Prior Phase 4 subplans caused unstable behavior: failed save, inability to quit, inability to interact, and unfixed bugs.

Requested UI/product corrections:

1. Use terminal default background color, not dark blue, across Manager, Editor, Search Everything, prompts, and all layouts.
2. Manager layout 1: remove the third note-file/full-path column.
3. Manager layout 1: make the second column dim gray in normal and hover states so the first/title column remains the visual focus.
4. Editor: remove bottombar first row containing line/column/status details; move wrap mode into the topbar.
5. Editor body: remove the leading space/margin at the beginning of every line.
6. Search Everything results preview: remove the useless metadata row.
7. Verify unwrap mode for long lines, including horizontal navigation/scrolling to see remaining content and an indicator/symbol showing that a line continues beyond terminal width.
8. After all fixes, perform a performance review for speed, memory management, race conditions, deadlocks, process lifecycle, and render/input latency.

---

## 1. Non-goals

- No storage model changes.
- No note frontmatter.
- No AI features, sync, hosted backend, accounts, or cloud assumptions.
- No broad command-surface redesign.
- No user-configurable theme system; only the requested default-background correction.
- No manual killing of user processes as an implementation substitute. Process cleanup may be done as a controlled preflight/remediation step with explicit evidence and only for BlueNote TUI processes tied to this repo.

---

## 2. Acceptance criteria

### 2.1 Stability and process lifecycle

- Starting and quitting `bun run ./bin/bn.ts tui` leaves no orphan/stale BlueNote TUI process.
- `q`, `Ctrl+C`, and expected exit paths reliably destroy the renderer/controller and dispose timers/listeners.
- Repeated smoke/manual sessions do not accumulate `bun run ./bin/bn.ts tui` processes.
- Autosave timers are cleared on dispose and do not keep the process alive.
- Background process cleanup is verified with `ps` before/after repeated launches.

### 2.2 Save/input latency

- Saving the first note does not make editor input laggy.
- Typing after autosave/manual save remains responsive from a user perspective.
- Save operations do not trigger unnecessary full index rebuilds or render loops on every keypress.
- Autosave races cannot leave the editor stuck in `Saving…`, `Autosave failed`, or dirty/blocked state incorrectly.

### 2.3 Requested UI changes

- Default terminal background shows through everywhere; no app-wide dark-blue fill.
- Manager layout 1 has no third full-path note column.
- Manager layout 1 second column is dim gray in normal and hover/selected rows; first/title column remains primary/focused.
- Editor bottombar first row is removed; shortcut row remains useful and muted.
- Wrap mode appears in editor topbar.
- Editor body lines start at column 0 of the writing surface; no unwanted leading padding before every line.
- Search Everything preview no longer includes the useless metadata row.
- Unwrap mode long lines expose a clear overflow indicator and allow navigation/scrolling to hidden content.

### 2.4 Manual UX quality bar

For every tested screen, record a user-perspective rating:

- **1 unusable** — cannot complete task or cannot understand state.
- **2 confusing** — possible but error-prone or visually unclear.
- **3 acceptable** — functional but rough.
- **4 good** — clear, comfortable, visually aligned.
- **5 excellent** — fast, obvious, terminal-native.

Acceptance target:

- No Blocker or High findings remain.
- Core workflows score at least **4/5** after fixes: Manager browse/open, Editor edit/save/quit, Search Everything query/open, long-line unwrap navigation.
- Any lower-rated non-core or polish findings are documented with follow-up notes.

### 2.5 Verification commands

Before final handoff:

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
env -u BLUENOTE_ROOT bun run smoke:cli
git diff --check
git status --short --branch
```

Plus live visual/manual verification through Ubuntu default Terminal and `computer-use-linux`.

---

## 3. Investigation-first debugging protocol

No code fix may start until the relevant root-cause investigation produces evidence:

1. Reproduce the symptom or prove it is already reproducible from live system state.
2. Identify the component boundary: process lifecycle, controller timers, renderer lifecycle, autosave persistence, index rebuild, render invalidation, or layout rendering.
3. Form one explicit hypothesis.
4. Add a focused failing test or diagnostic assertion that proves the hypothesis.
5. Implement the smallest root fix.
6. Verify targeted tests, adjacent tests, and live behavior.

For failures that cannot be fully reproduced under automation, add the closest automated regression and preserve manual evidence in the QA results doc.

---

## 4. Task plan

### Task 1: Process lifecycle and stale Bun process root-cause investigation

**Files:**
- Inspect: `src/tui/app.ts`
- Inspect: `src/tui/workspace-controller.ts`
- Inspect/modify tests: `tests/unit/tui/workspace-controller.test.ts`
- Inspect/modify smoke: `scripts/smoke-opentui-interactive.ts`
- Create evidence doc: `docs/plans/2026-05-29-phase-4i-tui-stability-qa-results.md`

**Step 1: Record live process baseline**

```bash
ps -eo pid,ppid,stat,%mem,rss,etime,command --sort=-rss | awk 'NR==1 || /bun run \.\/bin\/bn\.ts tui|bn\.ts tui|smoke-opentui/ {print}'
pstree -ap $$ | head -80
```

Expected: document stale BlueNote TUI processes if present.

**Step 2: Reproduce with controlled launches**

Use a fresh temp root and run repeated launch/quit cycles through the repo command path:

```bash
QA_ROOT="$(mktemp -d -t bluenote-p4i-process-XXXXXX)"
BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts init
# Use tmux or controlled terminal session to start `BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts tui`, send q/Ctrl+C, then inspect ps.
```

Expected failure before fix if process lifecycle is broken: process remains after quit or timers keep process alive.

**Step 3: Add failing lifecycle regression**

Add or extend smoke/integration coverage so a TUI session exits cleanly and no matching child process remains for its session/root. Prefer updating `scripts/smoke-opentui-interactive.ts` with:

- tracked process/session id,
- explicit quit via `q` and `Ctrl+C`,
- post-exit `ps` assertion scoped to the temp root/session,
- cleanup in `finally`.

Run:

```bash
bun run smoke:opentui:interactive
```

Expected: fail before lifecycle fix or expose missing cleanup assertion.

**Step 4: Fix root cause only**

Potential root areas to verify before changing:

- `RunningTuiWorkspace.destroy()` destroys renderer and controller exactly once.
- `WorkspaceController.dispose()` clears autosave timers and state-change handlers.
- input listeners/render invalidation callbacks do not keep references alive after exit.
- smoke/manual harnesses always kill tmux sessions in `finally`.
- no spawned BlueNote command is detached unintentionally.

**Step 5: Verify and commit**

```bash
bun test tests/unit/tui/workspace-controller.test.ts
bun run smoke:opentui:interactive
ps -eo pid,ppid,stat,%mem,rss,etime,command --sort=-rss | awk 'NR==1 || /bun run \.\/bin\/bn\.ts tui|bn\.ts tui|smoke-opentui/ {print}'
```

Commit:

```bash
git add src/tui tests/unit/tui scripts docs/plans/2026-05-29-phase-4i-tui-stability-qa-results.md && git commit -m "fix: clean up tui process lifecycle"
```

---

### Task 2: Save/autosave lag root-cause investigation and regression

**Files:**
- Inspect/modify: `src/tui/workspace-controller.ts`
- Inspect/modify: `src/tui/app.ts`
- Inspect/modify: `src/tui/adapters/editor-buffer-adapter.ts`
- Tests: `tests/unit/tui/workspace-controller.test.ts`, `tests/unit/tui/editor-buffer-adapter.test.ts`, `tests/integration/tui-workflow.test.ts`
- Smoke: `scripts/smoke-opentui-interactive.ts`

**Step 1: Reproduce and measure**

Manual and tmux scenario:

1. Open first note.
2. Type a short sentence.
3. Press `Ctrl+S`.
4. Immediately type another sentence.
5. Measure visible delay and inspect whether repeated saves/rebuilds/render invalidations occur.

Collect:

```bash
/usr/bin/time -v env BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts tui
ps -o pid,ppid,stat,%mem,rss,etime,command -p <PID>
```

If needed, temporarily add diagnostic counters locally during investigation only, then remove or convert them to tests.

**Step 2: Hypotheses to test one at a time**

- H1: `persistTuiEditorBody()` rebuilds all indexes after every save and blocks input/rendering.
- H2: autosave debounce timers overlap with manual save and repeatedly invalidate/render.
- H3: save status transitions create an unbounded render loop via `onAutosaveStateChange`.
- H4: stale controller instances remain active after save/navigation.
- H5: body rendering or cursor calculations become expensive after save due to unnecessary full string/chunk rebuilds.

**Step 3: Add failing regression**

Add tests asserting:

- manual save does not leave autosave pending/saving,
- only one save operation is in flight for rapid typing/save sequences,
- controller can accept input immediately after save,
- save persistence is invoked the expected number of times,
- no stale save timer remains after `dispose()`.

Run:

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/integration/tui-workflow.test.ts
```

Expected: fail on at least one uncovered lag/race condition.

**Step 4: Fix root cause**

Possible implementation directions only after evidence:

- coalesce manual save and pending autosave,
- avoid full index rebuild on every editor save if sidecar/content update can refresh just the saved note,
- throttle render invalidation to state changes rather than every internal transition,
- clear/replace debounce timers deterministically,
- make save state transitions idempotent.

**Step 5: Verify and commit**

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui:interactive
```

Commit:

```bash
git add src/tui tests scripts && git commit -m "fix: keep editor responsive after save"
```

---

### Task 3: Default terminal background theme correction

**Files:**
- Modify: `src/tui/theme.ts`
- Modify: `src/tui/render-chrome.ts`
- Modify: `src/tui/render-manager.ts`
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/render-search-everything.ts`
- Tests: `tests/unit/tui/render-view-models.test.ts`, `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**

Assert that app-level/screen-level background rendering no longer uses the dark-blue app background as a filled full-screen surface. Tests should verify semantic roles distinguish:

- terminal/default background for root surfaces,
- optional panel/card surfaces only where needed,
- no global dark-blue fill in Manager, Editor, Search, or prompts.

Run:

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: fail because current renderers still apply `bg.app`/dark surface broadly.

**Step 2: Implement**

- Introduce/use a semantic `background: default/transparent` concept if OpenTUI supports it, or omit background styling for root containers.
- Keep status and selected-row colors semantic but avoid full-screen dark-blue fill.
- Preserve readable foreground colors on default black terminal background.

**Step 3: Verify and commit**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run smoke:opentui
```

Commit:

```bash
git add src/tui tests/unit/tui && git commit -m "fix: use terminal default background in tui"
```

---

### Task 4: Manager layout 1 column and hierarchy corrections

**Files:**
- Modify: `src/tui/render-manager.ts`
- Modify adapter/view model if required: `src/tui/adapters/note-manager-adapter.ts`
- Tests: `tests/unit/tui/render-view-models.test.ts`, `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**

Add assertions for Manager layout 1 at representative width:

- note rows do not render a third full-path column,
- first/title column uses primary/focused styling,
- second column uses dim gray/muted styling in normal rows,
- second column remains dim gray/muted even when row is hovered/selected,
- selected row still has one obvious focus cue without making metadata louder than title.

Run:

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: fail against current three-column/full-path metadata behavior or selected metadata styling.

**Step 2: Implement**

- Remove full-path third column from layout 1.
- Keep only title + one muted secondary column.
- Ensure hover/selected row style does not invert or brighten metadata more than title.
- Verify truncation works at 80, 100, and 120 columns.

**Step 3: Verify and commit**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run smoke:opentui
```

Commit:

```bash
git add src/tui tests/unit/tui && git commit -m "fix: simplify manager note row hierarchy"
```

---

### Task 5: Editor chrome correction — remove status row, move wrap mode to topbar

**Files:**
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/render-chrome.ts` if shared hint formatting changes
- Tests: `tests/unit/tui/render-view-models.test.ts`, `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**

Assert:

- editor bottombar no longer exposes row 1 with line/column/wrap/save status details,
- line/column labels are absent from user-visible editor chrome unless a future debug mode exists,
- wrap mode appears in the topbar as `Wrap word` / `Wrap off` or an approved compact equivalent,
- save state remains visible without the removed row,
- shortcut row remains available and muted.

Run:

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: fail because current `EditorBottombarViewModel.row1` renders line/col/wrap/save.

**Step 2: Implement**

- Remove first editor bottombar row from rendering and view model if no longer needed.
- Move wrap mode into topbar next to compact status metadata.
- Keep save status visible in topbar or a compact chrome location.
- Keep editor calm and body-dominant.

**Step 3: Verify and commit**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run smoke:opentui
```

Commit:

```bash
git add src/tui tests/unit/tui && git commit -m "fix: simplify editor chrome"
```

---

### Task 6: Editor body leading-space removal

**Files:**
- Modify: `src/tui/render-editor.ts`
- Modify if needed: `src/tui/adapters/editor-buffer-adapter.ts`
- Tests: `tests/unit/tui/render-view-models.test.ts`, `tests/unit/tui/editor-buffer-adapter.test.ts`

**Step 1: Write failing tests**

Assert:

- rendered editor body text begins at the first column of the writing surface,
- no renderer-injected leading space appears before every line,
- actual note body is not modified to remove user-authored spaces,
- cursor positioning still matches body offsets after removing display padding,
- placeholder text remains readable.

Run:

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/editor-buffer-adapter.test.ts
```

Expected: fail if current margin/padding inserts unwanted leading display spaces.

**Step 2: Implement**

- Remove body-line left padding/margin from the text-rendering path, not from user content.
- Keep any outer layout margin only if it does not create a visible leading space before every rendered line.
- Verify cursor placement and multiline editing.

**Step 3: Verify and commit**

```bash
bun test tests/unit/tui/render-view-models.test.ts tests/unit/tui/editor-buffer-adapter.test.ts
bun run smoke:opentui:interactive
```

Commit:

```bash
git add src/tui tests/unit/tui && git commit -m "fix: remove editor body leading padding"
```

---

### Task 7: Search Everything preview metadata-row removal

**Files:**
- Modify: `src/tui/render-search-everything.ts`
- Modify if needed: `src/tui/adapters/search-everything-adapter.ts`
- Tests: `tests/unit/tui/search-everything-adapter.test.ts`, `tests/unit/tui/render-view-models.test.ts`, `tests/unit/tui/render-routing.test.ts`

**Step 1: Write failing tests**

Assert:

- Search Everything result preview does not include the useless generic metadata row,
- preview still shows useful content: title/name, result kind, path or shortcut/risk when meaningful, and excerpt/usage,
- empty search and slash-command previews remain helpful.

Run:

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
```

Expected: fail if current preview includes the unwanted metadata row.

**Step 2: Implement**

- Remove the metadata row from result preview rendering.
- Preserve useful structured fields only where they carry meaning.
- Avoid replacing the removed row with empty space.

**Step 3: Verify and commit**

```bash
bun test tests/unit/tui/search-everything-adapter.test.ts tests/unit/tui/render-view-models.test.ts tests/unit/tui/render-routing.test.ts
bun run smoke:opentui
```

Commit:

```bash
git add src/tui tests/unit/tui && git commit -m "fix: remove search preview metadata noise"
```

---

### Task 8: Unwrap mode long-line navigation and overflow indicator

**Files:**
- Modify: `src/tui/render-editor.ts`
- Modify: `src/tui/adapters/editor-buffer-adapter.ts`
- Modify: `src/tui/workspace-controller.ts`
- Tests: `tests/unit/tui/editor-buffer-adapter.test.ts`, `tests/unit/tui/workspace-controller.test.ts`, `tests/unit/tui/render-view-models.test.ts`, `tests/integration/tui-workflow.test.ts`
- Smoke: `scripts/smoke-opentui-interactive.ts`

**Step 1: Write failing tests**

Assert when wrap mode is disabled and a line exceeds viewport width:

- an overflow indicator appears, e.g. `›`, `…`, `→`, or another approved symbol,
- moving cursor right beyond viewport horizontally scrolls/pans the visible segment,
- moving left can reveal earlier content again,
- Home/End or supported navigation reaches beginning/end predictably,
- the note body saved to disk remains unchanged; indicators are display-only,
- wrapping mode re-enabled returns to normal visible wrapping behavior.

Run:

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
```

Expected: fail because unwrap horizontal navigation/indicator is currently unproven or missing.

**Step 2: Implement**

- Track horizontal viewport offset for editor display when wrap is off.
- Update offset based on cursor movement and terminal width.
- Render visible line slices with left/right continuation indicators where content exists offscreen.
- Keep display slicing Unicode-aware enough for existing wide-character acceptance; document limitations if grapheme-width support remains approximate.

**Step 3: Add smoke coverage**

Extend `scripts/smoke-opentui-interactive.ts` with a long-line scenario:

- seed note with >180 character line,
- open editor,
- toggle wrap off,
- navigate right until hidden content becomes visible,
- assert pane text changes and continuation indicator appears,
- toggle wrap back on,
- save/quit cleanly.

Run:

```bash
bun run smoke:opentui:interactive
```

**Step 4: Verify and commit**

```bash
bun test tests/unit/tui/editor-buffer-adapter.test.ts tests/unit/tui/workspace-controller.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
bun run smoke:opentui:interactive
```

Commit:

```bash
git add src/tui tests scripts && git commit -m "feat: support long-line navigation in unwrap mode"
```

---

### Task 9: Full manual functionality QA from a user perspective

**Files:**
- Create/update results: `docs/plans/2026-05-29-phase-4i-tui-stability-qa-results.md`
- Use existing reference: `docs/plans/2026-05-28-phase-4-tui-manual-qa-plan.md`
- Use canonical design doc: `docs/product/design-language.md`

**Step 1: Preflight**

```bash
cd /home/hainn/blue/code/bluenote-term
git status --short --branch
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
env -u BLUENOTE_ROOT bun run smoke:cli
```

Record pass/fail and any unrelated environment failures separately.

**Step 2: Prepare fresh QA root**

```bash
QA_ROOT="$(mktemp -d -t bluenote-p4i-manual-XXXXXX)"
env BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts init
```

Seed notes covering:

- short note,
- multiline note,
- empty note,
- Unicode note,
- deep nested note,
- two similarly named notes,
- note with >180-column long line,
- note with leading spaces intentionally authored by user,
- note with markdown checklist/code block.

Run:

```bash
env BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts rebuild
env BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts list
env BLUENOTE_ROOT="$QA_ROOT" bun run ./bin/bn.ts search alpha
```

**Step 3: Computer-use readiness**

Use:

```text
mcp_computer_use_linux_doctor
mcp_computer_use_linux_list_windows
```

If direct screenshots are denied by GNOME portal, use the established bridge:

```bash
python3 /home/hainn/.hermes/skills/computer-use-linux/scripts/focused_mcp_screenshot.py <out.png>
```

**Step 4: Manual scenario matrix**

For every scenario, record:

```markdown
### Finding/Scenario ID: P4I-###
- Scenario:
- Terminal size / zoom:
- Input sequence:
- Expected:
- Actual:
- Severity: Blocker | High | Medium | Low | Polish | Pass
- UX rating: 1-5
- Performance feel: Instant | Slight delay | Noticeable lag | Unusable
- Disk/process evidence:
- Screenshot/pane capture:
- Notes:
```

Scenarios:

1. **Launch/quit lifecycle**
   - launch TUI, quit with `q`, relaunch, quit with `Ctrl+C`, inspect processes.
2. **Manager root/dashboard visual pass**
   - rate default background, title focus, row hierarchy, dim metadata, absence of third full-path column.
3. **Manager navigation**
   - folders, nested notes, arrows, Enter, Right, Left, Esc, preview toggle if present.
4. **Manager filter/create/delete prompts**
   - printable query, clear/back, create new note, delete confirmation safety and disk deletion.
5. **Editor open/edit/save**
   - type, autosave, `Ctrl+S`, inspect Markdown file, verify no frontmatter.
6. **Editor post-first-save latency**
   - after first save, type 200+ characters and multiple lines; rate delay and check CPU/RSS.
7. **Editor quit/back dirty behavior**
   - unsaved edit then Esc/q/Ctrl+C; verify blocking/confirmation or save requirement behaves as designed.
8. **Editor body spacing**
   - verify no unwanted leading space before every line; verify user-authored leading spaces remain.
9. **Editor wrap mode topbar**
   - `Alt+Z`, topbar changes, no removed line/col bottombar row.
10. **Editor unwrap long-line navigation**
    - open long line, wrap off, move right/end/left/home, verify continuation symbol and visibility of hidden content.
11. **Editor find mode**
    - `Ctrl+F`, query, next/previous, close, no input trap.
12. **Unicode input/display**
    - CJK, emoji, accents, combining characters; screenshot and disk verification.
13. **Search Everything empty/results**
    - `Ctrl+P`, query notes, open result, verify preview has no useless metadata row.
14. **Search slash commands**
    - command list, unavailable/destructive tags, Esc return.
15. **Responsive visual matrix**
    - capture at `80x24`, `100x30`, `100x30 --zoom=1.5`, `120x40` for Manager, Editor, Search, prompts, long-line unwrap.
16. **Stress session**
    - 10 minutes or scripted equivalent of open/edit/save/search/back cycles; inspect RSS/process count before and after.

**Step 5: Results doc**

Write a concise acceptance table and finding list to:

`docs/plans/2026-05-29-phase-4i-tui-stability-qa-results.md`

Include screenshot paths or contact sheet references when captured.

**Step 6: Commit QA results**

```bash
git add docs/plans/2026-05-29-phase-4i-tui-stability-qa-results.md && git commit -m "docs: record phase 4i tui stability qa"
```

---

### Task 10: Performance, memory, race-condition, and deadlock review

**Files:**
- Inspect all changed files in `src/tui/*`
- Inspect smoke/test harnesses in `scripts/*` and `tests/*`
- Update results: `docs/plans/2026-05-29-phase-4i-tui-stability-qa-results.md`

**Step 1: Static review checklist**

Review for:

- unbounded timers, intervals, listeners, callbacks,
- missing `dispose()`/cleanup paths,
- async save races and stale promise updates,
- unnecessary full index rebuilds during interactive editing,
- repeated full note list/search recomputation on every keypress,
- excessive `StyledText`/chunk allocations for unchanged content,
- uncaught async errors that can leave the UI half-alive,
- blocking filesystem work on every keypress,
- deadlocks/input traps caused by mode transitions,
- smoke harnesses that leave tmux sessions or child processes alive.

**Step 2: Runtime measurement**

Measure representative commands:

```bash
/usr/bin/time -v bun run smoke:opentui
/usr/bin/time -v bun run smoke:opentui:interactive
```

For live manual session:

```bash
ps -o pid,ppid,stat,%cpu,%mem,rss,vsz,etime,command -p <TUI_PID>
# Repeat after launch, after first save, after long-line navigation, after stress loop, after quit.
```

Optional if available and useful:

```bash
BUN_JSC_forceRAMSize=... # only if investigating memory pressure and documented; do not keep as runtime requirement.
```

**Step 3: Reviewer passes**

Dispatch two review passes after implementation:

1. **Spec compliance reviewer:** verify every user-requested item and acceptance criterion is covered.
2. **Performance/code-quality reviewer:** inspect diff for memory leaks, races, deadlocks, unnecessary work, and brittle test harness behavior.

If reviewers find Important/Critical issues, fix and re-review before final acceptance.

**Step 4: Final verification**

```bash
bun run typecheck
bun test
bun run smoke:opentui
bun run smoke:opentui:interactive
env -u BLUENOTE_ROOT bun run smoke:cli
git diff --check
git status --short --branch
ps -eo pid,ppid,stat,%mem,rss,etime,command --sort=-rss | awk 'NR==1 || /bun run \.\/bin\/bn\.ts tui|bn\.ts tui|smoke-opentui/ {print}'
```

Expected:

- all commands pass,
- no newly orphaned BlueNote TUI process remains,
- QA results doc records screenshots/ratings/performance evidence,
- branch is ready for finish-branch options.

Commit any final docs/test updates:

```bash
git add docs/plans tests scripts src/tui && git commit -m "test: verify tui stability and performance"
```

---

## 5. Subagent-driven execution plan after approval

Use `delegate_task` in place of `sessions_spawn` if `sessions_spawn` is unavailable. Each implementation task follows:

1. Implementer child with exact task text and TDD requirement.
2. Spec-compliance reviewer child.
3. Code-quality/performance reviewer child for stability-sensitive tasks.
4. Parent re-reads changed files and reruns targeted tests.
5. Parent performs adjacent smoke/manual verification before marking the task complete.

Recommended grouping:

- Group A: Task 1 process lifecycle.
- Group B: Task 2 save/input latency.
- Group C: Tasks 3–7 visual/layout corrections.
- Group D: Task 8 long-line unwrap behavior.
- Group E: Tasks 9–10 manual QA and performance review.

Do not proceed to visual/layout polish if Task 1 or Task 2 still has Blocker/High stability findings.

---

## 6. Approval gate

This plan changes scope and acceptance criteria for the current Phase 4 branch. Implementation must remain paused until the user explicitly approves this Phase 4I plan and chooses execution mode:

1. **Subagent-driven execution** — preferred for this repo: implementer + reviewer loop per task.
2. **Manual execution** — user or parent session executes tasks directly from the plan.
