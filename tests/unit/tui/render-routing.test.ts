import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { createCliRenderer } from "@opentui/core"

import { blurWorkspaceInputs, focusActiveWorkspaceInput, routeWorkspaceKey } from "../../../src/tui/app"
import { renderEditorScreen, routeEditorKey } from "../../../src/tui/render-editor"
import { routeManagerKey } from "../../../src/tui/render-manager"
import { routeSearchEverythingKey } from "../../../src/tui/render-search-everything"
import type { TuiState } from "../../../src/tui/state"
import { createWorkspaceController, type WorkspaceController } from "../../../src/tui/workspace-controller"
import type { ManagerBrowserModel } from "../../../src/tui/adapters/note-manager-adapter"

function createController(screen: TuiState["screen"]): { controller: WorkspaceController; calls: string[] } {
  const calls: string[] = []
  const state: TuiState = {
    screen,
    manager: { items: [], focusedIndex: 0, selectedNoteKey: null },
    editor: null,
    search: screen === "search" ? { query: "", selectedIndex: 0, previousScreen: "editor" } : null,
  }

  const controller: WorkspaceController = {
    getState: () => state,
    getManagerBrowserModel: (): ManagerBrowserModel => ({
      layout1Rows: [],
      preview: { type: "empty", path: null },
      currentFolderPath: "",
      hoveredPath: null,
      focusedIndex: 0,
      empty: true,
      state: state.manager,
    }),
    getSearchResults: () => [],
    refreshManager: () => calls.push("refreshManager"),
    focusManagerItem: (index) => calls.push(`focusManagerItem:${index}`),
    moveManagerSelection: (direction) => calls.push(`moveManagerSelection:${direction}`),
    openFocusedManagerItem: () => {
      calls.push("openFocusedManagerItem")
      return { blocked: false }
    },
    showManager: () => {
      calls.push("showManager")
      state.screen = "manager"
      return { blocked: false }
    },
    showEditor: () => {
      calls.push("showEditor")
      state.screen = "editor"
      return { blocked: false }
    },
    updateEditorBody: (body) => calls.push(`updateEditorBody:${body}`),
    saveEditor: async () => {
      calls.push("saveEditor")
      return { blocked: false }
    },
    openSearch: (query) => {
      calls.push(`openSearch:${query ?? ""}`)
      state.screen = "search"
      state.search = { query: query ?? "", selectedIndex: 0, previousScreen: screen === "search" ? "editor" : screen }
    },
    updateSearchQuery: (query) => calls.push(`updateSearchQuery:${query}`),
    focusSearchResult: (index) => calls.push(`focusSearchResult:${index}`),
    cancelSearch: () => calls.push("cancelSearch"),
    goBack: () => {
      calls.push("goBack")
      return { blocked: false }
    },
    openManagerFilter: () => calls.push("openManagerFilter"),
    setManagerFilter: (query) => calls.push(`setManagerFilter:${query}`),
    updateManagerFilter: (query) => calls.push(`updateManagerFilter:${query}`),
    clearManagerFilter: () => calls.push("clearManagerFilter"),
    toggleSearch: (query) => calls.push(`toggleSearch:${query ?? ""}`),
    openEditorFind: (query) => calls.push(`openEditorFind:${query ?? ""}`),
    updateEditorFindQuery: (query) => calls.push(`updateEditorFindQuery:${query}`),
    advanceEditorFind: (direction = "next") => calls.push(`advanceEditorFind:${direction}`),
    requestQuit: () => {
      calls.push("requestQuit")
      return { blocked: false }
    },
    dispose: () => calls.push("dispose"),
    setAutosaveStateChangeHandler: () => calls.push("setAutosaveStateChangeHandler"),
    selectSearchResult: () => {
      calls.push("selectSearchResult")
      return { blocked: false }
    },
    runCommand: (command) => {
      calls.push(`runCommand:${command}`)
      return { blocked: false }
    },
  }

  return { controller, calls }
}

