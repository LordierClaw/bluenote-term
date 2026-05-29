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

Implemented the smallest fixes for the confirmed save path issues:

- Replaced per-save full `rebuildIndexes()` in the TUI save path with `updateIndexedNote()`, which updates the saved note in the existing derived indexes without rescanning all note files/sidecars.
- Added an integration regression with a deliberately dangling sidecar: a full rebuild would refuse to refresh derived indexes, while the incremental update keeps the saved note searchable.
- Added in-flight save coalescing in `WorkspaceController` so repeated manual saves and manual-save-during-autosave for the same note/body share one persistence operation.
- Manual save clears pending debounce timers before persisting, preserves immediate input responsiveness while an async save is in flight, and retries once if it attached to a failing in-flight autosave for the same still-current snapshot.
- Existing dispose coverage continues to verify pending timers are cleared and stale async save completions cannot keep render callbacks live.

### Verification

```bash
bun test tests/unit/tui/workspace-controller.test.ts tests/unit/tui/editor-buffer-adapter.test.ts tests/integration/tui-workflow.test.ts
# 111 pass, 0 fail

bun run typecheck
# tsc --noEmit passed

bun run smoke:opentui:interactive
# Interactive OpenTUI smoke check passed.
```
