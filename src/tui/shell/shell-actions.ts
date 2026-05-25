import type { ShellFocusRegion, ShellState, ShellTransientMessage } from "./shell-state"

const FOCUS_ORDER: ShellFocusRegion[] = ["sidebar", "main"]

export function selectNote(state: ShellState, noteSelector: string | null): ShellState {
  return {
    ...state,
    selectedNoteSelector: noteSelector,
  }
}

export function cycleFocus(state: ShellState): ShellState {
  const currentIndex = FOCUS_ORDER.indexOf(state.focusRegion)
  const nextIndex = (currentIndex + 1) % FOCUS_ORDER.length

  return {
    ...state,
    focusRegion: FOCUS_ORDER[nextIndex],
  }
}

export function openSelectedNote(state: ShellState): ShellState {
  if (state.selectedNoteSelector === null) {
    return state
  }

  return {
    ...state,
    mode: "note",
    focusRegion: "main",
    transientMessage: null,
  }
}

export function enterEditorMode(state: ShellState): ShellState {
  if (state.selectedNoteSelector === null || state.mode !== "note") {
    return state
  }

  return {
    ...state,
    mode: "editor",
    focusRegion: "main",
    editorDirty: false,
    transientMessage: null,
  }
}

export function setTransientMessage(state: ShellState, message: ShellTransientMessage): ShellState {
  return {
    ...state,
    transientMessage: message,
  }
}

export function clearTransientMessage(state: ShellState): ShellState {
  return {
    ...state,
    transientMessage: null,
  }
}
