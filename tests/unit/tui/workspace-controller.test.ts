import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import {
  createWorkspaceController,
  editorRequiresDestructiveConfirmation,
  type WorkspaceControllerDependencies,
} from "../../../src/tui/workspace-controller"
import type { NoteManagerSummary } from "../../../src/tui/adapters/note-manager-adapter"
import type { SearchEverythingResult } from "../../../src/tui/adapters/search-everything-adapter"
import type { TuiNote } from "../../../src/tui/state"

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
})
