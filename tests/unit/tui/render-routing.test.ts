import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { createCliRenderer, PasteEvent } from "@opentui/core"

import { blurWorkspaceInputs, defaultTuiRendererConfig, focusActiveWorkspaceInput, routeControlledEditorBodyInput, routeWorkspaceKey, startTuiWorkspace, waitForInteractiveTuiExit } from "../../../src/tui/app"
import { buildEditorViewModel, renderEditorScreen, routeEditorKey } from "../../../src/tui/render-editor"
import { buildManagerViewModel, renderManagerScreen, routeManagerKey } from "../../../src/tui/render-manager"
import { renderSearchEverythingScreen, routeSearchEverythingKey } from "../../../src/tui/render-search-everything"
import { tuiTheme } from "../../../src/tui/theme"
import type { TuiState } from "../../../src/tui/state"
import { createWorkspaceController, type WorkspaceController } from "../../../src/tui/workspace-controller"
import type { ManagerBrowserModel } from "../../../src/tui/adapters/note-manager-adapter"

function descendants(node: { getChildren: () => any[] }): any[] {
  return node.getChildren().flatMap((child) => [child, ...descendants(child)])
}

function findById(node: { getChildren: () => any[] }, id: string): any | undefined {
  return descendants(node).find((child) => child.id === id)
}

function assertTransparentBackground(value: { toInts?: () => number[] } | undefined, label: string): void {
  assert.deepEqual(value?.toInts?.(), [0, 0, 0, 0], label)
}

function assertNoOpaqueBlackBackground(value: { toInts?: () => number[] } | undefined, label: string): void {
  assert.notDeepEqual(value?.toInts?.(), [0, 0, 0, 255], label)
}

const darkPanelBackgrounds = new Set([
  "17,24,39,255", // tuiTheme.panel / surfacePanel
  "22,32,51,255", // tuiTheme.surfacePanelRaised
])

function colorTuple(value: { toInts?: () => number[] } | undefined): string | undefined {
  return value?.toInts?.().join(",")
}

