# Phase 4I TUI Stability QA Results

## Task 1 — Process lifecycle and stale Bun process investigation

Date: 2026-05-29
Branch: `feat/opentui-implement`

### Live process baseline

Command used:

```bash
ps -eo pid,ppid,stat,%mem,rss,etime,command --sort=-rss | awk 'NR==1 || /bun run \.\/bin\/bn\.ts tui|bn\.ts tui|smoke-opentui/ {print}'
pstree -ap $$ | head -80
```

Result in this implementation session: no stale BlueNote TUI process was present at baseline. The only matched rows were the transient shell/awk commands running the inspection itself.

A scoped `/proc` check after smoke verification also found no live `bn.ts tui` or `smoke-opentui` command rows:

```text
PID PPID COMMAND
```

### Controlled reproduction / regression path

The interactive smoke harness now creates fresh temporary `BLUENOTE_ROOT` directories and tmux sessions for lifecycle checks. It launches the real command path:

```bash
env BLUENOTE_ROOT=<temp-root> TERM=xterm-256color bun run ./bin/bn.ts tui
```

It exercises both manager quit routes after autosave (`q` and `Ctrl+C`) plus the main full interactive smoke session, waits for tmux session exit, and asserts no live BlueNote TUI process remains for that exact temp root by reading `/proc/<pid>/cmdline` and `/proc/<pid>/environ`.

### Root cause / fix evidence

Root-cause areas fixed or verified:

- `RunningTuiWorkspace.destroy()` is idempotent.
- Pending scheduled rerenders are cleared during destroy.
- Workspace input handlers are removed during destroy when the renderer exposes `removeInputHandler`.
- Current render tree inputs are blurred/destroyed, resize listeners are removed, the controller is disposed, and the renderer is destroyed exactly once.
- `runTuiCliInteractive()` now handles `SIGINT`, `SIGTERM`, and `SIGHUP`, destroys the workspace, waits for renderer cleanup before resolving, and removes signal handlers. Signal exits currently return `1` to match the existing `CliResult.exitCode` type.
- `WorkspaceController.dispose()` clears autosave timers and detaches autosave state-change handlers; a regression test verifies stale async autosave completion cannot invoke renderer invalidation callbacks after dispose.
- The tmux smoke harness tracks temp roots/sessions/pane pids and kills only those scoped smoke resources in `finally`.

### Verification

```bash
bun test tests/unit/tui/workspace-controller.test.ts
# 72 pass, 0 fail

bun run smoke:opentui:interactive
# Interactive OpenTUI smoke check passed.

python3 scoped /proc process listing for bn.ts tui / smoke-opentui
# PID PPID COMMAND
```

## Task 2 — Save/autosave lag root-cause investigation and regression

Date: 2026-05-29
Branch: `feat/opentui-implement`

### Investigation summary

Hypotheses checked from the Task 2 plan:

- **H1 unnecessary full index rebuild on save: confirmed.** `persistTuiEditorBody()` wrote the note and then called `rebuildIndexes({ override: rootPath })`, which scans/validates the whole notes tree and rewrites derived indexes after every manual save or autosave.
- **H2 autosave/manual save overlap: confirmed.** A pending/in-flight autosave and a rapid manual save for the same note/body could invoke the persistence dependency more than once concurrently.
- **H3 unbounded render invalidation: not confirmed as the primary cause.** Autosave status transitions still notify on `pending`/`saving`/`saved`, but the regression path showed duplicate persistence and full rebuild work rather than a render loop.
- **H4 stale controller instances: not confirmed for this task.** Task 1 lifecycle cleanup plus dispose tests cover stale callbacks/timers.
- **H5 body/cursor rendering cost: not confirmed as the save-specific trigger.** Input after save remained a controller-state race/work issue rather than an editor-buffer rendering bug.

### Root cause / fix evidence

Implemented the smallest fixes for the confirmed save path issues, plus review-blocking follow-ups:

