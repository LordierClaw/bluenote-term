import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { createCliRenderer } from "@opentui/core"

import { blurWorkspaceInputs, focusActiveWorkspaceInput, routeWorkspaceKey, startTuiWorkspace } from "../../../src/tui/app"
import { renderEditorScreen, routeEditorKey } from "../../../src/tui/render-editor"
import { renderManagerScreen, routeManagerKey } from "../../../src/tui/render-manager"
import { renderSearchEverythingScreen, routeSearchEverythingKey } from "../../../src/tui/render-search-everything"
import type { TuiState } from "../../../src/tui/state"
import { createWorkspaceController, type WorkspaceController } from "../../../src/tui/workspace-controller"
import type { ManagerBrowserModel } from "../../../src/tui/adapters/note-manager-adapter"

function descendants(node: { getChildren: () => any[] }): any[] {
  return node.getChildren().flatMap((child) => [child, ...descendants(child)])
}

function findById(node: { getChildren: () => any[] }, id: string): any | undefined {
  return descendants(node).find((child) => child.id === id)
}

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
    insertEditorText: (text) => calls.push(`insertEditorText:${text}`),
    backspaceEditor: () => calls.push("backspaceEditor"),
    deleteEditor: () => calls.push("deleteEditor"),
    moveEditorCursor: (direction) => calls.push(`moveEditorCursor:${direction}`),
    toggleEditorWrapMode: () => calls.push("toggleEditorWrapMode"),
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
    openManagerCreate: () => calls.push("openManagerCreate"),
    updateManagerCreateTitle: (title) => calls.push(`updateManagerCreateTitle:${title}`),
    submitManagerCreate: async () => {
      calls.push("submitManagerCreate")
      return { blocked: false }
    },
    cancelManagerCreate: () => calls.push("cancelManagerCreate"),
    openManagerDeleteConfirmation: () => calls.push("openManagerDeleteConfirmation"),
    confirmManagerDelete: async () => {
      calls.push("confirmManagerDelete")
      return { blocked: false }
    },
    cancelManagerDelete: () => calls.push("cancelManagerDelete"),
    setManagerFilter: (query) => calls.push(`setManagerFilter:${query}`),
    updateManagerFilter: (query) => calls.push(`updateManagerFilter:${query}`),
    clearManagerFilter: () => calls.push("clearManagerFilter"),
    toggleManagerPreview: () => calls.push("toggleManagerPreview"),
    setManagerPreviewVisible: (visible) => calls.push(`setManagerPreviewVisible:${visible}`),
    toggleSearchPreview: () => calls.push("toggleSearchPreview"),
    setSearchPreviewVisible: (visible) => calls.push(`setSearchPreviewVisible:${visible}`),
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

  test("editor Alt+Z toggles wrap mode from the body", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"

    assert.equal(routeEditorKey("\u001bz", controller), true)
    assert.deepEqual(calls, ["toggleEditorWrapMode"])
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

  test("workspace route opens Search Everything with Ctrl+P but leaves slash to editor body input", () => {
    const { controller, calls } = createController("editor")

    assert.deepEqual(routeWorkspaceKey("/", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u0010", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["openSearch:"])
  })

  test("editor command route leaves printable editor body input for the runtime body handler", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" },
      body: "body",
      savedBody: "body",
      dirty: false,
    }

    assert.equal(routeEditorKey("x", controller), false)
    assert.equal(routeEditorKey(" ", controller), false)
    assert.equal(routeEditorKey("/", controller), false)
    assert.deepEqual(calls, [])
  })

  test("editor body routing treats bracketed paste as text and ignores embedded global shortcuts", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("\u001b[200~/literal \u0010 \u0013 text\u001b[201~", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["insertEditorText:/literal   text"])
  })

  test("editor body routing strips ANSI escape sequences from bracketed paste", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("\u001b[200~\u001b[31mred\u001b[0m \u001b]0;title\u0007text\u001b[201~", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["insertEditorText:red text"])
  })

  test("editor body routing sanitizes non-bracketed multi-character paste fallback", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("plain\u0010\u0013\u001b[31mred\u001b[0m", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["insertEditorText:plainred"])
  })

  test("editor body routing strips ESC-terminated OSC and 8-bit C1 CSI paste residue", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("a\u001b]0;title\u001b\\b\u009b31mred\u009b0m", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["insertEditorText:abred"])
  })

  test("editor body routing strips 8-bit OSC and DCS paste residue", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("\u001b[200~c\u0090payload\u009cd e\u009d0;title\u0007f\u001b[201~", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["insertEditorText:cd ef"])
  })

  test("editor body routing rejects standalone C1 controls", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("\u009b", controller, () => {}), { handled: false })
    assert.deepEqual(calls, [])
  })

  test("editor body routing inserts printable slash instead of opening Search Everything", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("/", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["insertEditorText:/"])
  })

  test("editor body chrome uses flex sizing and find mode has a single focused input", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      let screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)

      const bodyInput = findById(screen, "bluenote-editor-body-input") as { height?: unknown; yogaNode?: { getFlexGrow?: () => number } } | undefined
      const bodyDisplay = findById(screen, "bluenote-editor-body") as { height?: unknown; wrapMode?: "word" | "none"; yogaNode?: { getFlexGrow?: () => number } } | undefined
      assert.notEqual(bodyInput?.height, 20)
      assert.equal(bodyInput?.yogaNode?.getFlexGrow?.(), 1)
      assert.equal(bodyDisplay?.yogaNode?.getFlexGrow?.(), 1)

      controller.toggleEditorWrapMode()
      renderer.root.remove(screen.id)
      screen.destroyRecursively()
      screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const noWrapBodyDisplay = findById(screen, "bluenote-editor-body") as { wrapMode?: "word" | "none" } | undefined
      assert.equal(noWrapBodyDisplay?.wrapMode, "none")

      renderer.root.remove(screen.id)
      screen.destroyRecursively()
      controller.openEditorFind()
      screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      focusActiveWorkspaceInput(screen)

      const focusOwners = descendants(screen).filter((node) => (node.id === "bluenote-editor-find-query" || node.id === "bluenote-editor-body-input") && node.focused)
      assert.deepEqual(focusOwners.map((node) => node.id), ["bluenote-editor-find-query"])
    } finally {
      renderer.destroy()
    }
  })

  test("editor body renders as a focused controlled input owner", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      focusActiveWorkspaceInput(screen)
      const bodyInput = findById(screen, "bluenote-editor-body-input")
      const bodyDisplay = findById(screen, "bluenote-editor-body")

      assert.equal(bodyInput?.id, "bluenote-editor-body-input")
      assert.equal(bodyDisplay?.focused, false)
      assert.equal(controller.getState().editor?.body, "")
      assert.equal(controller.getState().editor?.dirty, false)
    } finally {
      renderer.destroy()
    }
  })

  test("editor Escape and Ctrl+[ use the global back rule while Ctrl+S still saves", async () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"

    assert.deepEqual(routeWorkspaceKey("\u0013", controller, () => {}), { handled: true })
    await Promise.resolve()
    assert.deepEqual(routeWorkspaceKey("\u001b", controller, () => {}), { handled: true })
    assert.deepEqual(routeWorkspaceKey("\u001b[", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["saveEditor", "goBack", "goBack"])
  })

  test("editor body has exactly one focusable input owner after repeated rerenders", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)

      for (let index = 0; index < 3; index += 1) {
        for (const child of renderer.root.getChildren()) {
          blurWorkspaceInputs(child)
          renderer.root.remove(child.id)
          child.destroyRecursively()
        }
        const screen = renderEditorScreen({ renderer, controller })
        renderer.root.add(screen)
        focusActiveWorkspaceInput(screen)
      }

      const bodyInputs = descendants(renderer.root).filter((node) => node.id === "bluenote-editor-body-input")
      const focusedBodyDisplays = descendants(renderer.root).filter((node) => node.id === "bluenote-editor-body" && node.focused)
      assert.equal(bodyInputs.length, 1)
      assert.equal(focusedBodyDisplays.length, 0)
    } finally {
      renderer.destroy()
    }
  })

  test("editor renderer tolerates editor screen without an open note", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const { controller } = createController("editor")
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const bodyDisplay = findById(screen, "bluenote-editor-body")
      assert.equal(typeof bodyDisplay?.content?.chunks?.[0]?.text, "string")
    } finally {
      renderer.destroy()
    }
  })

  test("workspace route toggles out of Search Everything with Ctrl+P", () => {
    const { controller, calls } = createController("search")

    assert.deepEqual(routeWorkspaceKey("\u0010", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["toggleSearch:"])
  })

  test("Search Everything route toggles preview with Alt+P without stealing printable p input", () => {
    const { controller, calls } = createController("search")

    assert.equal(routeSearchEverythingKey("\u001bp", controller), true)
    assert.equal(routeSearchEverythingKey("p", controller), true)
    controller.getState().search!.query = "p"
    assert.equal(routeSearchEverythingKey("x", controller), true)

    assert.deepEqual(calls, ["toggleSearchPreview", "updateSearchQuery:p", "updateSearchQuery:px"])
  })

  test("workspace route keeps Ctrl+P as the global Search Everything overlay toggle", () => {
    const editor = createController("editor")
    assert.deepEqual(routeWorkspaceKey("\u0010", editor.controller, () => {}), { handled: true })
    assert.deepEqual(editor.calls, ["openSearch:"])

    const search = createController("search")
    assert.deepEqual(routeWorkspaceKey("\u0010", search.controller, () => {}), { handled: true })
    assert.deepEqual(search.calls, ["toggleSearch:"])
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

  test("workspace route leaves q available for manager create title input", () => {
    const { controller, calls } = createController("manager")
    controller.getState().mode = "manager.create"
    controller.getState().manager.createDraft = { title: "Qui", status: null }

    assert.deepEqual(routeWorkspaceKey("q", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["updateManagerCreateTitle:Quiq"])
  })

  test("workspace route still handles manager Esc, q, and Ctrl+C when an edited note is dirty", () => {
    const controller = createWorkspaceController({
      listNotes: () => [
        { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" },
      ],
      showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }),
      searchNotes: () => [],
    })
    assert.equal(controller.openFocusedManagerItem().blocked, false)
    controller.insertEditorText(" unsaved")

    let exitCount = 0
    assert.deepEqual(routeWorkspaceKey("\u001b", controller, () => { exitCount += 1 }), { handled: true })
    assert.equal(controller.getState().screen, "manager")
    assert.deepEqual(routeWorkspaceKey("q", controller, () => { exitCount += 1 }), { handled: true, exit: undefined })
    assert.deepEqual(routeWorkspaceKey("\u0003", controller, () => { exitCount += 1 }), { handled: true, exit: undefined })
    assert.equal(exitCount, 0)
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
      ["n", "openManagerCreate"],
      ["d", "openManagerDeleteConfirmation"],
      ["/", "openManagerFilter"],
      ["\u0006", "openManagerFilter"],
    ] as const) {
      assert.equal(routeManagerKey(sequence, controller), true, sequence)
      assert.equal(calls.at(-1), expected, sequence)
    }
  })

  test("manager filter route edits printable query while routing navigation, open, and close keys", () => {
    const { controller, calls } = createController("manager")
    controller.getState().mode = "manager.filter"
    controller.getState().manager.filterQuery = "da"

    assert.equal(routeManagerKey("i", controller), true)
    assert.equal(routeManagerKey("\u001b[A", controller), true)
    assert.equal(routeManagerKey("\u001b[B", controller), true)
    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(routeManagerKey("\u001b[C", controller), true)
    assert.equal(routeManagerKey("\u001b[D", controller), true)
    assert.equal(routeManagerKey("\u001b", controller), true)
    assert.equal(routeManagerKey("\u001b[", controller), true)

    assert.deepEqual(calls, [
      "updateManagerFilter:dai",
      "moveManagerSelection:up",
      "moveManagerSelection:down",
      "openFocusedManagerItem",
      "openFocusedManagerItem",
      "clearManagerFilter",
      "goBack",
      "goBack",
    ])
  })

  test("manager route maps p to preview toggle while s and Ctrl+P still open Search Everything", () => {
    const { controller, calls } = createController("manager")

    assert.equal(routeManagerKey("p", controller), true)
    assert.equal(routeManagerKey("s", controller), true)
    assert.deepEqual(routeWorkspaceKey("\u0010", controller, () => {}), { handled: true })

    assert.deepEqual(calls, ["toggleManagerPreview", "openSearch:", "toggleSearch:"])
  })

  test("manager renderer removes preview pane at narrow widths and keeps browser rows routable", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      let showCalls = 0
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md" }],
        showNote: () => {
          showCalls += 1
          return { key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md", body: "# Daily\n\nPreview body" }
        },
        searchNotes: () => [],
      })
      controller.refreshManager()

      const wideScreen = renderManagerScreen({ renderer, controller, width: 100 })
      renderer.root.add(wideScreen)
      assert.notEqual(findById(wideScreen, "bluenote-manager-layout-1"), undefined)
      assert.notEqual(findById(wideScreen, "bluenote-manager-layout-2"), undefined)
      renderer.root.remove(wideScreen.id)
      wideScreen.destroyRecursively()
      showCalls = 0

      const narrowScreen = renderManagerScreen({ renderer, controller, width: 60 })
      renderer.root.add(narrowScreen)
      const narrowLayout1 = findById(narrowScreen, "bluenote-manager-layout-1")
      const narrowLayout2 = findById(narrowScreen, "bluenote-manager-layout-2")
      const narrowText = descendants(narrowScreen).map((node) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")

      assert.equal(showCalls, 0)
      assert.notEqual(narrowLayout1, undefined)
      assert.equal(narrowLayout2, undefined)
      assert.match(narrowText, /daily\.md/u)
      assert.match(narrowText, /Preview hidden/u)
      assert.doesNotMatch(narrowText, /Preview body/u)

      assert.equal(routeManagerKey("\u001b[B", controller), true)
    } finally {
      renderer.destroy()
    }
  })

  test("manager renderer derives responsive preview visibility from the live renderer width", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as typeof renderer & { width?: number }).width = 60
      let showCalls = 0
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md" }],
        showNote: () => {
          showCalls += 1
          return { key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md", body: "Preview body" }
        },
        searchNotes: () => [],
      })
      controller.refreshManager()

      const narrowScreen = renderManagerScreen({ renderer, controller })
      renderer.root.add(narrowScreen)
      const narrowText = descendants(narrowScreen).map((node) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")

      assert.equal(showCalls, 0)
      assert.notEqual(findById(narrowScreen, "bluenote-manager-layout-1"), undefined)
      assert.equal(findById(narrowScreen, "bluenote-manager-layout-2"), undefined)
      assert.match(narrowText, /daily\.md/u)
      assert.match(narrowText, /Preview hidden \(narrow width\)/u)
      assert.doesNotMatch(narrowText, /Preview body/u)
    } finally {
      renderer.destroy()
    }
  })

  test("manager responsive hide is temporary and preserves a manual preview toggle on return to wide width", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      let showCalls = 0
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md" }],
        showNote: () => {
          showCalls += 1
          return { key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md", body: "Preview body" }
        },
        searchNotes: () => [],
      })
      controller.refreshManager()

      let screen = renderManagerScreen({ renderer, controller, width: 60 })
      renderer.root.add(screen)
      assert.equal(findById(screen, "bluenote-manager-layout-2"), undefined)
      assert.equal(controller.getState().manager.previewVisible, true)
      renderer.root.remove(screen.id)
      screen.destroyRecursively()

      screen = renderManagerScreen({ renderer, controller, width: 100 })
      renderer.root.add(screen)
      assert.notEqual(findById(screen, "bluenote-manager-layout-2"), undefined)
      renderer.root.remove(screen.id)
      screen.destroyRecursively()

      controller.toggleManagerPreview()
      showCalls = 0
      screen = renderManagerScreen({ renderer, controller, width: 100 })
      renderer.root.add(screen)
      const manualHiddenText = descendants(screen).map((node) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")
      assert.equal(showCalls, 0)
      assert.equal(findById(screen, "bluenote-manager-layout-2"), undefined)
      assert.match(manualHiddenText, /Preview hidden \(manual\)/u)
    } finally {
      renderer.destroy()
    }
  })

  test("manager create route edits title, submits on Enter, and cancels on Escape or Ctrl+[", () => {
    const { controller, calls } = createController("manager")
    controller.getState().mode = "manager.create"
    controller.getState().manager.createDraft = { title: "Ne", status: null }

    assert.equal(routeManagerKey("w", controller), true)
    assert.equal(routeManagerKey("\u007f", controller), true)
    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(routeManagerKey("\u001b", controller), true)
    assert.equal(routeManagerKey("\u001b[", controller), true)
    assert.deepEqual(calls, [
      "updateManagerCreateTitle:New",
      "updateManagerCreateTitle:N",
      "submitManagerCreate",
      "cancelManagerCreate",
      "cancelManagerCreate",
    ])
  })

  test("manager delete confirmation route confirms or cancels", () => {
    const { controller, calls } = createController("manager")
    controller.getState().mode = "manager.deleteConfirm"

    assert.equal(routeManagerKey("x", controller), true)
    assert.equal(routeManagerKey("y", controller), true)
    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(routeManagerKey("\u001b", controller), true)
    assert.equal(routeManagerKey("\u001b[", controller), true)
    assert.equal(routeManagerKey("n", controller), true)

    assert.deepEqual(calls, [
      "confirmManagerDelete",
      "confirmManagerDelete",
      "cancelManagerDelete",
      "cancelManagerDelete",
      "cancelManagerDelete",
    ])
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

  test("Search Everything short renderer keeps input and result rows routable while preview is hidden", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md", body: "Preview body" }),
        searchNotes: () => [],
      })
      controller.openSearch("daily")
      const screen = renderSearchEverythingScreen({ renderer, controller, height: 12 })
      renderer.root.add(screen)
      const text = descendants(screen).map((node) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")
      assert.notEqual(findById(screen, "bluenote-search-query"), undefined)
      assert.notEqual(findById(screen, "bluenote-search-results-region"), undefined)
      assert.equal(findById(screen, "bluenote-search-preview-region"), undefined)
      assert.match(text, /\[note\] Daily/u)
      assert.match(text, /Preview hidden for short terminal/u)
      assert.doesNotMatch(text, /Preview body/u)
      assert.equal(routeSearchEverythingKey("\u001b[B", controller), true)
    } finally {
      renderer.destroy()
    }
  })

  test("Search Everything runtime render passes the effective terminal height to the renderer", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as typeof renderer & { height?: number }).height = 12
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md", body: "Preview body" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md", body: "Preview body" }),
        searchNotes: () => [],
      })
      controller.openSearch("daily")

      const running = await startTuiWorkspace({ renderer, controller })
      const text = descendants(renderer.root).map((node) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")

      assert.equal(findById(renderer.root, "bluenote-search-preview-region"), undefined)
      assert.match(text, /Preview hidden for short terminal/u)
      assert.doesNotMatch(text, /Preview body/u)
      running.destroy()
    } finally {
      if (!renderer.isDestroyed) {
        renderer.destroy()
      }
    }
  })
})
