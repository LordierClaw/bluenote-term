import type { ShellState } from "../shell/shell-state"
import {
  backspace,
  deleteForward,
  insertCharacter,
  insertNewline,
  moveCursorDown,
  moveCursorLeft,
  moveCursorRight,
  moveCursorUp,
  type EditorBuffer,
} from "./editor-buffer"

export type EditorIntent =
  | { kind: "insertText"; text: string }
  | { kind: "newline" }
  | { kind: "backspace" }
  | { kind: "deleteForward" }
  | { kind: "moveLeft" }
  | { kind: "moveRight" }
  | { kind: "moveUp" }
  | { kind: "moveDown" }

export function applyEditorIntent(state: ShellState, buffer: EditorBuffer, intent: EditorIntent): EditorBuffer {
  if (state.mode !== "editor") {
    return buffer
  }

  switch (intent.kind) {
    case "insertText":
      return insertCharacter(buffer, intent.text)
    case "newline":
      return insertNewline(buffer)
    case "backspace":
      return backspace(buffer)
    case "deleteForward":
      return deleteForward(buffer)
    case "moveLeft":
      return moveCursorLeft(buffer)
    case "moveRight":
      return moveCursorRight(buffer)
    case "moveUp":
      return moveCursorUp(buffer)
    case "moveDown":
      return moveCursorDown(buffer)
  }
}