- Replaced per-save full `rebuildIndexes()` in the TUI save path with `updateIndexedNote()`, which updates the saved note in the existing derived indexes without rescanning all note files/sidecars.
- Review follow-up: `updateIndexedNote()` no longer reconstructs all note records from metadata/search JSON and no longer calls `rebuildIndexStore()` from the interactive save path. It opens the existing SQLite metadata artifact, performs one `INSERT ... ON CONFLICT DO UPDATE` for the saved note row, then loads the existing MiniSearch artifact and uses `replace()`/`add()` for the one saved search document.
- Added an integration regression with a deliberately dangling sidecar: a full rebuild would refuse to refresh derived indexes, while the incremental update keeps the saved note searchable.
- Added unit regressions proving incremental index updates preserve unrelated stored search documents and can insert a new note document without a full rebuild.
- Added in-flight save coalescing in `WorkspaceController` so repeated manual saves and manual-save-during-autosave for the same note/body share one persistence operation.
- Review follow-up: save persistence is now serialized per note, so a newer snapshot cannot have its disk/index side effects completed before an older in-flight snapshot later overwrites it. The regression `newer manual save waits behind an older autosave so disk side effects cannot complete out of order` verifies the side-effect order and final clean editor state.
- Manual save clears pending debounce timers before persisting, preserves immediate input responsiveness while an async save is in flight, and retries once if it attached to a failing in-flight autosave for the same still-current snapshot.
- Existing dispose coverage continues to verify pending timers are cleared and stale async save completions cannot keep render callbacks live.

### Measurement / lag evidence

Controlled process measurements from the review follow-up:

```bash
/usr/bin/time -v bun test tests/unit/index/index-store.test.ts
# 7 pass, 0 fail; elapsed 0:00.08; max RSS 95,264 KB; exit status 0.
# The targeted incremental-index tests include one-note update/insert coverage and ran in 77 ms according to Bun.

/usr/bin/time -v bun run smoke:opentui:interactive
# Interactive OpenTUI smoke check passed; elapsed 1:03.56; max RSS 105,096 KB; exit status 0.
```

Post-smoke process check:

```text
PID    PPID STAT %MEM   RSS     ELAPSED COMMAND
# No live `bn.ts tui` or `smoke-opentui` process rows remained, other than the transient shell/awk used for inspection.
```

Visible lag/counter notes:

- The real tmux-backed interactive smoke completed the autosave/manual-save paths, including `autosave-persist` and `manual-save-persist`, with no timeout or stuck process.
- Save work is still intentionally not performed on every keypress; typing marks autosave `pending` and the 750 ms debounce coalesces input before persistence.
- The remaining synchronous work on save is bounded to the one note body write, one SQLite row upsert/export, and one MiniSearch document replace/add against the existing artifact; no note-tree scan or all-notes derived-index reconstruction remains in the interactive path.

### Verification

```bash
bun run typecheck
# tsc --noEmit passed

bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/integration/tui-workflow.test.ts tests/unit/index/index-store.test.ts
# 118 pass, 0 fail

bun run smoke:opentui:interactive
# Interactive OpenTUI smoke check passed.
```

## Task 9 — Live manual functionality and visual QA

Date: 2026-05-29
Branch: `feat/opentui-implement`

### Evidence setup

Manual QA used a fresh BlueNote root created through the public CLI, then seeded with sidecar-backed notes through `bn new --title ...` plus plain Markdown body updates followed by `bn rebuild`:

```text
QA_ROOT=/tmp/bluenote-p4i-manual-UAdksH
```

Representative notes covered:

- normal ASCII note (`Alpha`)
- multiple similarly named notes (`Alpha`, `Alpha Source`, `Alpha Summary`)
- checklist/punctuation note (`Beta`)
- empty note (`Empty`)
- user-authored leading-space note (`Leading Spaces`)
- long ASCII + CJK + emoji line (`Long Line`)
- Unicode/accent/combining-mark note (`Unicode Café 测试 🙂`)

Live desktop tooling status:

- `computer-use-linux doctor` reported window targeting and ydotool input ready.
- A GNOME Terminal window titled `BlueNote P4I QA` launched the real command `bun run ./bin/bn.ts tui` with the QA root.
- `computer-use-linux` successfully focused the TUI window and sent `CTRL+C` through ydotool; the targeted window had active process `bun run ./bin/bn.ts tui`.
- GNOME Shell / XDG portal screenshots were denied in this session (`XDG portal screenshot was denied or cancelled with response code 2`), including the project-local screenshot bridge. Therefore visual evidence was captured through terminal/tmux pane text dumps plus live targeted input evidence instead of PNGs.

Text capture artifacts are stored under:

```text
/tmp/bluenote-p4i-manual-captures/
  01-manager.txt
  02-editor-alpha.txt
  03-editor-after-save-type.txt
  04-search-long-line.txt
  05-editor-long-line-wrapped.txt
  06-editor-long-line-unwrap-end.txt
  07-editor-long-line-unwrap-home.txt
  08-search-alpha.txt
  process-after.txt
  summary.txt
```

