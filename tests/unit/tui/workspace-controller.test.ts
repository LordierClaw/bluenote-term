import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  createWorkspaceController,
  editorRequiresDestructiveConfirmation,
  type WorkspaceControllerDependencies,
} from "../../../src/tui/workspace-controller"
import { buildManagerViewModel, routeManagerKey } from "../../../src/tui/render-manager"
import type { NoteManagerSummary } from "../../../src/tui/adapters/note-manager-adapter"
import type { SearchEverythingResult } from "../../../src/tui/adapters/search-everything-adapter"
import { createInitialTuiState, type TuiNote } from "../../../src/tui/state"

function createFakeScheduler() {
  type ScheduledTask = { id: number; callback: () => void; delay: number; cleared: boolean }
  const tasks: ScheduledTask[] = []
  let nextId = 1

  return {
    tasks,
    setTimeout(callback: () => void, delay: number) {
      const task = { id: nextId++, callback, delay, cleared: false }
      tasks.push(task)
      return task.id
    },
    clearTimeout(handle: unknown) {
      const task = tasks.find((candidate) => candidate.id === handle)
      if (task) {
        task.cleared = true
      }
    },
    runNext() {
      const task = tasks.find((candidate) => !candidate.cleared)
      if (!task) {
        throw new Error("No scheduled task to run")
      }
      task.cleared = true
      task.callback()
    },
    activeTasks() {
      return tasks.filter((task) => !task.cleared)
    },
  }
}

const noteSummaries: NoteManagerSummary[] = [
  {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities.",
    relativePath: "notes/inbox/daily-plan.md",
    body: "Original daily body",
  },
  {
    key: "archive-review",
    title: "Archive Review",
    description: "Old ideas.",
    relativePath: "notes/archive/archive-review.md",
    body: "Archive body",
  },
]

const notesByKey: Record<string, TuiNote> = {
  "daily-plan": {
    key: "daily-plan",
    title: "Daily Plan",
    description: "Today priorities.",
    relativePath: "notes/inbox/daily-plan.md",
    body: "Original daily body",
  },
  "archive-review": {
    key: "archive-review",
    title: "Archive Review",
    description: "Old ideas.",
    relativePath: "notes/archive/archive-review.md",
    body: "Archive body",
  },
}

function createDeps(overrides: Partial<WorkspaceControllerDependencies> = {}) {
  const calls: string[] = []
  const deps: WorkspaceControllerDependencies = {
    listNotes: () => {
      calls.push("list")
      return noteSummaries
    },
    showNote: (selector) => {
      calls.push(`show:${selector}`)
      return notesByKey[selector]
    },
    searchNotes: (query) => {
      calls.push(`search:${query}`)
      return []
    },
    commandHandlers: {
      "/new": () => {
        calls.push("command:/new")
      },
      "/archive": () => {
        calls.push("command:/archive")
      },
      "/delete": () => {
        calls.push("command:/delete")
      },
      "/rebuild": () => {
        calls.push("command:/rebuild")
      },
    },
    ...overrides,
  }

  return { deps, calls }
}

function commandResult(name: "/new" | "/archive" | "/delete" | "/rebuild" | "/quit"): SearchEverythingResult {
  return {
    kind: "command",
    id: `command:${name}`,
    label: name,
    detail: `Run ${name}`,
    score: 120,
    name,
    description: `Run ${name}`,
    usage: name,
  }
}

function openInboxDaily(controller: ReturnType<typeof createWorkspaceController>): void {
  controller.focusManagerItem(1)
  controller.openFocusedManagerItem()
  controller.focusManagerItem(0)
  controller.openFocusedManagerItem()
}

function openArchiveReview(controller: ReturnType<typeof createWorkspaceController>, options?: { confirmed?: boolean }) {
  controller.showManager()
  if (controller.getState().manager.currentFolderPath !== "") {
    controller.goBack()
  }
  controller.focusManagerItem(0)
  controller.openFocusedManagerItem()
  controller.focusManagerItem(0)
  return controller.openFocusedManagerItem(options)
}

