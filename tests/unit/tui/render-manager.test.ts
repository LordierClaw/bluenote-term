import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import { buildManagerViewModel } from "../../../src/tui/render-manager"
import { createInitialTuiState } from "../../../src/tui/state"

describe("manager renderer view model", () => {
  test("shows create-folder action only under note folders", () => {
    const noteState = createInitialTuiState({ manager: { currentFolderPath: "note/work", canCreateFolder: true } })
    const draftState = createInitialTuiState({ manager: { currentFolderPath: "draft", canCreateFolder: false } })
    const rootState = createInitialTuiState({ manager: { currentFolderPath: "", canCreateFolder: false } })
    const legacyState = createInitialTuiState({ manager: { currentFolderPath: "notes/inbox", canCreateFolder: false } })

    assert.equal(buildManagerViewModel(noteState).shortcuts.some((shortcut) => shortcut.includes("[n]") && shortcut.includes("New")), true)
    assert.equal(buildManagerViewModel(draftState).shortcuts.some((shortcut) => shortcut.includes("[n]") && shortcut.includes("New")), false)
    assert.equal(buildManagerViewModel(rootState).shortcuts.some((shortcut) => shortcut.includes("[n]") && shortcut.includes("New")), false)
    assert.equal(buildManagerViewModel(legacyState).shortcuts.some((shortcut) => shortcut.includes("[n]") && shortcut.includes("New")), false)
  })

  test("empty manager states advertise create only when folder creation is available", () => {
    const noteState = createInitialTuiState({ manager: { currentFolderPath: "note/work", canCreateFolder: true, items: [] } })
    const draftState = createInitialTuiState({ manager: { currentFolderPath: "draft", canCreateFolder: false, items: [] } })
    const rootState = createInitialTuiState({ manager: { currentFolderPath: "", canCreateFolder: false, items: [] } })

    assert.deepEqual(buildManagerViewModel(noteState).layout1.emptyState?.actions, ["[n] New", "[Ctrl+P] Search"])
    assert.deepEqual(buildManagerViewModel(draftState).layout1.emptyState?.actions, ["[Ctrl+P] Search"])
    assert.deepEqual(buildManagerViewModel(rootState).layout1.emptyState?.actions, ["[Ctrl+P] Search"])
    assert.match(buildManagerViewModel(noteState).layout1.emptyState?.body ?? "", /Create a folder/)
    assert.doesNotMatch(buildManagerViewModel(draftState).layout1.emptyState?.body ?? "", /Create a note|Create a folder/)
  })

  test("labels the manager create prompt as folder creation without note metadata", () => {
    const state = createInitialTuiState({
      manager: {
        currentFolderPath: "note/work/projects",
        canCreateFolder: true,
        createDraft: { title: "client-a", status: null },
      },
    })
    state.mode = "manager.create"

    const prompt = buildManagerViewModel(state).createPrompt

    assert.equal(prompt?.sheetTitle, "New folder")
    assert.equal(prompt?.description, "Create a folder in this workspace.")
    assert.equal(prompt?.destinationLabel, "Create in: note/work/projects")
    assert.equal(prompt?.inputLabel, "Folder name:")
    assert.equal(prompt?.placeholder, "Folder name…")
  })
})
