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
- `runTuiCliInteractive()` now handles `SIGINT`, `SIGTERM`, and `SIGHUP`, destroys the workspace, removes signal handlers, and returns signal-appropriate exit codes.
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