describe("TUI render keyboard routing", () => {
  test("editor route does not consume printable editing characters", () => {
    const { controller, calls } = createController("editor")
    let exited = false

    for (const key of ["s", "m", "q", "/", "a", " "]) {
      assert.equal(routeEditorKey(key, controller, () => { exited = true }), false, key)
    }

    assert.equal(exited, false)
    assert.deepEqual(calls, [])
  })

  test("editor Ctrl+S dispatches the workspace save action", () => {
    const { controller, calls } = createController("editor")

    assert.equal(routeEditorKey("\u0013", controller), true)
    assert.deepEqual(calls, ["saveEditor"])
  })

  test("editor Ctrl+F enters editor find mode from the body", () => {
    const { controller, calls } = createController("editor")

    assert.equal(routeEditorKey("\u0006", controller), true)
    assert.deepEqual(calls, ["openEditorFind:"])
  })

  test("post-attach focus re-registers the active editor input with OpenTUI key routing", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [
          {
            key: "daily",
            title: "Daily",
            description: "",
            relativePath: "notes/daily.md",
            body: "alpha beta alpha",
          },
        ],
        showNote: () => ({
          key: "daily",
          title: "Daily",
          description: "",
          relativePath: "notes/daily.md",
          body: "alpha beta alpha",
        }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      controller.openEditorFind()
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const findInput = screen.getChildren().flatMap((child) => child.getChildren()).find((node) => node.id === "bluenote-editor-find-query")
      findInput?.blur()

      assert.equal(findInput?.focused, false)
      focusActiveWorkspaceInput(screen)
      assert.equal(findInput?.focused, true)
      blurWorkspaceInputs(screen)
      assert.equal(findInput?.focused, false)
    } finally {
      renderer.destroy()
    }
  })

  test("editor find mode leaves printable keys to focused find input and routes Enter/Escape to find actions", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.find"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" },
      body: "body",
      savedBody: "body",
      dirty: false,
      findQuery: "",
      findMatchCount: 0,
      activeFindIndex: null,
    }

    assert.equal(routeEditorKey("a", controller), false)
    assert.equal(routeEditorKey("b", controller), false)
    assert.equal(routeEditorKey("\r", controller), true)
    assert.equal(routeEditorKey("\u001b", controller), true)

    assert.deepEqual(calls, ["advanceEditorFind:next", "goBack"])
  })

  test("editor find mode treats Ctrl+[ as Escape", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.find"

    assert.equal(routeEditorKey("\u001b[", controller), true)
    assert.deepEqual(calls, ["goBack"])
  })

  test("editor find typing updates matches against current body, Enter advances, and Escape returns to body without editing textarea", () => {
    const controller = createWorkspaceController({
      listNotes: () => [
        {
          key: "daily",
          title: "Daily",
          description: "",
          relativePath: "notes/daily.md",
          body: "alpha beta alpha",
        },
      ],
      showNote: () => ({
        key: "daily",
        title: "Daily",
        description: "",
        relativePath: "notes/daily.md",
        body: "alpha beta alpha",
      }),
      searchNotes: () => [],
    })
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    assert.equal(controller.getState().mode, "editor.body")

    assert.equal(routeEditorKey("\u0006", controller), true)
    controller.updateEditorFindQuery("al")

    let state = controller.getState()
    assert.equal(state.mode, "editor.find")
    assert.equal(state.editor?.body, "alpha beta alpha")
    assert.equal(state.editor?.findQuery, "al")
    assert.equal(state.editor?.findMatchCount, 2)
    assert.equal(state.editor?.activeFindIndex, 0)

    assert.equal(routeEditorKey("\r", controller), true)
    state = controller.getState()
    assert.equal(state.editor?.activeFindIndex, 1)

    assert.equal(routeEditorKey("\u001b", controller), true)
    state = controller.getState()
    assert.equal(state.mode, "editor.body")
    assert.equal(state.editor?.body, "alpha beta alpha")
  })

  test("workspace route opens Search Everything with Ctrl+P but leaves slash to editor textarea", () => {
    const { controller, calls } = createController("editor")

    assert.deepEqual(routeWorkspaceKey("/", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u0010", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["openSearch:"])
  })

  test("workspace route toggles out of Search Everything with Ctrl+P", () => {
    const { controller, calls } = createController("search")

    assert.deepEqual(routeWorkspaceKey("\u0010", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["toggleSearch:"])
  })

  test("workspace route reports exit without asking caller to rerender", () => {
    const { controller } = createController("manager")
    let exitCount = 0

    assert.deepEqual(routeWorkspaceKey("\u0003", controller, () => { exitCount += 1 }), { handled: true, exit: true })
    assert.equal(exitCount, 1)
  })

  test("workspace route reports manager quit without asking caller to rerender", () => {
    const { controller } = createController("manager")
    let exitCount = 0

    assert.deepEqual(routeWorkspaceKey("q", controller, () => { exitCount += 1 }), { handled: true, exit: true })
    assert.equal(exitCount, 1)
  })

  test("workspace route leaves q available for manager filter input", () => {
    const { controller, calls } = createController("manager")
    controller.getState().mode = "manager.filter"

    assert.deepEqual(routeWorkspaceKey("q", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["updateManagerFilter:q"])
  })

  test("manager route maps browser navigation and filter keys", () => {
    const { controller, calls } = createController("manager")

    for (const [sequence, expected] of [
      ["\u001b[A", "moveManagerSelection:up"],
      ["\u001b[B", "moveManagerSelection:down"],
      ["\u001b[C", "openFocusedManagerItem"],
      ["\r", "openFocusedManagerItem"],
      ["\u001b[D", "goBack"],
      ["\u001b", "goBack"],
      ["\u001b[", "goBack"],
      ["/", "openManagerFilter"],
      ["\u0006", "openManagerFilter"],
    ] as const) {
      assert.equal(routeManagerKey(sequence, controller), true, sequence)
      assert.equal(calls.at(-1), expected, sequence)
    }
  })

  test("search route appends printable query input and supports backspace fallback for real terminal keys", () => {
    const { controller, calls } = createController("search")

    assert.equal(routeSearchEverythingKey("a", controller), true)
    controller.getState().search!.query = "a"
    assert.equal(routeSearchEverythingKey("/", controller), true)
    controller.getState().search!.query = "a/"
    assert.equal(routeSearchEverythingKey("\u007f", controller), true)
    assert.deepEqual(calls, ["updateSearchQuery:a", "updateSearchQuery:a/", "updateSearchQuery:a"])
  })

  test("search route maps Escape and Ctrl+[ to previous screen navigation", () => {
    const { controller, calls } = createController("search")

    assert.equal(routeSearchEverythingKey("\u001b", controller), true)
    assert.equal(routeSearchEverythingKey("\u001b[", controller), true)
    assert.deepEqual(calls, ["cancelSearch", "cancelSearch"])
  })
})
