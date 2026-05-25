import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  closeSearchEverything,
  createInitialTuiState,
  markEditorBodyChanged,
  markEditorSaved,
  openEditorForNote,
  openSearchEverything,
  type ManagerItem,
} from "../../../src/tui/state"

const note = {
  key: "daily-plan",
  title: "Daily Plan",
  description: "Today priorities.",
  relativePath: "notes/inbox/daily-plan.md",
  body: "- Write tests\n- Ship state model\n",
}

describe("TUI screen state", () => {
  test("initial state starts on the manager screen", () => {
    const state = createInitialTuiState()

    assert.equal(state.screen, "manager")
    assert.deepEqual(state.manager.items, [])
    assert.equal(state.manager.focusedIndex, 0)
    assert.equal(state.manager.selectedNoteKey, null)
    assert.equal(state.editor, null)
    assert.equal(state.search, null)
  })

  test("switches between manager, editor, and search while remembering the previous screen for cancellation", () => {
    const initial = createInitialTuiState()
    const searchingFromManager = openSearchEverything(initial, { query: "daily" })

    assert.equal(searchingFromManager.screen, "search")
    assert.equal(searchingFromManager.search?.query, "daily")
    assert.equal(searchingFromManager.search?.selectedIndex, 0)
    assert.equal(searchingFromManager.search?.previousScreen, "manager")
    assert.equal(closeSearchEverything(searchingFromManager).screen, "manager")

    const editing = openEditorForNote(initial, note)
    assert.equal(editing.screen, "editor")

    const searchingFromEditor = openSearchEverything(editing)
    assert.equal(searchingFromEditor.screen, "search")
    assert.equal(searchingFromEditor.search?.previousScreen, "editor")

    const backToEditor = closeSearchEverything(searchingFromEditor)
    assert.equal(backToEditor.screen, "editor")
    assert.equal(backToEditor.search, null)
    assert.equal(backToEditor.editor?.note.key, "daily-plan")
  })

  test("editor state tracks active note key/path/title/body plus dirty/saved status", () => {
    const editing = openEditorForNote(createInitialTuiState(), note)

    assert.equal(editing.editor?.note.key, "daily-plan")
    assert.equal(editing.editor?.note.relativePath, "notes/inbox/daily-plan.md")
    assert.equal(editing.editor?.note.title, "Daily Plan")
    assert.equal(editing.editor?.body, note.body)
    assert.equal(editing.editor?.savedBody, note.body)
    assert.equal(editing.editor?.dirty, false)

    const changed = markEditorBodyChanged(editing, "Updated body\n")
    assert.equal(changed.editor?.body, "Updated body\n")
    assert.equal(changed.editor?.savedBody, note.body)
    assert.equal(changed.editor?.dirty, true)

    const reverted = markEditorBodyChanged(changed, note.body)
    assert.equal(reverted.editor?.body, note.body)
    assert.equal(reverted.editor?.dirty, false)

    const changedAgain = markEditorBodyChanged(editing, "Updated body\n")
    const saved = markEditorSaved(changedAgain)
    assert.equal(saved.editor?.body, "Updated body\n")
    assert.equal(saved.editor?.savedBody, "Updated body\n")
    assert.equal(saved.editor?.note.body, "Updated body\n")
    assert.equal(saved.editor?.dirty, false)
  })

  test("state helpers avoid retaining caller-owned mutable objects", () => {
    const items: ManagerItem[] = [
      {
        type: "note",
        key: "daily-plan",
        filename: "daily-plan.md",
        title: "Daily Plan",
        description: "Today priorities.",
        relativePath: "notes/inbox/daily-plan.md",
      },
    ]
    const state = createInitialTuiState({ manager: { items } })
    items.push({
      type: "note",
      key: "later-note",
      filename: "later-note.md",
      title: "Later Note",
      description: "Should not leak into state.",
      relativePath: "notes/inbox/later-note.md",
    })

    assert.equal(state.manager.items.length, 1)

    const sourceNote = { ...note }
    const editing = openEditorForNote(createInitialTuiState(), sourceNote)
    sourceNote.body = "mutated outside state"

    assert.equal(editing.editor?.note.body, note.body)
    assert.equal(editing.editor?.body, note.body)
  })

  test("editor body helpers are no-ops when no editor is open", () => {
    const state = createInitialTuiState()

    assert.equal(markEditorBodyChanged(state, "ignored"), state)
    assert.equal(markEditorSaved(state), state)
  })

  test("manager state tracks focused item index and selected note key", () => {
    const items: ManagerItem[] = [
      {
        type: "folder",
        key: "notes/inbox",
        filename: "inbox",
        title: "Inbox",
        description: "2 notes",
        relativePath: "notes/inbox",
      },
      {
        type: "note",
        key: "daily-plan",
        filename: "daily-plan.md",
        title: "Daily Plan",
        description: "Today priorities.",
        relativePath: "notes/inbox/daily-plan.md",
      },
    ]

    const state = createInitialTuiState({
      manager: {
        items,
        focusedIndex: 1,
        selectedNoteKey: "daily-plan",
      },
    })

    assert.equal(state.screen, "manager")
    assert.equal(state.manager.focusedIndex, 1)
    assert.equal(state.manager.selectedNoteKey, "daily-plan")
    assert.deepEqual(state.manager.items, items)
  })
})