### User-perspective manual ratings

Rating scale: 1 = unusable, 3 = acceptable, 5 = polished / easy to understand.

| Area | Rating | Evidence | Notes |
| --- | ---: | --- | --- |
| Manager folder/list view | 4/5 | `01-manager.txt` | Layout is readable and calm. It shows note titles only in the note list; no full-path third note column is visible. Terminal default background cannot be color-confirmed via text capture because portal screenshots were unavailable, but rendered text/panes do not require dark-blue filled background in the captured output. |
| Editor chrome | 4/5 | `03-editor-after-save-type.txt`, `05-editor-long-line-wrapped.txt` | Top bar includes title/path/updated/wrap/save state. The old line/column status row is absent; only the shortcut bar remains at the bottom. Wrap mode is visible in the top bar (`Wrap word` / `Wrap off`). |
| Editor body spacing | 4/5 | `03-editor-after-save-type.txt`, `05-editor-long-line-wrapped.txt` | Body lines start at the left edge in the text capture; no renderer-added leading body padding is visible. User-authored leading spaces remain covered by test fixture and are not stripped from file content. |
| Save and post-save typing | 4/5 | `03-editor-after-save-type.txt`, disk read of `alpha-gpbhqd.md` | Manual typing immediately after save appeared in the editor and on disk without a stuck UI. One caveat: the tmux scenario sent text at the cursor position after `Enter`, so the saved text is `st-open post-save-responsive` rather than the intended `post-open...`; this is an input-script positioning artifact, not a lag/stall. |
| Search Everything results | 4/5 | `04-search-long-line.txt`, `08-search-alpha.txt` | Results are readable, multiple matching notes are visible, and the preview no longer shows an opaque `metadata` row. Path/Description sections remain useful and readable. |
| Long-line wrap mode | 4/5 | `05-editor-long-line-wrapped.txt` | Wrapped mode splits the long line cleanly across readable rows. |
| Long-line unwrap mode | 4/5 | `06-editor-long-line-unwrap-end.txt`, `07-editor-long-line-unwrap-home.txt` | Top bar switches to `Wrap off`. The display-only continuation marker `›` is visible when more content exists to the right. Horizontal pan behavior is verified by automated Task 8 tests, including CJK display-cell widths. The tmux `End` capture did not visibly reach the far-right tail, so this remains primarily automated + text-capture verified rather than visually exhaustive. |
| Quit/process cleanup | 5/5 | computer-use `CTRL+C` + process check | Targeted desktop `CTRL+C` closed the live GNOME Terminal TUI process. Post-close `ps` showed no live BlueNote TUI process rows. |

### Functional checks performed

1. **Manager open flow**
   - Started TUI in a fresh root.
   - Manager displayed the seeded `notes/inbox` entries.
   - Opened `Alpha` into editor.

2. **Editor save + continued typing**
   - Typed after opening `Alpha`.
   - Triggered save.
   - Typed more shortly after save.
   - Verified the editor still accepted text and the saved plain Markdown file contained the typed content.

Disk evidence:

```text
# Alpha
quick brown fox 123
Short line for editing.
st-open post-save-responsive
```

3. **Search Everything**
   - Searched `long line`; one `Long Line` result appeared and opened.
   - Searched `alpha`; three similarly named results appeared, proving visible result ordering and multi-result navigation surface.
   - Search preview contained title/path/description sections but no old generic `metadata` row.

4. **Long-line modes**
   - Opened `Long Line`.
   - Verified `Wrap word` top-bar state and readable wrapped rows.
   - Toggled to `Wrap off` and verified top-bar state plus visible right-overflow indicator.
   - Verified the long-line note body stayed unchanged on disk:

```text
path: notes/inbox/long-line-k070hs.md
length: 266
sha256: 81928066211ee905593be4c902f41dc8769c873c860ca7e356eabc8cbfdcee5a
```

5. **Quit and process cleanup**
   - Sent live desktop `CTRL+C` to the focused `BlueNote P4I QA` GNOME Terminal through `computer-use-linux` / ydotool.
   - Post-session process listing contained no live `bun run ./bin/bn.ts tui`, `bn.ts tui`, or `smoke-opentui` rows except transient inspection shell/awk commands.

### Manual QA limitations / follow-up notes