function assertNoDarkPanelBackgrounds(nodes: any[], label: string): void {
  for (const node of nodes) {
    const nodeLabel = node.id ?? node.title ?? node.constructor?.name ?? "renderable"
    for (const [prop, value] of [["backgroundColor", node.backgroundColor], ["bg", node.bg]] as const) {
      const tuple = colorTuple(value)
      assert.equal(darkPanelBackgrounds.has(tuple ?? ""), false, `${label}: ${nodeLabel}.${prop} paints ${tuple}`)
    }
    const chunks = node.content?.chunks ?? []
    for (const [index, chunk] of chunks.entries()) {
      const tuple = colorTuple(chunk.bg)
      assert.equal(darkPanelBackgrounds.has(tuple ?? ""), false, `${label}: ${nodeLabel}.chunk[${index}].bg paints ${tuple}`)
    }
  }
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
    setEditorSelection: (start, end) => calls.push(`setEditorSelection:${start}:${end}`),
    copyAllEditorBody: () => {
      calls.push("copyAllEditorBody")
      return "copied all"
    },
    replaceAllEditorBodyFromClipboard: () => calls.push("replaceAllEditorBodyFromClipboard"),
    pasteEditorClipboard: (text) => {
      calls.push(`pasteEditorClipboard:${text ?? ""}`)
    },
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
    openManagerRename: () => calls.push("openManagerRename"),
    openManagerMove: () => calls.push("openManagerMove"),
    openSaveDraftAs: () => {
      calls.push("openSaveDraftAs")
      return { blocked: false }
    },
    updateManagerActionInput: (input) => calls.push(`updateManagerActionInput:${input}`),
    submitManagerAction: () => {
      calls.push("submitManagerAction")
      return { blocked: false }
    },
    cancelManagerAction: () => calls.push("cancelManagerAction"),
    openManagerDeleteConfirmation: () => calls.push("openManagerDeleteConfirmation"),
    confirmManagerDelete: async () => {
      calls.push("confirmManagerDelete")
      return { blocked: false }
    },
    cancelManagerDelete: () => calls.push("cancelManagerDelete"),
    renameFocusedManagerItem: (titleOrFolderName) => {
      calls.push(`renameFocusedManagerItem:${titleOrFolderName}`)
      return { blocked: false }
    },
    moveFocusedManagerNote: (destinationFolder) => {
      calls.push(`moveFocusedManagerNote:${destinationFolder}`)
      return { blocked: false }
    },
    setManagerFilter: (query) => calls.push(`setManagerFilter:${query}`),
    updateManagerFilter: (query) => calls.push(`updateManagerFilter:${query}`),
    clearManagerFilter: () => calls.push("clearManagerFilter"),
    toggleManagerPreview: () => calls.push("toggleManagerPreview"),
    setManagerPreviewVisible: (visible) => calls.push(`setManagerPreviewVisible:${visible}`),
    toggleSearchPreview: () => calls.push("toggleSearchPreview"),
    setSearchPreviewVisible: (visible) => calls.push(`setSearchPreviewVisible:${visible}`),
    toggleSearch: (query) => calls.push(`toggleSearch:${query ?? ""}`),
    openEditorFind: (query) => calls.push(`openEditorFind:${query ?? ""}`),
    openEditorReplace: (query) => calls.push(`openEditorReplace:${query ?? ""}`),
    updateEditorFindQuery: (query) => calls.push(`updateEditorFindQuery:${query}`),
    updateEditorReplacement: (replacement) => calls.push(`updateEditorReplacement:${replacement}`),
    setEditorReplaceField: (field) => calls.push(`setEditorReplaceField:${field}`),
    advanceEditorFind: (direction = "next") => calls.push(`advanceEditorFind:${direction}`),
    replaceCurrentEditorMatch: () => calls.push("replaceCurrentEditorMatch"),
    replaceAllEditorMatches: () => calls.push("replaceAllEditorMatches"),
    undoEditor: () => calls.push("undoEditor"),
    redoEditor: () => calls.push("redoEditor"),
    requestQuit: () => {
      calls.push("requestQuit")
      return { blocked: false }
    },
    dispose: () => calls.push("dispose"),
    startAiStartupScan: () => calls.push("startAiStartupScan"),
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
  test("default renderer disables mouse capture", () => {
    const config = defaultTuiRendererConfig()

    assert.equal(config.screenMode, "alternate-screen")
    assert.equal(config.exitOnCtrlC, true)
    assert.equal(config.useMouse, false)
    assert.equal(config.enableMouseMovement, false)
  })

  test("signal shutdown waits for renderer destroy before resolving", async () => {
    const renderer = new EventEmitter() as EventEmitter & { isDestroyed: boolean }
    renderer.isDestroyed = false
    let destroyCalls = 0
    const exitPromise = waitForInteractiveTuiExit({
      renderer: renderer as any,
      controller: {} as any,
      destroy: () => {
        destroyCalls += 1
      },
    })

    process.emit("SIGINT", "SIGINT")

    assert.equal(destroyCalls, 1)
    assert.equal(await Promise.race([exitPromise.then(() => "resolved"), new Promise((resolve) => setTimeout(() => resolve("pending"), 0))]), "pending")

    renderer.isDestroyed = true
    renderer.emit("destroy")

    assert.equal(await exitPromise, 1)
  })

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

  test("editor Alt+S opens save draft as", () => {
    const { controller, calls } = createController("editor")

    assert.equal(routeEditorKey("\u001bs", controller), true)
    assert.equal(routeEditorKey("\u001bS", controller), true)
    assert.deepEqual(calls, ["openSaveDraftAs", "openSaveDraftAs"])
  })

  test("editor Ctrl+F enters editor find mode from the body", () => {
    const { controller, calls } = createController("editor")

    assert.equal(routeEditorKey("\u0006", controller), true)
    assert.deepEqual(calls, ["openEditorFind:"])
  })


  test("editor Ctrl+R enters editor replace mode from the body", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"

    assert.equal(routeEditorKey("\u0012", controller), true)
    assert.deepEqual(calls, ["openEditorReplace:"])
  })

  test("editor Ctrl+R opens replace from the existing find window with the current query", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.find"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta alpha" },
      body: "alpha beta alpha",
      savedBody: "alpha beta alpha",
      dirty: false,
      findQuery: "alpha",
      findMatchCount: 2,
      activeFindIndex: 0,
    }

    assert.equal(routeEditorKey("\u0012", controller), true)

    assert.deepEqual(calls, ["openEditorReplace:alpha"])
  })

  test("editor keeps distinguishable Kitty Ctrl+H replace sequences as compatibility aliases and starts a fresh find field", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta alpha" },
      body: "alpha beta alpha",
      savedBody: "alpha beta alpha",
      dirty: false,
      findQuery: "alpha",
    }

    assert.equal(routeEditorKey("\u001b[104;5u", controller), true)
    assert.equal(routeEditorKey("\u001b[72;5u", controller), true)
    assert.deepEqual(calls, ["openEditorReplace:", "openEditorReplace:"])
  })

  test("editor body treats plain Ctrl+H/backspace and DEL as deletion, not replace", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "Alpha" },
      body: "Alpha",
      savedBody: "Alpha",
      dirty: false,
      findQuery: "Alpha",
    }

    assert.equal(routeEditorKey("\b", controller), false)
    assert.equal(routeControlledEditorBodyInput(controller, "\b"), true)
    assert.equal(routeControlledEditorBodyInput(controller, "\u007f"), true)
    assert.deepEqual(calls, ["backspaceEditor", "backspaceEditor"])
  })

  test("editor Alt+Z toggles wrap mode from the body", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"

    assert.equal(routeEditorKey("\u001bz", controller), true)
    assert.deepEqual(calls, ["toggleEditorWrapMode"])
  })

  test("editor leaves terminal paste compatibility chords to terminal paste delivery", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"

    assert.equal(routeEditorKey("\u0016", controller), false)
    assert.equal(routeEditorKey("\u001b[20~", controller), false)
    assert.equal(routeEditorKey("\u001bv", controller), false)
    assert.equal(routeEditorKey("\u001bV", controller), false)
    assert.equal(routeEditorKey("\u001b[118;6u", controller), false)
    assert.equal(routeEditorKey("\u001b[86;6u", controller), false)

    assert.deepEqual(calls, [])
  })

  test("workspace routes editor Ctrl+C to global quit instead of copy", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "Alpha Beta Gamma" },
      body: "Alpha Beta Gamma",
      savedBody: "Alpha Beta Gamma",
      dirty: false,
      selectionStart: 0,
      selectionEnd: 5,
    }
    let exited = false

    assert.deepEqual(routeWorkspaceKey("\u0003", controller, () => { exited = true }), { handled: true, exit: true })

    assert.equal(exited, true)
    assert.deepEqual(calls, ["requestQuit"])
  })

  test("editor no longer routes Ctrl+A or Alt+A to select all", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "Alpha Beta Gamma" },
      body: "Alpha Beta Gamma",
      savedBody: "Alpha Beta Gamma",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("\u0001", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u001ba", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u001bA", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u001bc", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u001bx", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u001bv", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u001b[20~", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u0016", controller, () => {}), { handled: false })

    assert.deepEqual(calls, [])
  })

  test("editor shortcut row advertises calm editor actions without clipboard or select-all hints", () => {
    const { controller } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" },
      body: "body",
      savedBody: "body",
      dirty: false,
    }

    const shortcuts = buildEditorViewModel(controller.getState()).bottombar.row2.shortcuts
    assert.ok(shortcuts.includes("[Ctrl+S] Save"))
    assert.ok(shortcuts.includes("[Ctrl+F] Find"))
    assert.ok(shortcuts.includes("[Ctrl+R] Replace"))
    assert.equal(shortcuts.some((shortcut) => /copy|paste|copy-all|replace-all|select all|Ctrl\+A|Alt\+A/iu.test(shortcut)), false)
    assert.equal(shortcuts.some((shortcut) => /\[F[6789]\]/u.test(shortcut)), false)
  })

  test("editor find mode leaves enhanced clipboard shortcuts to the focused find input", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.find"

    assert.equal(routeEditorKey("\u001b[99;6u", controller), false)
    assert.equal(routeEditorKey("\u001b[120;6u", controller), false)
    assert.equal(routeEditorKey("\u001b[118;6u", controller), false)
    assert.deepEqual(calls, [])
  })

  test("workspace body routing keeps bracketed paste as paste text fallback instead of clipboard shortcut", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.body"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" },
      body: "",
      savedBody: "",
      dirty: false,
    }

    assert.deepEqual(routeWorkspaceKey("\u001b[200~from terminal\u001b[201~", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["pasteEditorClipboard:from terminal"])
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
      let screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const findInput = findById(screen, "bluenote-editor-find-query")
      findInput?.blur()

      assert.equal(findInput?.focused, false)
      focusActiveWorkspaceInput(screen)
      assert.equal(findInput?.focused, true)
      blurWorkspaceInputs(screen)
      assert.equal(findInput?.focused, false)

      controller.openEditorReplace()
      screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const replacementFindInput = findById(screen, "bluenote-editor-find-query")
      const replacementFocusOwners = descendants(screen).filter((node) => (node.id === "bluenote-editor-replace-text" || node.id === "bluenote-editor-find-query" || node.id === "bluenote-editor-body-input") && node.focused)
      assert.deepEqual(replacementFocusOwners.map((node) => node.id), ["bluenote-editor-find-query"])

      focusActiveWorkspaceInput(screen)
      assert.equal(replacementFindInput?.focused, true)
      blurWorkspaceInputs(screen)
      assert.equal(replacementFindInput?.focused, false)
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

  test("editor replace mode leaves text editing to focused inputs while routing Tab, Enter, Alt+Enter, and Escape", () => {
    const { controller, calls } = createController("editor")
    controller.getState().mode = "editor.replace"
    controller.getState().editor = {
      note: { key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "needle body" },
      body: "needle body",
      savedBody: "needle body",
      dirty: false,
      findQuery: "needle",
      replacementText: "thread",
      replaceField: "find",
    }

    assert.equal(routeEditorKey("x", controller), false)
    assert.equal(routeEditorKey("\u007f", controller), false)
    assert.equal(routeEditorKey("\t", controller), true)
    controller.getState().editor!.replaceField = "replacement"
    assert.equal(routeEditorKey("\r", controller), true)
    assert.equal(routeEditorKey("\u001b\r", controller), true)
    assert.equal(routeEditorKey("\u001b", controller), true)

    assert.deepEqual(calls, [
      "setEditorReplaceField:replacement",
      "replaceCurrentEditorMatch",
      "replaceAllEditorMatches",
      "goBack",
    ])
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
    assert.deepEqual(calls, ["pasteEditorClipboard:/literal   text"])
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
    assert.deepEqual(calls, ["pasteEditorClipboard:red text"])
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
    assert.deepEqual(calls, ["pasteEditorClipboard:plainred"])
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
    assert.deepEqual(calls, ["pasteEditorClipboard:abred"])
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
    assert.deepEqual(calls, ["pasteEditorClipboard:cd ef"])
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

  test("editor body renders without root/body borders, background fills, border title, or custom cursor glyph", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      const screen = renderEditorScreen({ renderer, controller }) as { border?: boolean; title?: unknown; getChildren: () => any[] }
      renderer.root.add(screen as any)

      const bodyInput = findById(screen, "bluenote-editor-body-input") as { backgroundColor?: { toInts?: () => number[] }; border?: boolean; title?: unknown } | undefined
      const bodyTopSeparator = findById(screen, "bluenote-editor-top-body-separator") as { content?: any; fg?: { toInts?: () => number[] }; backgroundColor?: { toInts?: () => number[] } } | undefined
      const bodyBottomSeparator = findById(screen, "bluenote-editor-body-bottom-separator") as { content?: any; fg?: { toInts?: () => number[] }; backgroundColor?: { toInts?: () => number[] } } | undefined
      const bodyTopMargin = findById(screen, "bluenote-editor-body-margin-top") as { backgroundColor?: { toInts?: () => number[] } } | undefined
      const bodyContentRow = findById(screen, "bluenote-editor-body-content-row") as { backgroundColor?: { toInts?: () => number[] } } | undefined
      const bodyDisplay = findById(screen, "bluenote-editor-body") as { bg?: { toInts?: () => number[] }; content?: { chunks?: Array<{ text?: string }> } | string } | undefined
      const renderables = [screen, ...descendants(screen)]
      assertNoDarkPanelBackgrounds(renderables, "editor chrome keeps terminal-default backgrounds")
      const renderableText = renderables.map((node) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")
      const titleText = renderables.map((node) => node.title ?? "").join("\n")
      const bodyText = typeof bodyDisplay?.content === "string" ? bodyDisplay.content : bodyDisplay?.content?.chunks?.[0]?.text ?? ""

      assert.equal(screen.border, false)
      assert.notEqual(bodyTopSeparator, undefined)
      assert.notEqual(bodyBottomSeparator, undefined)
      assert.equal(bodyTopSeparator?.content?.chunks?.[0]?.text ?? bodyTopSeparator?.content, "─".repeat(80))
      assert.equal(bodyBottomSeparator?.content?.chunks?.[0]?.text ?? bodyBottomSeparator?.content, "─".repeat(80))
      assert.deepEqual(bodyTopSeparator?.fg?.toInts?.(), [51, 65, 85, 255])
      assert.deepEqual(bodyBottomSeparator?.fg?.toInts?.(), [51, 65, 85, 255])
      assertNoOpaqueBlackBackground(bodyTopSeparator?.backgroundColor, "editor top/body separator keeps terminal-default transparent background")
      assertNoOpaqueBlackBackground(bodyBottomSeparator?.backgroundColor, "editor body/bottombar separator keeps terminal-default transparent background")
      assertTransparentBackground((screen as any).backgroundColor, "editor root keeps terminal-default transparent background")
      assert.ok(bodyInput && (bodyInput.border === false || bodyInput.title === undefined))
      assertNoOpaqueBlackBackground(bodyInput?.backgroundColor, "editor body input must not paint opaque black")
      assertTransparentBackground(bodyTopMargin?.backgroundColor, "editor top margin keeps terminal-default transparent background")
      assertTransparentBackground(bodyContentRow?.backgroundColor, "editor body row keeps terminal-default transparent background")
      assertNoOpaqueBlackBackground(bodyDisplay?.bg, "editor body text must not paint opaque black")
      assert.doesNotMatch(titleText, /Editor body|Line \d+, Col \d+/u)
      assert.doesNotMatch(renderableText, /Editor body/u)
      assert.doesNotMatch(bodyText, /[|▌]/u)
      assert.doesNotMatch(renderableText, /Line \d+, Col \d+|Ln \d+, Col \d+/u)
      assert.match(renderableText, /\[Ctrl\+S\]/u)
    } finally {
      renderer.destroy()
    }
  })

  test("editor find and topbar chrome keep terminal-default backgrounds", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta alpha" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta alpha" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      controller.openEditorFind("alpha")
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      assert.notEqual(findById(screen, "bluenote-editor-find-bar"), undefined)
      assertNoDarkPanelBackgrounds([screen, ...descendants(screen)], "editor find/topbar/shortcut chrome keeps terminal-default backgrounds")
    } finally {
      renderer.destroy()
    }
  })

  test("editor find and replace sheets keep the bottom shortcut bar renderable populated", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as typeof renderer & { width?: number; height?: number }).width = 100
      ;(renderer as typeof renderer & { width?: number; height?: number }).height = 30
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta alpha" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta alpha" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)

      controller.openEditorFind("alpha")
      let screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      let shortcutRow = findById(screen, "bluenote-editor-bottombar-shortcuts") as { content?: any } | undefined
      let shortcutText = shortcutRow?.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? shortcutRow?.content ?? ""
      assert.notEqual(findById(screen, "bluenote-editor-find-bar"), undefined)
      assert.match(shortcutText, /\[Ctrl\+S\] Save/u)
      assert.match(shortcutText, /\[Ctrl\+F\] Find/u)
      assert.match(shortcutText, /\[Ctrl\+R\] Replace/u)
      assert.doesNotMatch(shortcutText, /copy|paste|copy-all|replace-all|select all|Ctrl\+A|Alt\+A/iu)
      assert.doesNotMatch(shortcutText, /\[F[6789]\]/u)
      assert.doesNotMatch(shortcutText, /\[Alt\+[CX]\]/u)

      renderer.root.remove(screen.id)
      screen.destroyRecursively()
      controller.openEditorReplace("alpha")
      screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      shortcutRow = findById(screen, "bluenote-editor-bottombar-shortcuts") as { content?: any } | undefined
      shortcutText = shortcutRow?.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? shortcutRow?.content ?? ""
      assert.notEqual(findById(screen, "bluenote-editor-replace-text"), undefined)
      assert.match(shortcutText, /\[Ctrl\+S\] Save/u)
      assert.match(shortcutText, /\[Ctrl\+F\] Find/u)
      assert.match(shortcutText, /\[Ctrl\+R\] Replace/u)
      assert.doesNotMatch(shortcutText, /copy|paste|copy-all|replace-all|select all|Ctrl\+A|Alt\+A/iu)
      assert.doesNotMatch(shortcutText, /\[F[6789]\]/u)
      assert.doesNotMatch(shortcutText, /\[Alt\+[CX]\]/u)
    } finally {
      renderer.destroy()
    }
  })

  test("editor viewport height matches the status-row-free chrome at 24 rows", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as typeof renderer & { height?: number; width?: number }).height = 24
      ;(renderer as typeof renderer & { height?: number; width?: number }).width = 80
      const body = Array.from({ length: 21 }, (_, index) => `line ${index + 1}`).join("\n")
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)

      const bodyDisplay = findById(screen, "bluenote-editor-body") as { scrollY?: number } | undefined
      assert.equal(bodyDisplay?.scrollY, 1)
    } finally {
      renderer.destroy()
    }
  })

  test("editor body content uses neutral foreground instead of accent coloring", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)

      const bodyDisplay = findById(screen, "bluenote-editor-body") as { fg?: { toInts?: () => number[] } } | undefined

      assert.deepEqual(bodyDisplay?.fg?.toInts?.(), [255, 255, 255, 255])
    } finally {
      renderer.destroy()
    }
  })

  test("editor renderer lays out topbar updated time right and shortcut row", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as any).width = 120
      const { controller } = createController("editor")
      controller.getState().mode = "editor.body"
      controller.getState().editor = {
        note: { key: "daily", title: "Daily", description: "", relativePath: "notes/inbox/daily.md", body: "body", updatedAt: "2026-05-28T10:30:00.000Z" } as any,
        body: "body",
        savedBody: "body",
        dirty: false,
      }
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)

      const topbar = findById(screen, "bluenote-editor-topbar")
      const topbarChildren = topbar?.getChildren?.() ?? []
      const title = findById(screen, "bluenote-editor-topbar-title") as { content?: any; width?: number } | undefined
      const path = findById(screen, "bluenote-editor-topbar-path") as { content?: any; fg?: string } | undefined
      const updated = findById(screen, "bluenote-editor-topbar-updated") as { content?: any; fg?: string } | undefined
      const topbarSpacer = findById(screen, "bluenote-editor-topbar-spacer") as { yogaNode?: { getFlexGrow?: () => number } } | undefined
      const shortcutRow = findById(screen, "bluenote-editor-bottombar-shortcuts") as { content?: any } | undefined
      const topbarWrap = findById(screen, "bluenote-editor-topbar-wrap") as { content?: any; fg?: string } | undefined
      const topbarSaveStatus = findById(screen, "bluenote-editor-topbar-save-status") as { content?: any; fg?: string } | undefined

      assert.deepEqual(topbarChildren.map((child: any) => child.id), [
        "bluenote-editor-topbar-title",
        "bluenote-editor-topbar-separator-path",
        "bluenote-editor-topbar-path",
        "bluenote-editor-topbar-spacer",
        "bluenote-editor-topbar-separator-updated",
        "bluenote-editor-topbar-updated",
        "bluenote-editor-topbar-separator-status",
        "bluenote-editor-topbar-save-status",
        "bluenote-editor-topbar-separator-wrap",
        "bluenote-editor-topbar-wrap",
      ])
      assert.equal(title?.content?.chunks?.[0]?.text ?? title?.content, "Daily ")
      assert.equal(title?.width, "Daily ".length)
      assert.doesNotMatch(String(title?.content?.chunks?.[0]?.text ?? title?.content), /^\s/u)
      assert.equal(path?.content?.chunks?.[0]?.text ?? path?.content, "notes/inbox/daily.md")
      assert.deepEqual((path as any)?.fg?.toInts?.(), [148, 163, 184, 255])
      assert.equal(topbarSpacer?.yogaNode?.getFlexGrow?.(), 1)
      const expectedUpdated = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date("2026-05-28T10:30:00.000Z")).replace(",", "")
      assert.equal(updated?.content?.chunks?.[0]?.text ?? updated?.content, `Updated ${expectedUpdated}`)
      assert.deepEqual((updated as any)?.fg?.toInts?.(), [148, 163, 184, 255])
      assert.equal(topbarWrap?.content?.chunks?.[0]?.text ?? topbarWrap?.content, "Wrap on")
      assert.deepEqual((topbarWrap as any)?.fg?.toInts?.(), [96, 165, 250, 255])
      assert.equal(topbarSaveStatus?.content?.chunks?.[0]?.text ?? topbarSaveStatus?.content, "Saved")
      assert.deepEqual((topbarSaveStatus as any)?.fg?.toInts?.(), [34, 197, 94, 255])
      assert.equal(findById(screen, "bluenote-editor-bottombar-status-row"), undefined)
      assert.equal(findById(screen, "bluenote-editor-bottombar-wrap-status"), undefined)
      assert.equal(findById(screen, "bluenote-editor-bottombar-save-status"), undefined)
      const shortcutChunks = shortcutRow?.content?.chunks ?? []
      const shortcutText = shortcutChunks.map((chunk: { text?: string }) => chunk.text ?? "").join("") || shortcutRow?.content
      assert.equal(shortcutText, "[Ctrl+S] Save  [Ctrl+F] Find  [Ctrl+R] Replace  [Ctrl+P] Search  [Esc] Manager  [Ctrl+Z] Undo  [Ctrl+Y] Redo  +1")
      assert.deepEqual(shortcutChunks.filter((chunk: { text?: string }) => /^\[[^\]]+\]$/u.test(chunk.text ?? "")).at(0)?.fg?.toInts?.(), [56, 189, 248, 255])
    } finally {
      renderer.destroy()
    }
  })

  test("editor body renders a visible styled cursor cell without inserting a glyph", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "body" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      focusActiveWorkspaceInput(screen)

      const bodyDisplay = findById(screen, "bluenote-editor-body") as { content?: { chunks?: Array<{ text?: string; bg?: { toInts?: () => number[] }; fg?: { toInts?: () => number[] } }> } | string } | undefined
      const chunks = typeof bodyDisplay?.content === "string" ? [] : bodyDisplay?.content?.chunks ?? []
      const plainText = chunks.map((chunk) => chunk.text ?? "").join("")
      const cursorChunk = chunks.find((chunk) => chunk.bg?.toInts?.().join(",") === "56,189,248,255")

      assert.equal(plainText, "body ")
      assert.doesNotMatch(plainText, /[|▌█]/u)
      assert.equal(cursorChunk?.text, " ")
      assert.deepEqual(cursorChunk?.fg?.toInts?.(), [0, 0, 0, 255])
    } finally {
      renderer.destroy()
    }
  })

  test("editor body renders a visible styled cursor cell before a newline", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "abc\ndef" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "abc\ndef" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      controller.moveEditorCursor("left")
      controller.moveEditorCursor("left")
      controller.moveEditorCursor("left")
      controller.moveEditorCursor("left")
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      focusActiveWorkspaceInput(screen)

      const bodyDisplay = findById(screen, "bluenote-editor-body") as { content?: { chunks?: Array<{ text?: string; bg?: { toInts?: () => number[] }; fg?: { toInts?: () => number[] } }> } | string } | undefined
      const chunks = typeof bodyDisplay?.content === "string" ? [] : bodyDisplay?.content?.chunks ?? []
      const plainText = chunks.map((chunk) => chunk.text ?? "").join("")
      const cursorChunk = chunks.find((chunk) => chunk.bg?.toInts?.().join(",") === "56,189,248,255")

      assert.equal(plainText, "abc \ndef")
      assert.equal(cursorChunk?.text, " ")
      assert.doesNotMatch(plainText, /[|▌█]/u)
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

  test("runtime workspace routes renderer-level OpenTUI PasteEvent into focused editor body", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      const keyInput = renderer.keyInput

      const running = await startTuiWorkspace({ renderer, controller })
      const paste = new PasteEvent(new TextEncoder().encode("Runtime paste\nfrom terminal"))
      keyInput.emit("paste", paste)
      await new Promise((resolve) => setTimeout(resolve, 0))

      assert.equal(paste.defaultPrevented, true)
      assert.equal(paste.propagationStopped, true)
      assert.equal(controller.getState().editor?.body, "Runtime paste\nfrom terminal")
      running.destroy()

      const cleanupPaste = new PasteEvent(new TextEncoder().encode("after cleanup"))
      keyInput.emit("paste", cleanupPaste)
      assert.equal(controller.getState().editor?.body, "Runtime paste\nfrom terminal")
    } finally {
      if (!renderer.isDestroyed) {
        renderer.destroy()
      }
    }
  })

  test("editor body handles OpenTUI PasteEvent emitted by terminal bracketed paste", async () => {
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
      const bodyInput = findById(screen, "bluenote-editor-body-input") as { onPaste?: (event: PasteEvent) => void } | undefined
      const paste = new PasteEvent(new TextEncoder().encode("Terminal paste\nsecond line"))

      bodyInput?.onPaste?.(paste)
      assert.equal(paste.defaultPrevented, true)
      assert.equal(paste.propagationStopped, true)
      assert.equal(controller.getState().editor?.body, "Terminal paste\nsecond line")

      const rootPaste = new PasteEvent(new TextEncoder().encode("\nroot paste fallback"))
      ;(screen as unknown as { onPaste?: (event: PasteEvent) => void }).onPaste?.(rootPaste)

      assert.equal(rootPaste.defaultPrevented, true)
      assert.equal(rootPaste.propagationStopped, true)
      assert.equal(controller.getState().editor?.body, "Terminal paste\nsecond line\nroot paste fallback")
      assert.equal(controller.getState().editor?.dirty, true)

      controller.openEditorFind()
      const findPaste = new PasteEvent(new TextEncoder().encode("should stay in focused find input"))
      ;(screen as unknown as { onPaste?: (event: PasteEvent) => void }).onPaste?.(findPaste)

      assert.equal(findPaste.defaultPrevented, false)
      assert.equal(findPaste.propagationStopped, false)
      assert.equal(controller.getState().editor?.body, "Terminal paste\nsecond line\nroot paste fallback")
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

  test("Search Everything renderer prints raw preview title and content without preview chrome", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily Plan", description: "Today priorities.", relativePath: "notes/inbox/daily-plan.md", body: "Today priorities." }],
        showNote: () => ({ key: "daily", title: "Daily Plan", description: "Today priorities.", relativePath: "notes/inbox/daily-plan.md", body: "Today priorities." }),
        searchNotes: () => [],
      })
      controller.openSearch("daily")

      const screen = renderSearchEverythingScreen({ renderer, controller })
      const previewRegion = findById(screen, "bluenote-search-preview-region") as { title?: string; getChildren: () => any[] } | undefined
      const textForNode = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
      const previewLines = previewRegion?.getChildren().map(textForNode) ?? []
      const previewText = previewLines.join("\n")

      assert.equal(previewRegion?.title, "")
      assert.deepEqual(previewLines.slice(0, 2), ["notes/inbox/daily-plan.md", "Today priorities."])
      assert.doesNotMatch(previewText, /Preview ·|Summary|Excerpt|Items|Availability|Usage:|Shortcut:|Risk:/u)
    } finally {
      renderer.destroy()
    }
  })

  test("Search Everything renderer keeps stable panel title and no redundant query subtitle", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "daily body" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "daily body" }),
        searchNotes: () => [],
      })
      controller.openSearch("daily")

      const screen = renderSearchEverythingScreen({ renderer, controller })
      const textForNode = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
      const allText = descendants(screen).map(textForNode).join("\n")
      const directText = screen.getChildren().map(textForNode)
      const inputRegion = findById(screen, "bluenote-search-input-region") as { title?: string; getChildren: () => any[] } | undefined
      const footer = findById(screen, "bluenote-search-footer-hints")

      assert.equal(inputRegion?.title, "Search Everything")
      assert.equal(directText.includes("Search Everything"), false)
      assert.doesNotMatch(allText, /Search · daily|Search · type to begin/u)
      assert.match(textForNode(footer), /\[Ctrl\+P\] Close/u)
    } finally {
      renderer.destroy()
    }
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

  test("workspace route leaves q inside manager rename, move, and save-draft-as prompts", () => {
    const rename = createController("manager")
    rename.controller.getState().mode = "manager.rename"
    rename.controller.getState().manager.actionDraft = { kind: "rename", input: "Qu", status: null }

    assert.deepEqual(routeWorkspaceKey("q", rename.controller, () => {}), { handled: true })
    assert.deepEqual(rename.calls, ["updateManagerActionInput:Quq"])

    const move = createController("manager")
    move.controller.getState().mode = "manager.move"
    move.controller.getState().manager.actionDraft = { kind: "move", input: "note", status: null, sourceKey: "daily-plan", sourceRelativePath: "notes/daily-plan.md" }

    assert.deepEqual(routeWorkspaceKey("q", move.controller, () => {}), { handled: true })
    assert.deepEqual(move.calls, [])

    const saveDraftAs = createController("manager")
    saveDraftAs.controller.getState().mode = "manager.saveDraftAs"
    saveDraftAs.controller.getState().manager.actionDraft = { kind: "saveDraftAs", input: "Qu", status: null, sourceKey: "draft-abc123", sourceRelativePath: "draft/draft-abc123.md" }

    assert.deepEqual(routeWorkspaceKey("q", saveDraftAs.controller, () => {}), { handled: true })
    assert.deepEqual(saveDraftAs.calls, ["updateManagerActionInput:Quq"])
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

  test("manager save-draft-as route edits title, selects folders, submits, and cancels", () => {
    const { controller, calls } = createController("manager")
    controller.getState().mode = "manager.saveDraftAs"
    controller.getState().manager.actionDraft = { kind: "saveDraftAs", input: "Draft", status: null, sourceKey: "draft-abc123", sourceRelativePath: "draft/draft-abc123.md" }

    assert.equal(routeManagerKey("!", controller), true)
    assert.equal(routeManagerKey("\u001b[A", controller), true)
    assert.equal(routeManagerKey("\u001b[B", controller), true)
    assert.equal(routeManagerKey("\r", controller), true)
    assert.equal(routeManagerKey("\u001b", controller), true)

    assert.deepEqual(calls, [
      "updateManagerActionInput:Draft!",
      "moveManagerSelection:up",
      "moveManagerSelection:down",
      "submitManagerAction",
      "cancelManagerAction",
    ])
  })

  test("manager route maps p to preview toggle while s and Ctrl+P still open Search Everything", () => {
    const { controller, calls } = createController("manager")

    assert.equal(routeManagerKey("p", controller), true)
    assert.equal(routeManagerKey("s", controller), true)
    assert.deepEqual(routeWorkspaceKey("\u0010", controller, () => {}), { handled: true })

    assert.deepEqual(calls, ["toggleManagerPreview", "openSearch:", "toggleSearch:"])
  })

  test("manager view model uses note title and description columns with filename fallback", () => {
    const state: TuiState = {
      screen: "manager",
      manager: { items: [], focusedIndex: 0, selectedNoteKey: null, currentFolderPath: "notes/inbox" },
      editor: null,
      search: null,
    }
    const titledNote = {
      type: "note" as const,
      key: "daily-plan",
      filename: "daily-plan.md",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
      index: 0,
      focused: true,
      selected: false,
      columns: { filename: "daily-plan.md", title: "Daily Plan", description: "Today priorities." },
      rowStyleIntent: "note" as const,
    }
    const untitledNote = {
      type: "note" as const,
      key: "untitled",
      filename: "untitled.md",
      title: "   ",
      description: "Needs a title.",
      relativePath: "notes/inbox/untitled.md",
      index: 1,
      focused: false,
      selected: false,
      columns: { filename: "untitled.md", title: "   ", description: "Needs a title." },
      rowStyleIntent: "note" as const,
    }
    const folder = {
      type: "folder" as const,
      key: "notes/inbox/projects",
      filename: "projects",
      title: "Projects",
      description: "2 notes",
      relativePath: "notes/inbox/projects",
      index: 2,
      focused: false,
      selected: false,
      columns: { filename: "projects", title: "Projects", description: "2 notes" },
      rowStyleIntent: "folder" as const,
    }
    const vm = buildManagerViewModel(state, {
      layout1Rows: [titledNote, untitledNote, folder],
      preview: { type: "folder", path: "notes/inbox/projects", rows: [titledNote, untitledNote] },
      currentFolderPath: "notes/inbox",
      hoveredPath: titledNote.relativePath,
      focusedIndex: 0,
      empty: false,
      state: state.manager,
    }, { width: 100 })

    assert.deepEqual(vm.layout1.rows.map((row) => row.displaySegments), [
      { primary: "Daily Plan", secondary: "Today priorities.", metadata: "" },
      { primary: "untitled.md", secondary: "Needs a title.", metadata: "" },
      { primary: "Projects", secondary: "2 notes", metadata: "" },
    ])
    assert.equal(vm.layout2.preview.type, "folder")
    if (vm.layout2.preview.type === "folder") {
      assert.deepEqual(vm.layout2.preview.rows.map((row) => row.displaySegments), [
        { primary: "Daily Plan", secondary: "Today priorities.", metadata: "" },
        { primary: "untitled.md", secondary: "Needs a title.", metadata: "" },
      ])
    }
  })

  test("manager renderer prints simplified topbar and currently-open footer label", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const { controller } = createController("manager")
      const state = controller.getState()
      state.manager = {
        items: [{ type: "note", key: "daily-plan", filename: "daily-plan.md", title: "Daily Plan", description: "Today", relativePath: "notes/inbox/daily-plan.md" }],
        focusedIndex: 0,
        selectedNoteKey: "daily-plan",
        currentFolderPath: "notes/inbox",
        hoveredPath: "notes/inbox/daily-plan.md",
        filterQuery: "daily",
        status: "Indexing...",
      }
      state.editor = {
        note: { key: "daily-plan", title: "Daily Plan", description: "Today", relativePath: "notes/inbox/daily-plan.md", body: "Body" },
        body: "Body",
        savedBody: "Body",
        dirty: false,
      }

      const screen = renderManagerScreen({ renderer, controller, width: 60 })
      renderer.root.add(screen)
      const textLines = descendants(screen).map((node) => node.content?.chunks?.map((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? "")
      const renderedText = textLines.join("\n")

      assert.ok(textLines.includes("BlueNote  Workspace · notes/inbox  1 items (filtered) · Indexing..."))
      assert.match(renderedText, /Currently open: Daily Plan/u)
      assert.match(renderedText, /AI: not configured/u)
      assert.match(renderedText, /\[\/\] Filter/u)
      assert.doesNotMatch(renderedText, /Rebuild idle|Index ready|selected daily-plan|notes\/inbox → notes\/inbox\/daily-plan\.md|filter “daily”/u)
    } finally {
      renderer.destroy()
    }
  })

  test("manager renderer styles topbar and footer hints with semantic muted/keycap chrome", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const { controller } = createController("manager")
      controller.getState().manager.items = [{ type: "note", key: "daily", filename: "daily.md", title: "Daily", description: "Today", relativePath: "notes/daily.md" }]
      const screen = renderManagerScreen({ renderer, controller, width: 100 })
      renderer.root.add(screen)

      const topbar = findById(screen, "bluenote-manager-topbar") as { fg?: { toInts?: () => number[] }; border?: boolean } | undefined
      const footer = findById(screen, "bluenote-manager-footer-hints") as { content?: any; fg?: { toInts?: () => number[] }; border?: boolean } | undefined
      const footerChunks = footer?.content?.chunks ?? []
      const footerText = footerChunks.map((chunk: { text?: string }) => chunk.text ?? "").join("") || footer?.content || ""

      assertNoDarkPanelBackgrounds([screen, ...descendants(screen)], "manager panes and chrome keep terminal-default backgrounds")
      assertTransparentBackground((screen as any).backgroundColor, "manager root keeps terminal-default transparent background")
      assert.notEqual(topbar, undefined)
      assert.notEqual(topbar?.border, true)
      assert.deepEqual(topbar?.fg?.toInts?.(), [248, 250, 252, 255])
      assert.notEqual(footer?.border, true)
      assert.equal(footerText, "[Enter] Open  [/] Filter  [Ctrl+P] Search  [Esc] Back  [p] Preview  [r] Rename  [m] Move")
      assert.deepEqual(footerChunks.filter((chunk: { text?: string }) => /^\[[^\]]+\]$/u.test(chunk.text ?? "")).map((chunk: any) => chunk.fg?.toInts?.()), [
        [56, 189, 248, 255],
        [56, 189, 248, 255],
        [56, 189, 248, 255],
        [56, 189, 248, 255],
        [56, 189, 248, 255],
        [56, 189, 248, 255],
        [56, 189, 248, 255],
      ])
      assert.deepEqual(footerChunks.filter((chunk: { text?: string }) => !/^\[[^\]]+\]$/u.test(chunk.text ?? "")).at(0)?.fg?.toInts?.(), [148, 163, 184, 255])
      assert.notEqual(tuiTheme.borderSubtle, tuiTheme.primaryAccent)
    } finally {
      renderer.destroy()
    }
  })

  test("manager renderer bounds row text segments so long labels cannot expand into the preview pane", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const { controller } = createController("manager")
      const rows = [
        {
          type: "folder" as const,
          key: "long-folder",
          filename: `${"folder-".repeat(12)}/`,
          title: "folder-".repeat(12),
          description: "folder description ".repeat(8),
          relativePath: `notes/${"folder-".repeat(12)}`,
          index: 0,
          focused: true,
          selected: false,
          columns: { filename: `${"folder-".repeat(12)}/`, title: "folder-".repeat(12), description: "folder description ".repeat(8) },
          rowStyleIntent: "folder" as const,
        },
        {
          type: "note" as const,
          key: "long-note",
          filename: "long-note.md",
          title: `Launch notes ${"日本語".repeat(8)} ${"alpha ".repeat(10)}`,
          description: "description ".repeat(20),
          relativePath: "notes/long-note.md",
          index: 1,
          focused: false,
          selected: false,
          columns: { filename: "long-note.md", title: `Launch notes ${"日本語".repeat(8)} ${"alpha ".repeat(10)}`, description: "description ".repeat(20) },
          rowStyleIntent: "note" as const,
        },
      ]
      controller.getState().manager.items = rows
      controller.getManagerBrowserModel = () => ({
        layout1Rows: rows,
        preview: { type: "empty", path: null },
        currentFolderPath: "",
        hoveredPath: rows[0]!.relativePath,
        focusedIndex: 0,
        empty: false,
        state: controller.getState().manager,
      })

      const screen = renderManagerScreen({ renderer, controller, width: 80 })
      renderer.root.add(screen)
      const layout1 = findById(screen, "bluenote-manager-layout-1") as { getChildren: () => any[] } | undefined
      const renderRows = layout1?.getChildren().filter((node: any) => node.getChildren?.().length === 2) ?? []

      assert.equal(renderRows.length >= 2, true)
      for (const row of renderRows.slice(0, 2)) {
        assert.equal((row as any)._width, "100%")
        assert.equal(row.yogaNode?.getFlexShrink?.(), 1)
        const [primary, secondary] = row.getChildren()
        assert.equal((primary as any)._width, 24)
        assert.equal((secondary as any)._width, 12)
        assert.equal(primary.yogaNode?.getFlexShrink?.(), 0)
        assert.equal(secondary.yogaNode?.getFlexShrink?.(), 1)
        const primaryText = primary.content?.chunks?.[0]?.text ?? primary.content ?? ""
        const secondaryText = secondary.content?.chunks?.[0]?.text ?? secondary.content ?? ""
        assert.equal(primaryText.length <= 24, true, primaryText)
        assert.equal(secondaryText.length <= 12, true, secondaryText)
      }
    } finally {
      renderer.destroy()
    }
  })

  test("manager renderer omits redundant Preview label before note content", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "Today", relativePath: "notes/daily.md", body: "# Daily\n\nNote body first line" }),
        searchNotes: () => [],
      })
      controller.refreshManager()

      const screen = renderManagerScreen({ renderer, controller, width: 100 })
      renderer.root.add(screen)
      const layout2 = findById(screen, "bluenote-manager-layout-2") as { title?: string } | undefined
      const renderedLines = descendants(screen).map((node) => node.content?.chunks?.map((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? "")
      const renderedText = renderedLines.join("\n")

      assert.notEqual(layout2, undefined)
      assert.notEqual(layout2?.title, "Preview")
      assert.match(renderedText, /# Daily/u)
      assert.match(renderedText, /Note body first line/u)
      assert.equal(renderedLines.includes("Preview"), false)
    } finally {
      renderer.destroy()
    }
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
      assert.doesNotMatch(narrowText, /daily\.md/u)
      assert.match(narrowText, /Daily/u)
      assert.match(narrowText, /Today/u)
      assert.doesNotMatch(narrowText, /notes\/daily\.md/u)
      assert.match(narrowText, /Preview hidden for narrow terminal · p show/u)
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
      assert.doesNotMatch(narrowText, /daily\.md/u)
      assert.match(narrowText, /Daily/u)
      assert.match(narrowText, /Today/u)
      assert.doesNotMatch(narrowText, /notes\/daily\.md/u)
      assert.doesNotMatch(narrowText, /Preview hidden \(narrow width\)/u)
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
      assert.doesNotMatch(manualHiddenText, /Preview hidden \(manual\)/u)
    } finally {
      renderer.destroy()
    }
  })

  test("manager prompt bars keep terminal-default backgrounds", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      for (const mode of ["manager.filter", "manager.create", "manager.deleteConfirm"] as const) {
        const { controller } = createController("manager")
        const state = controller.getState()
        state.mode = mode
        state.manager.items = [{ type: "note", key: "daily", filename: "daily.md", title: "Daily", description: "Today", relativePath: "notes/daily.md" }]
        if (mode === "manager.filter") {
          state.manager.filterQuery = "da"
        }
        if (mode === "manager.create") {
          state.manager.createDraft = { title: "New", status: null }
        }
        if (mode === "manager.deleteConfirm") {
          state.manager.deleteDraft = { key: "daily", title: "Daily", relativePath: "notes/daily.md", status: null }
        }
        const screen = renderManagerScreen({ renderer, controller, width: 100 })
        renderer.root.add(screen)
        assertNoDarkPanelBackgrounds([screen, ...descendants(screen)], `${mode} prompt keeps terminal-default backgrounds`)
        renderer.root.remove(screen.id)
        screen.destroyRecursively()
      }
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

  test("search route ignores Enter when no results exist", () => {
    const { controller, calls } = createController("search")

    assert.equal(routeSearchEverythingKey("\r", controller), true)
    assert.deepEqual(calls, [])
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
      const textFor = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
      const text = descendants(screen).map(textFor).join("\n")
      const titleRow = screen.getChildren().find((node: any) => textFor(node) === "Search Everything") as { bg?: { toInts?: () => number[] } } | undefined
      assertNoDarkPanelBackgrounds([screen, ...descendants(screen)], "search input/results/preview chrome keep terminal-default backgrounds")
      assertTransparentBackground((screen as any).backgroundColor, "search root keeps terminal-default transparent background")
      assertNoOpaqueBlackBackground(titleRow?.bg, "search title row must not paint opaque black")
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
