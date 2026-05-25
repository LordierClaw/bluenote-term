export type ShellMode = "navigation" | "note" | "editor"

export type ShellFocusRegion = "sidebar" | "main"

export type ShellMessageLevel = "status" | "error"

export interface ShellTransientMessage {
  level: ShellMessageLevel
  text: string
}

export interface ShellState {
  mode: ShellMode
  focusRegion: ShellFocusRegion
  selectedNoteKey: string | null
  transientMessage: ShellTransientMessage | null
  editorDirty: boolean
}

export function createInitialShellState(): ShellState {
  return {
    mode: "navigation",
    focusRegion: "sidebar",
    selectedNoteKey: null,
    transientMessage: null,
    editorDirty: false,
  }
}
