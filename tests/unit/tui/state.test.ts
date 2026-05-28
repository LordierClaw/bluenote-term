import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  clearManagerFilter,
  closeEditorFind,
  closeSearchEverything,
  closeTransientMode,
  createInitialTuiState,
  goToManagerParent,
  markAutosaveError,
  markAutosavePending,
  markAutosaveSaved,
  markAutosaveSaving,
  markEditorBodyChanged,
  markEditorSaved,
  openEditorFind,
  openEditorForNote,
  openManagerCreate,
  openSearchEverything,
  setManagerCreateTitle,
  setManagerFilter,
  setManagerFolderPath,
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

  test("tracks interaction mode separately from screen", () => {
    const manager = createInitialTuiState()
    assert.equal(manager.screen, "manager")
    assert.equal(manager.mode, "manager.browse")

    const filtering = setManagerFilter(manager, "daily")
    assert.equal(filtering.screen, "manager")
    assert.equal(filtering.mode, "manager.filter")

    const editing = openEditorForNote(manager, note)
    assert.equal(editing.screen, "editor")
    assert.equal(editing.mode, "editor.body")

    const finding = openEditorFind(editing, { query: "tests", matchCount: 2, activeIndex: 1 })
    assert.equal(finding.screen, "editor")
    assert.equal(finding.mode, "editor.find")
    assert.equal(closeEditorFind(finding).mode, "editor.body")

    const replacing = openEditorFind(editing, { mode: "editor.replace" })
    assert.equal(replacing.screen, "editor")
    assert.equal(replacing.mode, "editor.replace")

    const searching = openSearchEverything(finding, { query: "plan" })
    assert.equal(searching.screen, "search")
    assert.equal(searching.mode, "search.input")
  })

  test("manager create mode stores a single focused title draft and can be cancelled", () => {
    const manager = createInitialTuiState()
    const creating = openManagerCreate(manager)

    assert.equal(creating.screen, "manager")
    assert.equal(creating.mode, "manager.create")
    assert.deepEqual(creating.manager.createDraft, {
      title: "",
      status: null,
    })

    const typed = setManagerCreateTitle(creating, "Project Plan")
    assert.equal(typed.manager.createDraft?.title, "Project Plan")
    assert.equal(typed.manager.createDraft?.status, null)

    const cancelled = closeTransientMode(typed)
    assert.equal(cancelled.mode, "manager.browse")
    assert.equal(cancelled.manager.createDraft, null)
  })

  test("Search Everything stores and restores previous screen and mode", () => {
    const editing = openEditorFind(openEditorForNote(createInitialTuiState(), note), {
      query: "tests",
      matchCount: 1,
      activeIndex: 0,
    })

    const searching = openSearchEverything(editing, { query: "daily" })

    assert.equal(searching.screen, "search")
    assert.equal(searching.mode, "search.input")
    assert.equal(searching.search?.previousScreen, "editor")
    assert.equal(searching.search?.previousMode, "editor.find")

    const cancelled = closeSearchEverything(searching)
    assert.equal(cancelled.screen, "editor")
    assert.equal(cancelled.mode, "editor.find")
    assert.equal(cancelled.search, null)
    assert.equal(cancelled.editor?.findQuery, "tests")
  })

  test("Search Everything preview visibility defaults visible and status defaults empty", () => {
    const searching = openSearchEverything(createInitialTuiState(), { query: "/archive" })

    assert.equal(searching.search?.previewVisible, true)
    assert.equal(searching.search?.status, null)
  })

  test("manager state tracks folder path, hover path, filter query, and parent navigation", () => {
    const state = createInitialTuiState({
      manager: {
        currentFolderPath: "notes/projects/api",
        hoveredPath: "notes/projects/api/roadmap.md",
        filterQuery: "road",
      },
    })

    assert.equal(state.manager.currentFolderPath, "notes/projects/api")
    assert.equal(state.manager.hoveredPath, "notes/projects/api/roadmap.md")
    assert.equal(state.manager.filterQuery, "road")

    const parent = goToManagerParent(state)
    assert.equal(parent.manager.currentFolderPath, "notes/projects")
    assert.equal(parent.manager.hoveredPath, null)
    assert.equal(parent.manager.focusedIndex, 0)
    assert.equal(parent.mode, "manager.browse")

    const root = goToManagerParent(setManagerFolderPath(parent, ""))
    assert.equal(root.manager.currentFolderPath, "")

    const filtering = setManagerFilter(parent, "daily")
    assert.equal(filtering.manager.filterQuery, "daily")
    assert.equal(filtering.mode, "manager.filter")

    const cleared = clearManagerFilter(filtering)
    assert.equal(cleared.manager.filterQuery, "")
    assert.equal(cleared.mode, "manager.browse")
  })

  test("editor tracks find metadata and autosave status", () => {
    const editing = openEditorForNote(createInitialTuiState(), note)
    assert.equal(editing.editor?.findQuery, "")
    assert.equal(editing.editor?.findMatchCount, 0)
    assert.equal(editing.editor?.activeFindIndex, null)
    assert.equal(editing.editor?.autosaveStatus, "idle")

    const finding = openEditorFind(editing, { query: "tests", matchCount: 3, activeIndex: 0 })
    assert.equal(finding.editor?.findQuery, "tests")
    assert.equal(finding.editor?.findMatchCount, 3)
    assert.equal(finding.editor?.activeFindIndex, 0)

    const clearedFindIndex = openEditorFind(finding, { activeIndex: null })
    assert.equal(clearedFindIndex.editor?.activeFindIndex, null)

    assert.equal(markAutosavePending(editing).editor?.autosaveStatus, "pending")
    assert.equal(markAutosaveSaving(editing).editor?.autosaveStatus, "saving")
    assert.equal(markAutosaveSaved(markEditorBodyChanged(editing, "Updated\n")).editor?.autosaveStatus, "saved")
    assert.equal(markAutosaveError(editing).editor?.autosaveStatus, "error")
  })

  test("back helper closes transient modes before leaving stable screens", () => {
    const filtering = setManagerFilter(createInitialTuiState(), "daily")
    const managerBrowse = closeTransientMode(filtering)
    assert.equal(managerBrowse.screen, "manager")
    assert.equal(managerBrowse.mode, "manager.browse")
    assert.equal(managerBrowse.manager.filterQuery, "")

    const finding = openEditorFind(openEditorForNote(managerBrowse, note), { query: "tests" })
    const editorBody = closeTransientMode(finding)
    assert.equal(editorBody.screen, "editor")
    assert.equal(editorBody.mode, "editor.body")

    const searching = openSearchEverything(finding)
    const backToFind = closeTransientMode(searching)
    assert.equal(backToFind.screen, "editor")
    assert.equal(backToFind.mode, "editor.find")

    assert.equal(closeTransientMode(managerBrowse), managerBrowse)
  })
})