describe("TUI workspace controller", () => {
  test("initial TUI manager preview visibility defaults to visible", () => {
    assert.equal(createInitialTuiState().manager.previewVisible, true)
  })

  test("starts on manager and loads manager items from the adapter", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    assert.equal(controller.getState().screen, "manager")
    assert.deepEqual(
      controller.getState().manager.items.map((item) => `${item.type}:${item.key}`),
      ["folder:notes/archive", "folder:notes/inbox"],
    )
    assert.deepEqual(calls, ["list"])
  })

  test("toggles manager preview visibility without changing manager selection, filter, folder, or editor", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)
    controller.updateEditorBody("Dirty daily body")
    controller.showManager()
    controller.openManagerFilter()
    controller.updateManagerFilter("daily")

    const before = controller.getState()
    controller.toggleManagerPreview()
    const after = controller.getState()

    assert.equal(after.manager.previewVisible, false)
    assert.equal(after.manager.focusedIndex, before.manager.focusedIndex)
    assert.equal(after.manager.currentFolderPath, before.manager.currentFolderPath)
    assert.equal(after.manager.filterQuery, before.manager.filterQuery)
    assert.deepEqual(after.editor, before.editor)
    assert.equal(after.manager.selectedNoteKey, before.manager.selectedNoteKey)
  })

  test("responsive manager preview visibility setter does not dirty/open/close notes", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)
    openInboxDaily(controller)
    controller.showManager()

    const before = controller.getState()
    controller.setManagerPreviewVisible(false)
    const hidden = controller.getState()
    controller.setManagerPreviewVisible(false)
    const hiddenAgain = controller.getState()
    controller.setManagerPreviewVisible(true)
    const shown = controller.getState()

    assert.equal(hidden.manager.previewVisible, false)
    assert.equal(hiddenAgain.manager.previewVisible, false)
    assert.equal(shown.manager.previewVisible, true)
    assert.deepEqual(hidden.editor, before.editor)
    assert.equal(hidden.editor?.dirty, false)
    assert.equal(hidden.screen, before.screen)
    assert.equal(hidden.manager.selectedNoteKey, before.manager.selectedNoteKey)
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("toggles Search Everything preview visibility independently from manager preview visibility", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.setManagerPreviewVisible(false)
    controller.openSearch("daily")
    assert.equal(controller.getState().search?.previewVisible, true)
    assert.equal(controller.getState().manager.previewVisible, false)

    controller.toggleSearchPreview()
    assert.equal(controller.getState().search?.previewVisible, false)
    assert.equal(controller.getState().manager.previewVisible, false)

    controller.setSearchPreviewVisible(true)
    assert.equal(controller.getState().search?.previewVisible, true)
    assert.equal(controller.getState().manager.previewVisible, false)
  })

  test("hidden manager previews do not hydrate the focused note body", () => {
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return notesByKey[selector]
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    controller.setManagerPreviewVisible(false)
    const model = controller.getManagerBrowserModel()

    assert.deepEqual(calls, ["list"])
    assert.deepEqual(model.preview, { type: "hidden", path: "notes/inbox/daily-plan.md", reason: "manual" })
  })

  test("manager preview hydrates a focused note at most once per note during a session", () => {
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return notesByKey[selector]
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    const first = controller.getManagerBrowserModel().preview
    const second = controller.getManagerBrowserModel().preview
    const third = controller.getManagerBrowserModel().preview

    assert.equal(first.type, "note-content")
    assert.deepEqual(first, second)
    assert.deepEqual(second, third)
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("moving between folder rows never hydrates manager preview note bodies", () => {
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return notesByKey[selector]
      },
    }).deps)

    controller.focusManagerItem(0)
    controller.getManagerBrowserModel()
    controller.focusManagerItem(1)
    controller.getManagerBrowserModel()
    controller.moveManagerSelection("up")
    controller.getManagerBrowserModel()

    assert.deepEqual(calls, ["list"])
  })

  test("refreshing manager invalidates cached hydrated previews", () => {
    let currentBody = "Original cached body"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return { ...notesByKey[selector], body: currentBody }
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original cached body"])

    currentBody = "Changed body after refresh"
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original cached body"])
    controller.refreshManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Changed body after refresh"])
    assert.deepEqual(calls, ["list", "show:daily-plan", "list", "show:daily-plan"])
  })

  test("failed manager refresh still drops stale hydrated preview cache before the next successful refresh", () => {
    let currentBody = "Original cached body"
    let failNextList = false
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        if (failNextList) {
          failNextList = false
          throw new Error("list failed after storage changed")
        }
        return summariesWithoutBodies
      },
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original cached body"])

    currentBody = "Changed body after failed refresh"
    failNextList = true
    assert.throws(() => controller.refreshManager(), /list failed/)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Changed body after failed refresh"])
    controller.refreshManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Changed body after failed refresh"])
  })

  test("failed editor saves clear stale hydrated manager preview cache after partial persistence", async () => {
    let currentBody = "Cached body before failed save"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => summariesWithoutBodies,
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
      persistEditorBody: (_note, body) => {
        currentBody = body
        throw new Error("disk failed after partial write")
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed save"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Partially persisted body after failed save")
    const result = await controller.saveEditor()

    assert.deepEqual(result, { blocked: true, reason: "dirty-editor" })
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Partially persisted body after failed save"])
  })

  test("successful editor saves update the hydrated manager preview cache for the saved note", async () => {
    let currentBody = "Cached body before save"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return { ...notesByKey[selector], body: currentBody }
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before save"])

    const openResult = controller.openFocusedManagerItem()
    assert.equal(openResult.blocked, false)
    controller.updateEditorBody("Saved body should replace cached preview")
    await controller.saveEditor()

    currentBody = "Stale body from showNote should not be needed"
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Saved body should replace cached preview"])
    assert.deepEqual(calls, ["list", "show:daily-plan", "show:daily-plan"])
  })

  test("failed autosaves clear stale hydrated manager preview cache after partial persistence", async () => {
    const scheduler = createFakeScheduler()
    let currentBody = "Cached body before failed autosave"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      autosaveScheduler: scheduler,
      listNotes: () => summariesWithoutBodies,
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
      persistEditorBody: (_note, body) => {
        currentBody = body
        throw new Error("disk failed after partial autosave")
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed autosave"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Partially persisted body after failed autosave")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(controller.getState().editor?.autosaveStatus, "error")
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Partially persisted body after failed autosave"])
  })

  test("successful autosaves update the hydrated manager preview cache for the saved note", async () => {
    const scheduler = createFakeScheduler()
    let currentBody = "Cached body before autosave"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const calls: string[] = []
    const controller = createWorkspaceController(createDeps({
      autosaveScheduler: scheduler,
      listNotes: () => {
        calls.push("list")
        return summariesWithoutBodies
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return { ...notesByKey[selector], body: currentBody }
      },
      persistEditorBody: (note, body) => ({ ...note, body }),
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before autosave"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Autosaved body should replace cached preview")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    currentBody = "Stale body from showNote should not be needed"
    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Autosaved body should replace cached preview"])
    assert.deepEqual(calls, ["list", "show:daily-plan", "show:daily-plan"])
  })

  test("successful saves update manager preview summaries that already include note bodies", async () => {
    const { deps } = createDeps({ persistEditorBody: (note, body) => ({ ...note, body }) })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original daily body"])

    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.updateEditorBody("Saved body should replace summary body")
    await controller.saveEditor()

    controller.showManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Saved body should replace summary body"])
  })

  test("switches manager to editor by opening the selected note", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")
    controller.focusManagerItem(0)
    const result = controller.openFocusedManagerItem()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().editor?.body, "Original daily body")
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("controlled editor input mutates at cursor and preserves autosave behavior", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText("!")
    assert.equal(controller.getState().editor?.body, "Original daily body!")
    controller.moveEditorCursor("left")
    controller.insertEditorText(" before bang")
    assert.equal(controller.getState().editor?.body, "Original daily body before bang!")
    controller.backspaceEditor()
    assert.equal(controller.getState().editor?.body, "Original daily body before ban!")
    controller.deleteEditor()
    assert.equal(controller.getState().editor?.body, "Original daily body before ban")
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])
  })

  test("cursor-aware no-op edits do not reschedule autosave for unchanged dirty body", () => {
    const scheduler = createFakeScheduler()
    const invalidations: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      onAutosaveStateChange: () => invalidations.push(controller.getState().editor?.autosaveStatus ?? "none"),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText("!")
    const pendingBeforeNoop = scheduler.activeTasks()[0]
    assert.ok(pendingBeforeNoop)
    assert.deepEqual(invalidations, ["pending"])

    controller.moveEditorCursor("home")
    controller.backspaceEditor()

    assert.equal(controller.getState().editor?.body, "Original daily body!")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(scheduler.activeTasks(), [pendingBeforeNoop])
    assert.deepEqual(invalidations, ["pending"])
  })

  test("manual save preserves controlled cursor metadata", async () => {
    const { deps } = createDeps({
      persistEditorBody: (note, body) => ({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText("!")
    controller.moveEditorCursor("left")
    controller.insertEditorText(" before bang")
    const beforeSave = controller.getState().editor
    assert.equal(beforeSave?.cursorOffset, Array.from("Original daily body before bang").length)

    await controller.saveEditor()

    const afterSave = controller.getState().editor
    assert.equal(afterSave?.dirty, false)
    assert.equal(afterSave?.autosaveStatus, "saved")
    assert.equal(afterSave?.cursorOffset, beforeSave?.cursorOffset)
    assert.equal(afterSave?.selectionStart, beforeSave?.selectionStart)
    assert.equal(afterSave?.selectionEnd, beforeSave?.selectionEnd)
    assert.equal(afterSave?.preferredColumn, beforeSave?.preferredColumn)
    assert.equal(afterSave?.wrapMode, beforeSave?.wrapMode)
  })

  test("toggles editor wrap mode without marking the editor dirty", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    assert.equal(controller.getState().editor?.wrapMode, "word")

    controller.toggleEditorWrapMode()
    assert.equal(controller.getState().editor?.wrapMode, "none")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "idle")

    controller.toggleEditorWrapMode()
    assert.equal(controller.getState().editor?.wrapMode, "word")
    assert.equal(controller.getState().editor?.dirty, false)
  })

  test("switches editor and manager with shortcut actions while preserving dirty editor state", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Dirty daily body")

    controller.showManager()
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.dirty, true)

    controller.showEditor()
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.body, "Dirty daily body")
    assert.equal(controller.getState().editor?.dirty, true)
  })

  test("opens Search Everything from manager or editor and cancels back to the invoking screen", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openSearch("daily")
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.previousScreen, "manager")
    controller.cancelSearch()
    assert.equal(controller.getState().screen, "manager")

    openInboxDaily(controller)
    controller.openSearch("archive")
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.previousScreen, "editor")
    controller.cancelSearch()
    assert.equal(controller.getState().screen, "editor")
  })

  test("routes selected Search Everything note results to editor, folder results to manager, and command results to handlers", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openSearch("archive")
    controller.selectSearchResult({
      kind: "note",
      id: "note:archive-review",
      key: "archive-review",
      filename: "archive-review.md",
      title: "Archive Review",
      description: "Old ideas.",
      relativePath: "notes/archive/archive-review.md",
      label: "Archive Review",
      detail: "archive-review.md — notes/archive/archive-review.md",
      score: 100,
      matchedFields: ["title"],
    })
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "archive-review")

    controller.openSearch("inbox")
    controller.selectSearchResult({
      kind: "folder",
      id: "folder:notes/inbox",
      path: "notes/inbox",
      name: "inbox",
      label: "inbox/",
      detail: "1 note in notes/inbox",
      score: 90,
      noteCount: 1,
    })
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")

    controller.openSearch("/new")
    controller.selectSearchResult(commandResult("/new"))
    assert.deepEqual(calls, ["list", "search:archive", "show:archive-review", "search:inbox", "search:/new", "command:/new"])
  })

  test("blocks destructive actions or screen switches that would lose dirty editor content unless confirmed", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.showManager()
    controller.goBack()
    controller.focusManagerItem(0)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)

    const blockedSwitch = controller.openFocusedManagerItem()
    assert.equal(blockedSwitch.blocked, true)
    assert.equal(blockedSwitch.reason, "dirty-editor")
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().editor?.dirty, true)

    const confirmedSwitch = controller.openFocusedManagerItem({ confirmed: true })
    assert.equal(confirmedSwitch.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "archive-review")

    controller.updateEditorBody("Unsaved archive body")
    const blockedDelete = controller.runCommand("/delete")
    assert.equal(blockedDelete.blocked, true)
    assert.equal(blockedDelete.reason, "dirty-editor")
    assert.equal(calls.includes("command:/delete"), false)

    const blockedDeleteWithArgument = controller.runCommand("/delete archive-review")
    assert.equal(blockedDeleteWithArgument.blocked, true)
    assert.equal(blockedDeleteWithArgument.reason, "dirty-editor")
    assert.equal(calls.includes("command:/delete"), false)

    const confirmedDelete = controller.runCommand("/delete archive-review", { confirmed: true })
    assert.equal(confirmedDelete.blocked, false)
    assert.equal(calls.includes("command:/delete"), true)
  })

  test("does not discard dirty content when reopening the same note without confirmation", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.showManager()
    controller.focusManagerItem(0)

    const result = controller.openFocusedManagerItem()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.equal(controller.getState().editor?.body, "Unsaved daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.deepEqual(calls, ["list", "show:daily-plan"])

    controller.showManager()
    const confirmedSameNoteResult = controller.openFocusedManagerItem({ confirmed: true })
    assert.equal(confirmedSameNoteResult.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.body, "Unsaved daily body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("async save completion does not replace a different active editor", async () => {
    let finishPersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          finishPersist = resolve
          return { ...note, body }
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Async daily body")
    const savePromise = controller.saveEditor()

    controller.showManager()
    openArchiveReview(controller, { confirmed: true })
    assert.equal(controller.getState().editor?.note.key, "archive-review")

    finishPersist({ ...notesByKey["daily-plan"], body: "Async daily body" })
    await savePromise

    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.equal(controller.getState().editor?.body, "Archive body")
  })

  test("selecting an unwired command search result keeps search open with safe status and recoverable back navigation", () => {
    const { deps, calls } = createDeps({ commandHandlers: {} })
    const controller = createWorkspaceController(deps)

    controller.openSearch("/archive")
    const result = controller.selectSearchResult(commandResult("/archive"))

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.status, "Command unavailable: /archive")
    assert.deepEqual(calls, ["list", "search:/archive"])

    const backResult = controller.goBack()
    assert.equal(backResult.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().search, null)
  })

  test("selecting a command search result closes search and dispatches by command name", () => {
    const commandContexts: string[] = []
    const { deps } = createDeps({
      commandHandlers: {
        "/new": ({ state, command }) => {
          commandContexts.push(`${state.screen}:${command}`)
        },
      },
    })
    const controller = createWorkspaceController(deps)

    controller.openSearch("/new Project Plan")
    const result = controller.selectSearchResult(commandResult("/new"))

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().search, null)
    assert.deepEqual(commandContexts, ["manager:/new Project Plan"])
  })

  test("dirty destructive command search result blocks before unavailable status or handler dispatch", () => {
    const { deps, calls } = createDeps({ commandHandlers: {} })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.openSearch("/archive")
    const result = controller.selectSearchResult(commandResult("/archive"))

    assert.deepEqual(result, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().search?.status, null)
    assert.equal(controller.getState().editor?.dirty, true)
    assert.deepEqual(calls, ["list", "show:daily-plan", "search:/archive"])
  })

  test("returns immutable snapshots for state, search results, and command handler context", () => {
    let handlerStateScreen = ""
    const { deps } = createDeps({
      commandHandlers: {
        "/new": ({ state }) => {
          handlerStateScreen = state.screen
          state.screen = "editor"
        },
      },
    })
    const controller = createWorkspaceController(deps)

    const snapshot = controller.getState()
    snapshot.screen = "editor"
    snapshot.manager.items.length = 0
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.items.length, 2)

    controller.openSearch("daily")
    const results = controller.getSearchResults() as SearchEverythingResult[]
    assert.equal(results.length > 0, true)
    const noteResult = results.find((result) => result.kind === "note")
    assert.equal(noteResult?.kind, "note")
    if (noteResult?.kind === "note") {
      noteResult.matchedFields.length = 0
    }
    results.length = 0
    assert.equal(controller.getSearchResults().length > 0, true)
    const freshNoteResult = controller.getSearchResults().find((result) => result.kind === "note")
    assert.equal(freshNoteResult?.kind, "note")
    if (freshNoteResult?.kind === "note") {
      assert.equal(freshNoteResult.matchedFields.length > 0, true)
    }

    controller.selectSearchResult(commandResult("/new"))
    assert.equal(handlerStateScreen, "manager")
    assert.equal(controller.getState().screen, "manager")
  })

  test("stale folder results and refreshes do not preserve impossible selected note keys", () => {
    let currentSummaries = noteSummaries
    const { deps } = createDeps({
      listNotes: () => currentSummaries,
    })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.equal(controller.getState().manager.selectedNoteKey, "daily-plan")

    controller.openSearch("missing")
    controller.selectSearchResult({
      kind: "folder",
      id: "folder:notes/missing",
      path: "notes/missing",
      name: "missing",
      label: "missing/",
      detail: "0 notes in notes/missing",
      score: 90,
      noteCount: 0,
    })
    assert.equal(controller.getState().manager.selectedNoteKey, "daily-plan")

    currentSummaries = []
    controller.refreshManager()
    assert.deepEqual(controller.getState().manager.items, [])
    assert.equal(controller.getState().manager.selectedNoteKey, null)
  })

  test("opens focused manager folders and notes through the browser adapter", () => {
    const { deps, calls } = createDeps()
    const controller = createWorkspaceController(deps)

    assert.equal(controller.getState().manager.currentFolderPath, "")
    controller.focusManagerItem(1)
    const folderResult = controller.openFocusedManagerItem()

    assert.equal(folderResult.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), ["daily-plan"])

    const noteResult = controller.openFocusedManagerItem()

    assert.equal(noteResult.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")
    assert.deepEqual(calls, ["list", "show:daily-plan"])
  })

  test("goBack closes transient modes and navigates manager folders to their parent", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openSearch("daily")
    assert.equal(controller.getState().screen, "search")
    controller.goBack()
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")

    openInboxDaily(controller)
    controller.openEditorFind("daily")
    assert.equal(controller.getState().mode, "editor.find")
    controller.goBack()
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    controller.goBack()
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().editor?.note.key, "daily-plan")

    controller.showManager()
    controller.openManagerFilter()
    controller.updateManagerFilter("daily")
    assert.equal(controller.getState().mode, "manager.filter")
    controller.goBack()
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.filterQuery, "")

    assert.equal(controller.getState().manager.currentFolderPath, "notes/inbox")
    controller.goBack()
    assert.equal(controller.getState().manager.currentFolderPath, "")
  })

  test("manager create submits a new note title, refreshes indexes, and opens the created note", async () => {
    let currentSummaries = noteSummaries
    const createdNote: TuiNote = {
      key: "project-plan",
      title: "q Project Plan",
      description: "",
      relativePath: "notes/project-plan.md",
      body: "",
    }
    const { deps, calls } = createDeps({
      listNotes: () => {
        calls.push("list")
        return currentSummaries
      },
      createNote: (title, body) => {
        calls.push(`create:${title}:${body}`)
        currentSummaries = [...noteSummaries, createdNote]
        return createdNote
      },
      rebuildIndexes: () => {
        calls.push("rebuild")
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return selector === createdNote.key ? createdNote : notesByKey[selector]
      },
    })
    const controller = createWorkspaceController(deps)

    controller.openManagerCreate()
    const createVm = buildManagerViewModel(controller.getState())
    assert.equal(createVm.createPrompt?.inputId, "bluenote-manager-create-title")
    assert.equal(createVm.createPrompt?.focused, true)
    assert.equal(createVm.deletePrompt, undefined)
    assert.equal(routeManagerKey("q", controller), true)
    assert.equal(controller.getState().manager.createDraft?.title, "q")
    controller.updateManagerCreateTitle("q Project Plan")
    const result = await controller.submitManagerCreate()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().editor?.note.key, "project-plan")
    assert.deepEqual(calls, ["list", "create:q Project Plan:", "rebuild", "list", "show:project-plan"])
  })

  test("manager create blocks before creating when it would replace dirty editor content while preview is hidden", async () => {
    let currentSummaries = noteSummaries
    const { deps, calls } = createDeps({
      listNotes: () => {
        calls.push("list")
        return currentSummaries
      },
      createNote: (title, body) => {
        calls.push(`create:${title}:${body}`)
        currentSummaries = [...currentSummaries, { ...notesByKey["archive-review"], key: "stray-note", title }]
        return { key: "daily-plan" }
      },
    })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    controller.openFocusedManagerItem()
    assert.equal(controller.getState().screen, "editor")
    controller.updateEditorBody("Unsaved draft")
    controller.showManager()
    controller.setManagerPreviewVisible(false)
    controller.openManagerCreate()
    controller.updateManagerCreateTitle("New Note")

    const result = await controller.submitManagerCreate()

    assert.deepEqual(result, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().mode, "manager.create")
    assert.equal(controller.getState().manager.previewVisible, false)
    assert.equal(controller.getState().manager.createDraft?.title, "New Note")
    assert.equal(controller.getState().manager.createDraft?.status, "Save or discard current note first")
    assert.match(buildManagerViewModel(controller.getState()).createPrompt?.status ?? "", /Save or discard/)
    assert.equal(controller.getState().editor?.body, "Unsaved draft")
    assert.equal(calls.some((call) => call.startsWith("create:")), false)
    assert.deepEqual(currentSummaries, noteSummaries)
  })

  test("manager create keeps prompt recoverable when create or refresh fails", async () => {
    const failingCreateController = createWorkspaceController(createDeps({
      createNote: () => {
        throw new Error("create failed")
      },
    }).deps)
    failingCreateController.openManagerCreate()
    failingCreateController.updateManagerCreateTitle("Broken Note")

    await failingCreateController.submitManagerCreate()

    assert.equal(failingCreateController.getState().mode, "manager.create")
    assert.equal(failingCreateController.getState().manager.createDraft?.status, "Create failed")

    const failingRefreshController = createWorkspaceController(createDeps({
      createNote: () => ({ key: "daily-plan" }),
      rebuildIndexes: () => {
        throw new Error("rebuild failed")
      },
    }).deps)
    failingRefreshController.openManagerCreate()
    failingRefreshController.updateManagerCreateTitle("Broken Rebuild")

    await failingRefreshController.submitManagerCreate()

    assert.equal(failingRefreshController.getState().mode, "manager.create")
    assert.equal(failingRefreshController.getState().manager.createDraft?.status, "Create failed")
  })

  test("manager create clears stale preview cache when a partial mutation fails", async () => {
    let currentBody = "Cached body before failed create"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => summariesWithoutBodies,
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
      createNote: () => {
        currentBody = "Body changed by partial create mutation"
        throw new Error("create failed after partial mutation")
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed create"])

    controller.openManagerCreate()
    controller.updateManagerCreateTitle("Broken Partial Create")
    await controller.submitManagerCreate()

    assert.equal(controller.getState().mode, "manager.create")
    assert.equal(controller.getState().manager.createDraft?.status, "Create failed")
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Body changed by partial create mutation"])
  })

  test("empty manager create title stays in the prompt with calm validation and does not create", async () => {
    const { deps, calls } = createDeps({
      createNote: (title, body) => {
        calls.push(`create:${title}:${body}`)
        return notesByKey["daily-plan"]
      },
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    controller.openManagerCreate()
    controller.updateManagerCreateTitle("   ")
    const result = await controller.submitManagerCreate()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.create")
    assert.equal(controller.getState().manager.createDraft?.status, "Title required")
    assert.deepEqual(calls, ["list"])
  })

  test("cancel manager create exits without creating", () => {
    const { deps, calls } = createDeps({
      createNote: (title, body) => {
        calls.push(`create:${title}:${body}`)
        return notesByKey["daily-plan"]
      },
    })
    const controller = createWorkspaceController(deps)

    controller.openManagerCreate()
    controller.updateManagerCreateTitle("Ignored")
    controller.cancelManagerCreate()

    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.createDraft, null)
    assert.deepEqual(calls, ["list"])
  })

  test("goBack cancels manager create mode and clears the draft", () => {
    const controller = createWorkspaceController(createDeps().deps)

    controller.openManagerCreate()
    controller.updateManagerCreateTitle("Draft Title")
    const result = controller.goBack()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.createDraft, null)
  })

  test("manager delete confirmation deletes a note, refreshes, and clears an open editor", async () => {
    let currentSummaries = noteSummaries.map(({ body: _body, ...summary }) => summary)
    let currentDailyBody = "Original daily body"
    const { deps, calls } = createDeps({
      listNotes: () => {
        calls.push("list")
        return currentSummaries
      },
      showNote: (selector) => {
        calls.push(`show:${selector}`)
        return selector === "daily-plan" ? { ...notesByKey["daily-plan"], body: currentDailyBody } : notesByKey[selector]
      },
      deleteNote: (selector) => {
        calls.push(`delete:${selector}`)
        currentSummaries = currentSummaries.filter((summary) => summary.key !== selector)
      },
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Original daily body"])
    controller.openFocusedManagerItem()
    controller.showManager()
    controller.openManagerDeleteConfirmation()

    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(controller.getState().manager.deleteDraft?.key, "daily-plan")

    const result = await controller.confirmManagerDelete()

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().editor, null)
    assert.equal(controller.getState().manager.deleteDraft, null)
    assert.equal(controller.getState().manager.items.some((item) => item.key === "daily-plan"), false)
    assert.deepEqual(calls, ["list", "show:daily-plan", "show:daily-plan", "delete:daily-plan", "rebuild", "list"])

    currentDailyBody = "Recreated daily body must not use deleted-note preview cache"
    currentSummaries = [{
      key: "daily-plan",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
    }]
    controller.refreshManager()
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Recreated daily body must not use deleted-note preview cache"])
  })

  test("manager delete confirmation is blocked while the open editor is dirty or autosave failed", async () => {
    const scheduler = createFakeScheduler()
    let currentSummaries = [...noteSummaries]
    const { deps, calls } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: () => Promise.reject(new Error("disk full")),
      listNotes: () => {
        calls.push("list")
        return currentSummaries
      },
      deleteNote: (selector) => {
        calls.push(`delete:${selector}`)
        currentSummaries = currentSummaries.filter((summary) => summary.key !== selector)
      },
      rebuildIndexes: () => calls.push("rebuild"),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.insertEditorText(" dirty")
    controller.showManager()
    controller.toggleManagerPreview()
    controller.openManagerDeleteConfirmation()

    const dirtyResult = await controller.confirmManagerDelete()
    assert.deepEqual(dirtyResult, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(controller.getState().manager.previewVisible, false)
    assert.equal(controller.getState().manager.deleteDraft?.status, "Save or discard current note first")
    assert.match(buildManagerViewModel(controller.getState()).deletePrompt?.status ?? "", /Save or discard/)
    assert.equal(controller.getState().editor?.body, "Original daily body dirty")
    assert.equal(calls.some((call) => call.startsWith("delete:")), false)

    controller.cancelManagerDelete()
    controller.showEditor()
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.autosaveStatus, "error")

    controller.showManager()
    controller.openManagerDeleteConfirmation()
    const failedAutosaveResult = await controller.confirmManagerDelete()
    assert.deepEqual(failedAutosaveResult, { blocked: true, reason: "dirty-editor" })
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(calls.some((call) => call.startsWith("delete:")), false)
  })

  test("manager delete confirmation cancels and refuses folders without deletion", async () => {
    const { deps, calls } = createDeps({
      deleteNote: (selector) => calls.push(`delete:${selector}`),
    })
    const controller = createWorkspaceController(deps)

    controller.openManagerDeleteConfirmation()
    assert.equal(controller.getState().mode, "manager.browse")
    assert.match(controller.getState().manager.status ?? "", /Folders cannot be deleted here/)

    controller.focusManagerItem(1)
    assert.equal(controller.getState().manager.status, null)
    controller.openFocusedManagerItem()
    controller.openManagerDeleteConfirmation()
    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    controller.cancelManagerDelete()

    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.deleteDraft, null)
    assert.equal(calls.some((call) => call.startsWith("delete:")), false)
  })

  test("manager delete confirmation keeps prompt recoverable when delete is unavailable or fails", async () => {
    const noDeleteController = createWorkspaceController(createDeps().deps)
    noDeleteController.focusManagerItem(1)
    noDeleteController.openFocusedManagerItem()
    noDeleteController.openManagerDeleteConfirmation()

    await noDeleteController.confirmManagerDelete()

    assert.equal(noDeleteController.getState().mode, "manager.deleteConfirm")
    assert.equal(noDeleteController.getState().manager.deleteDraft?.status, "Delete unavailable")

    const failingController = createWorkspaceController(createDeps({
      deleteNote: () => {
        throw new Error("delete failed")
      },
    }).deps)
    failingController.focusManagerItem(1)
    failingController.openFocusedManagerItem()
    failingController.openManagerDeleteConfirmation()

    await failingController.confirmManagerDelete()

    assert.equal(failingController.getState().mode, "manager.deleteConfirm")
    assert.equal(failingController.getState().manager.deleteDraft?.status, "Delete failed")
  })

  test("manager delete clears stale preview cache when a partial mutation fails", async () => {
    let currentBody = "Cached body before failed delete"
    const summariesWithoutBodies = noteSummaries.map(({ body: _body, ...summary }) => summary)
    const controller = createWorkspaceController(createDeps({
      listNotes: () => summariesWithoutBodies,
      showNote: (selector) => ({ ...notesByKey[selector], body: currentBody }),
      deleteNote: () => {
        currentBody = "Body changed by partial delete mutation"
        throw new Error("delete failed after partial mutation")
      },
    }).deps)

    controller.focusManagerItem(1)
    controller.openFocusedManagerItem()
    controller.focusManagerItem(0)
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Cached body before failed delete"])

    controller.openManagerDeleteConfirmation()
    await controller.confirmManagerDelete()

    assert.equal(controller.getState().mode, "manager.deleteConfirm")
    assert.equal(controller.getState().manager.deleteDraft?.status, "Delete failed")
    assert.deepEqual(controller.getManagerBrowserModel().preview.contentLines, ["Body changed by partial delete mutation"])
  })

  test("manager filter updates visible manager state and preview, and clear restores browsing", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openManagerFilter()
    controller.setManagerFilter("inbox")

    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.filter")
    assert.equal(controller.getState().manager.filterQuery, "inbox")
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), ["notes/inbox"])
    assert.equal(controller.getState().manager.hoveredPath, "notes/inbox")

    controller.clearManagerFilter()

    assert.equal(controller.getState().mode, "manager.browse")
    assert.equal(controller.getState().manager.filterQuery, "")
    assert.deepEqual(controller.getState().manager.items.map((item) => item.key), ["notes/archive", "notes/inbox"])
  })

  test("toggleSearch records previous mode and toggles back when search is already active", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    controller.openManagerFilter()
    controller.updateManagerFilter("archive")
    controller.toggleSearch("arc")

    assert.equal(controller.getState().screen, "search")
    assert.equal(controller.getState().mode, "search.input")
    assert.equal(controller.getState().search?.previousScreen, "manager")
    assert.equal(controller.getState().search?.previousMode, "manager.filter")

    controller.toggleSearch()

    assert.equal(controller.getState().screen, "manager")
    assert.equal(controller.getState().mode, "manager.filter")
    assert.equal(controller.getState().manager.filterQuery, "archive")
  })

  test("selecting the current dirty note from search restores editor body mode without discarding edits", () => {
    const { deps } = createDeps()
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")
    controller.openSearch("daily")

    const result = controller.selectSearchResult({
      kind: "note",
      id: "note:daily-plan",
      key: "daily-plan",
      filename: "daily-plan.md",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
      label: "Daily Plan",
      detail: "daily-plan.md — notes/inbox/daily-plan.md",
      score: 100,
      matchedFields: ["title"],
    })

    assert.equal(result.blocked, false)
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().mode, "editor.body")
    assert.equal(controller.getState().search, null)
    assert.equal(controller.getState().editor?.body, "Unsaved daily body")
    assert.equal(controller.getState().editor?.dirty, true)
  })

  test("dirty, autosave pending, saving, and error editor states require destructive confirmation", () => {
    const { deps, calls } = createDeps({
      commandHandlers: {
        "/quit": () => calls.push("command:/quit"),
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Unsaved daily body")

    const blockedQuit = controller.runCommand("/quit")
    assert.equal(blockedQuit.blocked, true)
    assert.equal(blockedQuit.reason, "dirty-editor")
    assert.equal(calls.includes("command:/quit"), false)

    const blockedDirectQuit = controller.requestQuit()
    assert.equal(blockedDirectQuit.blocked, true)
    assert.equal(blockedDirectQuit.reason, "dirty-editor")
    assert.equal(controller.requestQuit({ confirmed: true }).blocked, false)

    const cleanEditor = {
      note: notesByKey["daily-plan"],
      body: "Original daily body",
      savedBody: "Original daily body",
      dirty: false,
      autosaveStatus: "saved" as const,
    }

    assert.equal(editorRequiresDestructiveConfirmation(cleanEditor), false)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, dirty: true }), true)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, autosaveStatus: "pending" }), true)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, autosaveStatus: "saving" }), true)
    assert.equal(editorRequiresDestructiveConfirmation({ ...cleanEditor, autosaveStatus: "error" }), true)
  })

  test("changing editor body marks dirty, sets autosave pending, and debounces persistence for 750ms", async () => {
    const scheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Draft one")

    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])
    assert.deepEqual(persistedBodies, [])

    controller.updateEditorBody("Draft two")
    assert.equal(scheduler.tasks[0]?.cleared, true)
    assert.deepEqual(scheduler.activeTasks().map((task) => task.delay), [750])

    scheduler.runNext()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:Draft two"])
    assert.equal(controller.getState().editor?.body, "Draft two")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("autosave uses the same persistence dependency as manual save", async () => {
    const scheduler = createFakeScheduler()
    const persistedBodies: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) => {
        persistedBodies.push(`${note.key}:${body}`)
        return { ...note, body }
      },
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Manual body")
    await controller.saveEditor()
    controller.updateEditorBody("Autosaved body")
    scheduler.runNext()
    await Promise.resolve()

    assert.deepEqual(persistedBodies, ["daily-plan:Manual body", "daily-plan:Autosaved body"])
  })

  test("updating editor body to saved content does not schedule autosave or mark pending", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Original daily body")

    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
    assert.deepEqual(scheduler.activeTasks(), [])
  })

  test("stale autosave completion after a newer manual save does not corrupt clean saved state", async () => {
    const scheduler = createFakeScheduler()
    const pendingSaves: Array<{ body: string; resolve: (note: TuiNote) => void }> = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          pendingSaves.push({ body, resolve: (savedNote) => resolve({ ...note, ...savedNote }) })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Older autosave body")
    scheduler.runNext()
    await Promise.resolve()
    controller.updateEditorBody("Newer manual body")
    const manualSave = controller.saveEditor()
    pendingSaves[1]?.resolve({ ...notesByKey["daily-plan"], body: "Newer manual body" })
    await manualSave

    pendingSaves[0]?.resolve({ ...notesByKey["daily-plan"], body: "Older autosave body" })
    await Promise.resolve()

    assert.equal(controller.getState().editor?.body, "Newer manual body")
    assert.equal(controller.getState().editor?.savedBody, "Newer manual body")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("dispose clears pending autosave timers", () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({ autosaveScheduler: scheduler })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Pending before destroy")
    assert.equal(scheduler.activeTasks().length, 1)

    controller.dispose()

    assert.deepEqual(scheduler.activeTasks(), [])
  })

  test("autosave status changes notify the renderer to rerender", async () => {
    const scheduler = createFakeScheduler()
    const invalidations: string[] = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      onAutosaveStateChange: () => invalidations.push(controller.getState().editor?.autosaveStatus ?? "none"),
      persistEditorBody: (note, body) => Promise.resolve({ ...note, body }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Autosave status body")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.deepEqual(invalidations, ["pending", "saving", "saved"])
  })

  test("stale autosave completion for an older body does not overwrite a newer dirty body", async () => {
    const scheduler = createFakeScheduler()
    const pendingSaves: Array<{ body: string; resolve: (note: TuiNote) => void }> = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          pendingSaves.push({ body, resolve: (savedNote) => resolve({ ...note, ...savedNote }) })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Older autosave body")
    scheduler.runNext()
    await Promise.resolve()
    assert.equal(controller.getState().editor?.autosaveStatus, "saving")

    controller.updateEditorBody("Newer unsaved body")
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
    pendingSaves[0]?.resolve({ ...notesByKey["daily-plan"], body: "Older autosave body" })
    await Promise.resolve()

    assert.equal(controller.getState().editor?.body, "Newer unsaved body")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "pending")
  })

  test("stale autosave completion for a different active note is ignored", async () => {
    const scheduler = createFakeScheduler()
    let finishPersist!: (note: TuiNote) => void
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve) => {
          finishPersist = (savedNote) => resolve({ ...note, ...savedNote, body })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Autosaving daily")
    scheduler.runNext()
    await Promise.resolve()
    openArchiveReview(controller, { confirmed: true })

    finishPersist({ ...notesByKey["daily-plan"], body: "Autosaving daily" })
    await Promise.resolve()

    assert.equal(controller.getState().editor?.note.key, "archive-review")
    assert.equal(controller.getState().editor?.body, "Archive body")
    assert.equal(controller.getState().editor?.autosaveStatus, "idle")
  })

  test("stale autosave failure after a newer manual save does not mark clean editor as failed", async () => {
    const scheduler = createFakeScheduler()
    const pendingSaves: Array<{ body: string; resolve: (note: TuiNote) => void; reject: (error: Error) => void }> = []
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: (note, body) =>
        new Promise<TuiNote>((resolve, reject) => {
          pendingSaves.push({ body, resolve: (savedNote) => resolve({ ...note, ...savedNote }), reject })
        }),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Shared body")
    scheduler.runNext()
    await Promise.resolve()
    const manualSave = controller.saveEditor()
    pendingSaves[1]?.resolve({ ...notesByKey["daily-plan"], body: "Shared body" })
    await manualSave

    pendingSaves[0]?.reject(new Error("late autosave failure"))
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(controller.getState().editor?.body, "Shared body")
    assert.equal(controller.getState().editor?.savedBody, "Shared body")
    assert.equal(controller.getState().editor?.dirty, false)
    assert.equal(controller.getState().editor?.autosaveStatus, "saved")
  })

  test("autosave failure changes status to error and preserves dirty body", async () => {
    const scheduler = createFakeScheduler()
    const { deps } = createDeps({
      autosaveScheduler: scheduler,
      persistEditorBody: () => Promise.reject(new Error("disk full")),
    })
    const controller = createWorkspaceController(deps)

    openInboxDaily(controller)
    controller.updateEditorBody("Dirty body after failure")
    scheduler.runNext()
    await Promise.resolve()
    await Promise.resolve()

    assert.equal(controller.getState().editor?.body, "Dirty body after failure")
    assert.equal(controller.getState().editor?.dirty, true)
    assert.equal(controller.getState().editor?.autosaveStatus, "error")
  })
})
