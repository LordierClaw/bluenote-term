import { test } from "bun:test"
import assert from "node:assert/strict"

import {
  dispatchShellKey,
  type ShellKeyInput,
} from "../../../src/tui/shell/shell-keymap"
import { enterEditorMode, openSelectedNote, selectNote } from "../../../src/tui/shell/shell-actions"
import { createInitialShellState } from "../../../src/tui/shell/shell-state"

function applyKey(key: ShellKeyInput, state = createInitialShellState(), noteSelectors = ["alpha", "beta", "gamma"]) {
  return dispatchShellKey({
    key,
    shellState: state,
    noteSelectors,
  })
}

test("j/k and arrow keys move selection in navigation mode", () => {
  const selected = selectNote(createInitialShellState(), "alpha")

  const down = applyKey("j", selected)
  const downArrow = applyKey("ArrowDown", down.shellState)
  const up = applyKey("k", downArrow.shellState)
  const upArrow = applyKey("ArrowUp", up.shellState)

  assert.equal(down.shellState.selectedNoteSelector, "beta")
  assert.equal(downArrow.shellState.selectedNoteSelector, "gamma")
  assert.equal(up.shellState.selectedNoteSelector, "beta")
  assert.equal(upArrow.shellState.selectedNoteSelector, "alpha")
})

test("tab cycles focus regions", () => {
  const first = applyKey("Tab")
  const second = applyKey("Tab", first.shellState)

  assert.equal(first.shellState.focusRegion, "main")
  assert.equal(second.shellState.focusRegion, "sidebar")
})

test("enter opens and focuses the selected note", () => {
  const navigationState = selectNote(createInitialShellState(), "beta")

  const result = applyKey("Enter", navigationState)

  assert.equal(result.shellState.mode, "note")
  assert.equal(result.shellState.focusRegion, "main")
  assert.equal(result.shellState.selectedNoteSelector, "beta")
})

test("escape returns from note mode to navigation so movement keys work again", () => {
  const noteState = openSelectedNote(selectNote(createInitialShellState(), "beta"))

  const escaped = applyKey("Escape", noteState)
  const down = applyKey("j", escaped.shellState)
  const up = applyKey("ArrowUp", down.shellState)

  assert.equal(escaped.shellState.mode, "navigation")
  assert.equal(escaped.shellState.focusRegion, "sidebar")
  assert.equal(escaped.shellState.selectedNoteSelector, "beta")
  assert.equal(down.shellState.selectedNoteSelector, "gamma")
  assert.equal(up.shellState.selectedNoteSelector, "beta")
})

test("escape is inert in editor mode so note-navigation-note focus stays consistent", () => {
  const editorState = enterEditorMode(openSelectedNote(selectNote(createInitialShellState(), "beta")))

  const result = applyKey("Escape", editorState)

  assert.equal(result.shellState.mode, "editor")
  assert.equal(result.shellState.focusRegion, "main")
  assert.equal(result.shellState.selectedNoteSelector, "beta")
  assert.equal(result.effect.type, "none")
})

test("i or e enters editor mode for inline editing", () => {
  const noteState = openSelectedNote(selectNote(createInitialShellState(), "beta"))

  const insertMode = applyKey("i", noteState)
  const editMode = applyKey("e", noteState)

  assert.equal(insertMode.shellState.mode, "editor")
  assert.equal(editMode.shellState.mode, "editor")
  assert.equal(insertMode.effect.type, "enter-editor")
  assert.equal(editMode.effect.type, "enter-editor")
})

test("save and discard shortcuts only emit actions when the editor buffer is dirty", () => {
  const cleanEditor = {
    ...openSelectedNote(selectNote(createInitialShellState(), "beta")),
    mode: "editor" as const,
    focusRegion: "main" as const,
    editorDirty: false,
  }
  const dirtyEditor = {
    ...cleanEditor,
    editorDirty: true,
  }

  const cleanSave = applyKey("Ctrl+S", cleanEditor)
  const dirtySave = applyKey("Ctrl+S", dirtyEditor)
  const cleanDiscard = applyKey("Ctrl+D", cleanEditor)
  const dirtyDiscard = applyKey("Ctrl+D", dirtyEditor)

  assert.equal(cleanSave.effect.type, "none")
  assert.equal(cleanDiscard.effect.type, "none")
  assert.equal(dirtySave.effect.type, "save")
  assert.equal(dirtyDiscard.effect.type, "discard")
})

test("backspace and delete route to editor intents only while editing", () => {
  const noteState = openSelectedNote(selectNote(createInitialShellState(), "beta"))
  const editorState = enterEditorMode(noteState)

  const editorBackspace = applyKey("Backspace", editorState)
  const editorDelete = applyKey("Delete", editorState)
  const noteBackspace = applyKey("Backspace", noteState)
  const noteDelete = applyKey("Delete", noteState)
  const navigationBackspace = applyKey("Backspace")
  const navigationDelete = applyKey("Delete")

  assert.deepEqual(editorBackspace.effect, { type: "editor-intent", intent: { kind: "backspace" } })
  assert.deepEqual(editorDelete.effect, { type: "editor-intent", intent: { kind: "deleteForward" } })
  assert.equal(noteBackspace.effect.type, "none")
  assert.equal(noteDelete.effect.type, "none")
  assert.equal(navigationBackspace.effect.type, "none")
  assert.equal(navigationDelete.effect.type, "none")
})

test("question mark toggles help state and q quits cleanly from non-dirty states", () => {
  const helpOn = applyKey("?", createInitialShellState())
  const helpOff = applyKey("?", helpOn.shellState)
  const quit = applyKey("q", createInitialShellState())

  assert.equal(helpOn.shellState.helpVisible, true)
  assert.equal(helpOff.shellState.helpVisible, false)
  assert.equal(quit.effect.type, "quit")
})

test("quit from a dirty buffer requires an explicit discard or save path", () => {
  const dirtyEditor = {
    ...openSelectedNote(selectNote(createInitialShellState(), "beta")),
    mode: "editor" as const,
    focusRegion: "main" as const,
    editorDirty: true,
  }

  const result = applyKey("q", dirtyEditor)

  assert.equal(result.effect.type, "none")
  assert.equal(result.shellState.mode, "editor")
  assert.deepEqual(result.shellState.transientMessage, {
    level: "error",
    text: "Unsaved changes. Save with Ctrl+S or discard with Ctrl+D before quitting.",
  })
})