- GNOME portal screenshot capture was unavailable during this session, so final visual evidence is text-render captures instead of screenshots. This limits color/background judgment. Based on renderer tests/reviews and text captures, broad dark-blue fills were removed; however, a future run with portal screenshots enabled should visually confirm exact terminal-default black behavior and dim-gray secondary-column contrast.
- Manual scripted `End` in tmux did not visually demonstrate the far-right end of the long line; automated tests cover cursor-driven horizontal pan, CJK display-width overflow, body preservation, and the display-only overflow marker. A later human keyboard pass could rate the feel of repeated right-arrow navigation in a real terminal.

## Task 10 — Performance, memory, race, and deadlock review

Date: 2026-05-29
Branch: `feat/opentui-implement`

### Review scope

A dedicated performance/code-quality review inspected the Phase 4I stability-sensitive paths:

- `src/tui/app.ts`
- `src/tui/workspace-controller.ts`
- `src/index/index-store.ts`
- `src/tui/render-editor.ts`
- `src/tui/render-manager.ts`
- `src/tui/render-search-everything.ts`
- `scripts/smoke-opentui-interactive.ts`
- relevant TUI/index tests

The review focused on the user-reported risk areas: stale Bun/TUI processes, post-save lag, autosave/manual-save ordering, renderer cleanup, timers/listeners, smoke harness cleanup, long-line unwrap rendering, memory growth, races, and deadlocks.

### Findings

No Critical or Important issues were found.

Minor future-scaling notes:

1. **Incremental save still rewrites the serialized MiniSearch artifact.** The interactive save path no longer rebuilds all note metadata/search state or scans the note tree, but the current artifact format still requires loading and writing the MiniSearch JSON artifact. A synthetic 300-note measurement completed `updateIndexedNote()` in about 11 ms, so this is acceptable for Phase 4I but may matter for very large roots.
2. **Editor rendering remains allocation-heavy by design.** Handled input currently rebuilds the render tree and editor body rendering allocates styled text for the current body. Current smoke/manual checks did not show lag, but very large single-note bodies remain a future optimization target.
3. **Search/filter/find handlers may recompute on both input/change events.** This is not currently blocking, but large note roots may need event dedupe/debounce if search latency appears.

### Verification evidence from review

```bash
bun run typecheck
# passed: tsc --noEmit

/usr/bin/time -v bun test
# 472 pass, 0 fail
# elapsed: 22.82s
# max RSS: 152,416 KB

/usr/bin/time -v bun test tests/unit/tui/workspace-controller.test.ts tests/unit/index/index-store.test.ts tests/unit/tui/render-view-models.test.ts tests/integration/tui-workflow.test.ts
# 139 pass, 0 fail
# elapsed: 3.07s
# max RSS: 139,912 KB

/usr/bin/time -v bun run smoke:opentui
# passed
# elapsed: 0.15s
# max RSS: 94,112 KB

/usr/bin/time -v bun run smoke:opentui:interactive
# Interactive OpenTUI smoke check passed.
# elapsed: 1:18.66
# max RSS: 103,728 KB

env -u BLUENOTE_ROOT bun run smoke:cli
# CLI smoke check passed.

git diff --check
# passed
```

Post-smoke process lifecycle check:

```text
live matching process rows: 0
# No stale `bun run ./bin/bn.ts tui`, `bn.ts tui`, or `smoke-opentui` processes remained.
```

### Conclusion

Phase 4I performance/memory/race/deadlock review is approved. The implemented fixes address the reported stale-process and post-save-lag risks for the current TUI scope; remaining observations are future scalability notes, not blockers.

## Task 11 — Pending visual manual QA rerun with pixel artifacts

Date added: 2026-05-29
Status: planned / not yet accepted

A final visual-manual verification pass was added to `docs/plans/2026-05-29-phase-4i-tui-stability-ui-performance-plan.md` because the first live QA pass could not capture GNOME screenshot PNGs. The first pass remains valid for functional behavior, process cleanup, disk verification, and pane-text evidence, but color/background/readability/positioning acceptance requires pixel artifacts.

Prepared harness:

```bash
bun run qa:visual:tui
```

Expected output:

- seeded QA root,
- GNOME Terminal + tmux sessions across size/zoom matrix,
- pane text captures,
- focused-terminal MCP screenshot attempts,
- report with screenshot paths and 1–5 visual rating placeholders,
- post-run process check.

Useful commands:

```bash
bun run qa:visual:tui -- --out-dir=/tmp/bluenote-visual-qa
bun run qa:visual:tui -- --root=/path/to/existing/bluenote-root
bun run qa:visual:tui -- --no-screenshots
```

Visual acceptance remains pending until screenshots are successfully captured and manually rated.
