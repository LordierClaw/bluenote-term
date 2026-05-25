import { test } from "bun:test"
import assert from "node:assert/strict"

import { createInitialShellState } from "../../../src/tui/shell/shell-state"
import {
  clearTransientMessage,
  cycleFocus,
  enterEditorMode,
  openSelectedNote,
  selectNote,
  setTransientMessage,
} from "../../../src/tui/shell/shell-actions"

test("initial shell state starts in navigation mode with sidebar focus", () => {
  const state = createInitialShellState()

  assert.deepEqual(state, {
    mode: "navigation",
    focusRegion: "sidebar",
    selectedNoteKey: null,
    transientMessage: null,
    editorDirty: false,
  })
})

test("focus cycles predictably between sidebar and main pane", () => {
  const initialState = createInitialShellState()

  const mainPaneFocusedState = cycleFocus(initialState)
  const sidebarFocusedState = cycleFocus(mainPaneFocusedState)

  assert.equal(mainPaneFocusedState.focusRegion, "main")
  assert.equal(sidebarFocusedState.focusRegion, "sidebar")
  assert.equal(sidebarFocusedState.mode, "navigation")
})

test("opening a selected note moves the shell into note mode", () => {
  const state = selectNote(createInitialShellState(), "note-123")

  const nextState = openSelectedNote(state)

  assert.equal(nextState.selectedNoteKey, "note-123")
  assert.equal(nextState.mode, "note")
  assert.equal(nextState.focusRegion, "main")
})

test("entering editor mode without a selected note keeps the shell in navigation mode", () => {
  const state = createInitialShellState()

  const nextState = enterEditorMode(state)

  assert.equal(nextState.mode, "navigation")
  assert.equal(nextState.focusRegion, "sidebar")
  assert.equal(nextState.selectedNoteKey, null)
  assert.equal(nextState.editorDirty, false)
})

test("entering editor mode marks the editor as active for the selected note", () => {
  const state = openSelectedNote(selectNote(createInitialShellState(), "note-123"))

  const nextState = enterEditorMode(state)

  assert.equal(nextState.mode, "editor")
  assert.equal(nextState.focusRegion, "main")
  assert.equal(nextState.selectedNoteKey, "note-123")
  assert.equal(nextState.editorDirty, false)
})

test("status and error message slots can be set and cleared without affecting selection state", () => {
  const selectedState = selectNote(createInitialShellState(), "note-123")

  const statusState = setTransientMessage(selectedState, {
    level: "status",
    text: "Saved note",
  })

  const errorState = setTransientMessage(statusState, {
    level: "error",
    text: "Save failed",
  })

  const clearedState = clearTransientMessage(errorState)

  assert.equal(statusState.selectedNoteKey, "note-123")
  assert.deepEqual(statusState.transientMessage, {
    level: "status",
    text: "Saved note",
  })
  assert.equal(errorState.selectedNoteKey, "note-123")
  assert.deepEqual(errorState.transientMessage, {
    level: "error",
    text: "Save failed",
  })
  assert.equal(clearedState.selectedNoteKey, "note-123")
  assert.equal(clearedState.transientMessage, null)
})
