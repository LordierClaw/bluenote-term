import { test } from "bun:test"
import assert from "node:assert/strict"

import { applyEditorIntent } from "../../../src/tui/editor/editor-input"
import { createEditorBuffer } from "../../../src/tui/editor/editor-buffer"
import { createInitialShellState } from "../../../src/tui/shell/shell-state"
import { enterEditorMode, openSelectedNote, selectNote } from "../../../src/tui/shell/shell-actions"

function createEditorState() {
  return enterEditorMode(openSelectedNote(selectNote(createInitialShellState(), "note-123")))
}

test("editor input mapping only mutates the buffer while the shell is in editor mode", () => {
  const navigationState = createInitialShellState()
  const editorState = createEditorState()
  const buffer = createEditorBuffer("Alpha")

  const unchanged = applyEditorIntent(navigationState, buffer, { kind: "insertText", text: "!" })
  const changed = applyEditorIntent(editorState, buffer, { kind: "insertText", text: "!" })

  assert.deepEqual(unchanged, buffer)
  assert.deepEqual(changed.lines, ["!Alpha"])
  assert.deepEqual(changed.cursor, { row: 0, column: 1 })
  assert.equal(changed.dirty, true)
})

test("editor input maps cursor and deletion intents to editor buffer operations", () => {
  const editorState = createEditorState()
  const buffer = {
    lines: ["Alpha", "Beta"],
    cursor: { row: 0, column: 5 },
    dirty: false,
  }

  const withNewline = applyEditorIntent(editorState, buffer, { kind: "newline" })
  const movedDown = applyEditorIntent(editorState, withNewline, { kind: "moveDown" })
  const deleted = applyEditorIntent(editorState, movedDown, { kind: "backspace" })

  assert.deepEqual(withNewline.lines, ["Alpha", "", "Beta"])
  assert.deepEqual(withNewline.cursor, { row: 1, column: 0 })
  assert.deepEqual(movedDown.cursor, { row: 2, column: 0 })
  assert.equal(movedDown.dirty, true)
  assert.deepEqual(deleted.lines, ["Alpha", "Beta"])
  assert.deepEqual(deleted.cursor, { row: 1, column: 0 })
})
