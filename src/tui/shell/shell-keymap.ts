import type { EditorIntent } from "../editor/editor-input"
import { cycleFocus, enterEditorMode, leaveNoteMode, openSelectedNote, selectNote, setTransientMessage } from "./shell-actions"
import type { ShellState } from "./shell-state"

export type ShellKeyInput =
  | "j"
  | "k"
  | "ArrowDown"
  | "ArrowUp"
  | "ArrowLeft"
  | "ArrowRight"
  | "Escape"
  | "Tab"
  | "Enter"
  | "i"
  | "e"
  | "Ctrl+S"
  | "Ctrl+D"
  | "r"
  | "?"
  | "q"
  | string

export type ShellKeyEffect =
  | { type: "none" }
  | { type: "enter-editor" }
  | { type: "save" }
  | { type: "discard" }
  | { type: "refresh" }
  | { type: "quit" }
  | { type: "editor-intent"; intent: EditorIntent }

export interface DispatchShellKeyOptions {
  key: ShellKeyInput
  shellState: ShellState
  noteSelectors: string[]
}

export interface DispatchShellKeyResult {
  shellState: ShellState
  effect: ShellKeyEffect
}

function moveSelection(shellState: ShellState, noteSelectors: string[], delta: number): ShellState {
  if (shellState.mode !== "navigation" || noteSelectors.length === 0) {
    return shellState
  }

  const currentIndex = shellState.selectedNoteSelector
    ? noteSelectors.indexOf(shellState.selectedNoteSelector)
    : -1
  const baseIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = Math.min(Math.max(baseIndex + delta, 0), noteSelectors.length - 1)

  return selectNote(shellState, noteSelectors[nextIndex] ?? null)
}

function toggleHelp(shellState: ShellState): ShellState {
  return {
    ...shellState,
    helpVisible: !shellState.helpVisible,
  }
}

function mapEditorIntent(key: ShellKeyInput): EditorIntent | null {
  switch (key) {
    case "ArrowLeft":
      return { kind: "moveLeft" }
    case "ArrowRight":
      return { kind: "moveRight" }
    case "ArrowUp":
      return { kind: "moveUp" }
    case "ArrowDown":
      return { kind: "moveDown" }
    case "Enter":
      return { kind: "newline" }
    default:
      if (key.length === 1 && !["\t", "\n", "\r"].includes(key)) {
        return { kind: "insertText", text: key }
      }

      return null
  }
}

export function dispatchShellKey(options: DispatchShellKeyOptions): DispatchShellKeyResult {
  const { key, noteSelectors } = options
  let shellState = options.shellState

  if (key === "?") {
    return {
      shellState: toggleHelp(shellState),
      effect: { type: "none" },
    }
  }

  if (key === "Tab") {
    return {
      shellState: cycleFocus(shellState),
      effect: { type: "none" },
    }
  }

  if (key === "Escape" && shellState.mode === "note") {
    return {
      shellState: leaveNoteMode(shellState),
      effect: { type: "none" },
    }
  }

  if (key === "q") {
    if (shellState.editorDirty) {
      return {
        shellState: setTransientMessage(shellState, {
          level: "error",
          text: "Unsaved changes. Save with Ctrl+S or discard with Ctrl+D before quitting.",
        }),
        effect: { type: "none" },
      }
    }

    return {
      shellState,
      effect: { type: "quit" },
    }
  }

  if (shellState.mode === "editor") {
    if (key === "Ctrl+S") {
      return {
        shellState,
        effect: shellState.editorDirty ? { type: "save" } : { type: "none" },
      }
    }

    if (key === "Ctrl+D") {
      return {
        shellState,
        effect: shellState.editorDirty ? { type: "discard" } : { type: "none" },
      }
    }

    if (key === "r") {
      return {
        shellState,
        effect: shellState.editorDirty ? { type: "none" } : { type: "refresh" },
      }
    }

    const intent = mapEditorIntent(key)
    if (intent !== null) {
      return {
        shellState,
        effect: { type: "editor-intent", intent },
      }
    }

    return {
      shellState,
      effect: { type: "none" },
    }
  }

  switch (key) {
    case "j":
    case "ArrowDown":
      shellState = moveSelection(shellState, noteSelectors, 1)
      return { shellState, effect: { type: "none" } }
    case "k":
    case "ArrowUp":
      shellState = moveSelection(shellState, noteSelectors, -1)
      return { shellState, effect: { type: "none" } }
    case "Enter":
      return {
        shellState: openSelectedNote(shellState),
        effect: { type: "none" },
      }
    case "i":
    case "e": {
      const nextState = enterEditorMode(shellState)
      return {
        shellState: nextState,
        effect: nextState.mode === "editor" ? { type: "enter-editor" } : { type: "none" },
      }
    }
    case "r":
      return {
        shellState,
        effect: { type: "refresh" },
      }
    default:
      return {
        shellState,
        effect: { type: "none" },
      }
  }
}
