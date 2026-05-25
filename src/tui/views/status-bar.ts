import type { ShellState } from "../shell/shell-state"

export interface StatusBarViewModel {
  mode: ShellState["mode"]
  focusRegion: ShellState["focusRegion"]
  editorDirty: boolean
  transientMessage: ShellState["transientMessage"]
}

export function renderStatusBar(view: StatusBarViewModel): string {
  return [
    `MODE: ${view.mode}`,
    `FOCUS: ${view.focusRegion}`,
    `DIRTY: ${view.editorDirty ? "yes" : "no"}`,
    view.transientMessage?.text ?? "Ready",
  ].join(" | ")
}
