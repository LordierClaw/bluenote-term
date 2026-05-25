import { test } from "bun:test"
import assert from "node:assert/strict"

import {
  backspace,
  createEditorBuffer,
  deleteForward,
  getEditorText,
  insertCharacter,
  insertNewline,
  moveCursorDown,
  moveCursorLeft,
  moveCursorRight,
  moveCursorUp,
} from "../../../src/tui/editor/editor-buffer"

test("editor buffer initializes from note body text and preserves line structure", () => {
  const buffer = createEditorBuffer("Alpha line\nBeta line\n")

  assert.deepEqual(buffer, {
    lines: ["Alpha line", "Beta line", ""],
    cursor: { row: 0, column: 0 },
    dirty: false,
  })
  assert.equal(getEditorText(buffer), "Alpha line\nBeta line\n")
})

test("inserting characters updates the current line and cursor position", () => {
  const buffer = insertCharacter(createEditorBuffer("Alpha"), "!")

  assert.deepEqual(buffer.lines, ["!Alpha"])
  assert.deepEqual(buffer.cursor, { row: 0, column: 1 })
  assert.equal(buffer.dirty, true)
})

test("backspace and delete update text safely at line boundaries", () => {
  const mergedByBackspace = backspace({
    lines: ["Alpha", "Beta"],
    cursor: { row: 1, column: 0 },
    dirty: false,
  })
  const mergedByDelete = deleteForward({
    lines: ["Alpha", "Beta"],
    cursor: { row: 0, column: 5 },
    dirty: false,
  })

  assert.equal(getEditorText(mergedByBackspace), "AlphaBeta")
  assert.deepEqual(mergedByBackspace.cursor, { row: 0, column: 5 })
  assert.equal(mergedByBackspace.dirty, true)
  assert.equal(getEditorText(mergedByDelete), "AlphaBeta")
  assert.deepEqual(mergedByDelete.cursor, { row: 0, column: 5 })
  assert.equal(mergedByDelete.dirty, true)
})

test("arrow movement stays within valid row and column bounds", () => {
  const buffer = {
    lines: ["Alpha", "B", "Gamma"],
    cursor: { row: 0, column: 0 },
    dirty: false,
  }

  const movedLeft = moveCursorLeft(buffer)
  const movedUp = moveCursorUp(buffer)
  const movedRight = moveCursorRight(moveCursorRight(buffer))
  const movedDown = moveCursorDown({ ...movedRight, cursor: { row: 0, column: 5 } })

  assert.deepEqual(movedLeft.cursor, { row: 0, column: 0 })
  assert.deepEqual(movedUp.cursor, { row: 0, column: 0 })
  assert.deepEqual(movedRight.cursor, { row: 0, column: 2 })
  assert.deepEqual(movedDown.cursor, { row: 1, column: 1 })
  assert.equal(movedDown.dirty, false)
})

test("dirty state stays false for pure cursor movement and flips true for newline insertion", () => {
  const moved = moveCursorRight(createEditorBuffer("Alpha"))
  const inserted = insertNewline({ ...moved, cursor: { row: 0, column: 5 } })

  assert.equal(moved.dirty, false)
  assert.deepEqual(inserted.lines, ["Alpha", ""])
  assert.deepEqual(inserted.cursor, { row: 1, column: 0 })
  assert.equal(inserted.dirty, true)
})
