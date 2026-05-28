import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { createCliRenderer, InputRenderable, type Renderable } from "@opentui/core"

import { buildEditorViewModel, renderEditorScreen } from "../../../src/tui/render-editor"
import { buildManagerViewModel, renderManagerScreen } from "../../../src/tui/render-manager"
import { buildSearchEverythingViewModel, renderSearchEverythingScreen } from "../../../src/tui/render-search-everything"
import { tuiTheme } from "../../../src/tui/theme"
import { buildManagerBrowserModel, type NoteManagerSummary } from "../../../src/tui/adapters/note-manager-adapter"
import { createWorkspaceController } from "../../../src/tui/workspace-controller"
import type { SearchEverythingResult } from "../../../src/tui/adapters/search-everything-adapter"
import type { TuiState } from "../../../src/tui/state"

const baseState: TuiState = {
  screen: "manager",
  manager: {
    focusedIndex: 1,
    selectedNoteKey: "daily-plan",
    items: [
      {
        type: "folder",
        key: "notes/inbox",
        filename: "inbox/",
        title: "inbox",
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
    ],
  },
  editor: {
    note: {
      key: "daily-plan",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "notes/inbox/daily-plan.md",
      body: "# Daily Plan\n\nShip renderer screens.",
    },
    body: "# Daily Plan\n\nShip renderer screens.",
    savedBody: "# Daily Plan\n\nShip renderer screens.",
    dirty: false,
  },
  search: null,
}

function descendants(node: Renderable): Renderable[] {
  return [node, ...node.getChildren().flatMap((child) => descendants(child))]
}

describe("TUI render view models", () => {
  test("TUI theme exposes restrained blue palette tokens only", () => {
    assert.deepEqual(Object.keys(tuiTheme).sort(), [
      "activeItem",
      "background",
      "danger",
      "focusedRow",
      "mutedText",
      "panel",
      "primaryAccent",
      "secondaryAccent",
    ])
    assert.equal(tuiTheme.background, "#0f172a")
    assert.equal(tuiTheme.panel, "#111827")
    assert.equal(tuiTheme.focusedRow, "#1e3a8a")
    assert.equal(tuiTheme.activeItem, "#0e7490")
    assert.equal(tuiTheme.primaryAccent, "#38bdf8")
    assert.equal(tuiTheme.secondaryAccent, "#22d3ee")
    assert.equal(tuiTheme.mutedText, "#94a3b8")
    assert.equal(tuiTheme.danger, "#ef4444")
    assert.equal("success" in tuiTheme, false)
    assert.equal("warning" in tuiTheme, false)
    for (const color of Object.values(tuiTheme)) {
      assert.match(color, /^#[0-9a-f]{6}$/iu)
    }
  })

  test("manager view model includes rows with filename/key, title, description, focus marker, and minimal shortcut/status hints", () => {
    const vm = buildManagerViewModel(baseState)

    assert.equal(vm.title, "")
    assert.deepEqual(vm.topbar, {
      brand: "BlueNote",
      rebuildLabel: "Rebuild idle",
      indexingLabel: "Index ready",
      statusText: "2 items · selected daily-plan",
      currentPath: "notes/",
      hoveredPath: null,
      styleIntent: "primaryAccent",
    })
    assert.equal(vm.panels.layout1.title, "notes/")
    assert.equal(vm.panels.layout2.title, "daily-plan.md")
    assert.equal(vm.status, "2 items · selected daily-plan")
    assert.deepEqual(vm.shortcuts, ["↑↓ move", "→/Enter open", "n new", "d delete", "/ filter", "s search", "p preview hide", "Esc back", "q quit"])
    const creatingVm = buildManagerViewModel({
      ...baseState,
      mode: "manager.create",
      manager: { ...baseState.manager, createDraft: { title: "Project Plan", status: "Title required" } },
    })
    assert.deepEqual(creatingVm.createPrompt, {
      visible: true,
      title: "Project Plan",
      status: "Title required",
      inputId: "bluenote-manager-create-title",
      placeholder: "Note title…",
      focused: true,
      styleIntent: "secondaryAccent",
      statusIntent: "mutedText",
    })
    assert.equal(Number(creatingVm.createPrompt?.focused), 1)
    const deletingVm = buildManagerViewModel({
      ...baseState,
      mode: "manager.deleteConfirm",
      manager: {
        ...baseState.manager,
        deleteDraft: {
          key: "daily-plan",
          title: "Daily Plan",
          relativePath: "notes/inbox/daily-plan.md",
          status: null,
        },
      },
    })
    assert.deepEqual(deletingVm.deletePrompt, {
      visible: true,
      key: "daily-plan",
      title: "Daily Plan",
      relativePath: "notes/inbox/daily-plan.md",
      status: null,
      styleIntent: "danger",
    })
    const managerChrome = [vm.title, vm.status, ...vm.shortcuts, vm.panels.layout1.title, vm.panels.layout2.title].join(" ")
    assert.doesNotMatch(managerChrome, /BlueNote(?: TUI| Manager)?/i)
    assert.doesNotMatch(JSON.stringify(vm), /Layout 1: current folder|Layout 2: preview/u)
    assert.deepEqual(
      vm.rows.map((row) => ({ marker: row.focusMarker, key: row.key, filename: row.filename, title: row.title, description: row.description, focused: row.focused })),
      [
        { marker: " ", key: "notes/inbox", filename: "inbox/", title: "inbox", description: "2 notes", focused: false },
        { marker: "›", key: "daily-plan", filename: "daily-plan.md", title: "Daily Plan", description: "Today priorities.", focused: true },
      ],
    )
    assert.deepEqual(
      vm.rows.map((row) => ({ key: row.key, type: row.type, icon: row.icon, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent, openStyleIntent: row.openStyleIntent, metadataStyleIntent: row.metadataStyleIntent })),
      [
        { key: "notes/inbox", type: "folder", icon: "📁", styleIntent: "panel", itemStyleIntent: "mutedText", openStyleIntent: null, metadataStyleIntent: "mutedText" },
        { key: "daily-plan", type: "note", icon: "📄", styleIntent: "focusedRow", itemStyleIntent: "mutedText", openStyleIntent: "activeItem", metadataStyleIntent: "mutedText" },
      ],
    )
  })

  test("manager focused note and open editor note use separate style intents", () => {
    const vm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...baseState.manager,
        focusedIndex: 0,
        selectedNoteKey: "note-b",
        items: [
          {
            type: "note",
            key: "note-a",
            filename: "note-a.md",
            title: "Note A",
            description: "Focused note.",
            relativePath: "notes/note-a.md",
          },
          {
            type: "note",
            key: "note-b",
            filename: "note-b.md",
            title: "Note B",
            description: "Open note.",
            relativePath: "notes/note-b.md",
          },
        ],
      },
      editor: {
        ...baseState.editor!,
        note: {
          ...baseState.editor!.note,
          key: "note-b",
          title: "Note B",
          description: "Open note.",
          relativePath: "notes/note-b.md",
        },
      },
    })

    assert.deepEqual(
      vm.rows.map((row) => ({ key: row.key, styleIntent: row.styleIntent, openStyleIntent: row.openStyleIntent })),
      [
        { key: "note-a", styleIntent: "focusedRow", openStyleIntent: null },
        { key: "note-b", styleIntent: "panel", openStyleIntent: "activeItem" },
      ],
    )
  })

  test("manager selected note without an open editor does not receive open-note styling", () => {
    const vm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...baseState.manager,
        focusedIndex: 1,
        selectedNoteKey: "daily-plan",
      },
      editor: null,
    })

    assert.deepEqual(
      vm.rows.map((row) => ({ key: row.key, focused: row.focused, styleIntent: row.styleIntent, openStyleIntent: row.openStyleIntent })),
      [
        { key: "notes/inbox", focused: false, styleIntent: "panel", openStyleIntent: null },
        { key: "daily-plan", focused: true, styleIntent: "focusedRow", openStyleIntent: null },
      ],
    )
  })

  test("manager browser view model exposes two-column rows and folder preview without decorative type coloring", () => {
    const summaries: NoteManagerSummary[] = [
      { key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "notes/root-note.md", body: "# Root Note" },
      { key: "api-roadmap", title: "API Roadmap", description: "Ship API work.", relativePath: "notes/projects/api-roadmap.md" },
      { key: "client-brief", title: "Client Brief", description: "Client notes.", relativePath: "notes/projects/client/client-brief.md" },
    ]
    const browser = buildManagerBrowserModel(summaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "api-roadmap",
      currentFolderPath: "",
      hoveredPath: "notes/projects",
      filterQuery: "",
    })
    const vm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...browser.state,
        items: browser.layout1Rows,
      },
    } as TuiState, browser)

    assert.deepEqual(vm.topbar, {
      brand: "BlueNote",
      rebuildLabel: "Rebuild idle",
      indexingLabel: "Index ready",
      statusText: "2 items · selected daily-plan",
      currentPath: "notes/",
      hoveredPath: "notes/projects",
      styleIntent: "primaryAccent",
    })
    assert.deepEqual(vm.panels, {
      layout1: { title: "notes/", styleIntent: "panel" },
      layout2: { title: "projects", styleIntent: "panel" },
    })
    assert.match(vm.shortcuts.join(" "), /s search/u)
    assert.match(vm.shortcuts.join(" "), /p preview hide/u)
    assert.doesNotMatch(JSON.stringify(vm), /Layout 1: current folder|Layout 2: preview/u)
    assert.deepEqual(
      vm.layout1.rows.map((row) => ({ filename: row.filename, columns: row.columns, focused: row.focused, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent })),
      [
        { filename: "projects", columns: { filename: "projects", title: "", description: "" }, focused: true, styleIntent: "focusedRow", itemStyleIntent: "mutedText" },
        { filename: "root-note.md", columns: { filename: "root-note.md", title: "Root Note", description: "A top-level note." }, focused: false, styleIntent: "panel", itemStyleIntent: "mutedText" },
      ],
    )
    assert.equal(vm.layout2.preview.type, "folder")
    assert.deepEqual(
      vm.layout2.preview.rows.map((row) => ({ filename: row.filename, columns: row.columns, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent })),
      [
        { filename: "client", columns: { filename: "client", title: "", description: "" }, styleIntent: "panel", itemStyleIntent: "mutedText" },
        { filename: "api-roadmap.md", columns: { filename: "api-roadmap.md", title: "API Roadmap", description: "Ship API work." }, styleIntent: "panel", itemStyleIntent: "mutedText" },
      ],
    )
  })

  test("manager note preview exposes title, path, content lines, focus background, and separate open marker", () => {
    const browser = buildManagerBrowserModel([
      {
        key: "root-note",
        title: "Root Note",
        description: "A top-level note.",
        relativePath: "notes/root-note.md",
        body: "# Root Note\n\nPreview body.",
      },
    ], {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "root-note",
      currentFolderPath: "",
      hoveredPath: "notes/root-note.md",
      filterQuery: "",
    })

    const vm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...browser.state,
        items: browser.layout1Rows,
      },
      editor: {
        ...baseState.editor!,
        note: { ...baseState.editor!.note, key: "root-note", relativePath: "notes/root-note.md", title: "Root Note" },
      },
    } as TuiState, browser)

    assert.deepEqual(vm.layout2.preview, {
      type: "note-content",
      title: "Root Note",
      path: "notes/root-note.md",
      noteKey: "root-note",
      description: "A top-level note.",
      contentLines: ["# Root Note", "", "Preview body."],
      styleIntent: "panel",
    })
    assert.equal(vm.layout1.rows[0]?.styleIntent, "focusedRow")
    assert.equal(vm.layout1.rows[0]?.openMarker, "●")
    assert.notEqual(vm.layout1.rows[0]?.openMarker, vm.layout1.rows[0]?.focusMarker)
    assert.equal(vm.layout1.rows[0]?.openStyleIntent, "activeItem")
    assert.equal(vm.panels.layout2.title, "root-note.md")
  })

  test("manager view model hides preview responsively at narrow widths without building note content", () => {
    const browser = buildManagerBrowserModel([
      {
        key: "root-note",
        title: "Root Note",
        description: "A top-level note.",
        relativePath: "notes/root-note.md",
        body: "# Root Note\n\nPreview body.",
      },
    ], {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "root-note",
      currentFolderPath: "",
      hoveredPath: "notes/root-note.md",
      filterQuery: "",
      previewVisible: true,
    })

    const wideVm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...browser.state,
        items: browser.layout1Rows,
        previewVisible: true,
      },
    } as TuiState, browser, { width: 100 })
    const narrowVm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...browser.state,
        items: browser.layout1Rows,
        previewVisible: true,
      },
    } as TuiState, browser, { width: 60 })

    assert.equal(wideVm.layout2.preview.type, "note-content")
    assert.equal(narrowVm.layout2.preview.type, "hidden")
    assert.equal(narrowVm.layout2.preview.reason, "responsive")
    assert.equal(narrowVm.panels.layout2.title, "Preview hidden")
    assert.equal("contentLines" in narrowVm.layout2.preview, false)
    assert.equal(narrowVm.layout1.rows.length, 1)
    assert.equal(narrowVm.shortcuts.includes("p preview show"), true)
  })

  test("manager chrome titles current folder and hidden preview states without artificial layout labels", () => {
    const browser = buildManagerBrowserModel([
      { key: "api-roadmap", title: "API Roadmap", description: "Ship API work.", relativePath: "notes/projects/api-roadmap.md" },
    ], {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "api-roadmap",
      currentFolderPath: "notes/projects",
      hoveredPath: "notes/projects/api-roadmap.md",
      filterQuery: "",
      previewVisible: false,
    }, { previewVisible: false })

    const vm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...browser.state,
        items: browser.layout1Rows,
        previewVisible: false,
      },
    } as TuiState, browser)

    assert.equal(vm.title, "")
    assert.equal(vm.panels.layout1.title, "notes/projects")
    assert.equal(vm.panels.layout2.title, "Preview hidden")
    assert.equal(vm.layout2.preview.type, "hidden")
    assert.match(vm.shortcuts.join(" "), /s search/u)
    const stateOnlyHiddenVm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...baseState.manager,
        previewVisible: false,
      },
    })
    assert.equal(stateOnlyHiddenVm.panels.layout2.title, "Preview hidden")
    assert.equal(stateOnlyHiddenVm.shortcuts.includes("p preview show"), true)
  })

  test("runtime manager controller exposes the browser preview model used by renderer", () => {
    const summaries: NoteManagerSummary[] = [
      { key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "notes/root-note.md" },
      { key: "api-roadmap", title: "API Roadmap", description: "Ship API work.", relativePath: "notes/projects/api-roadmap.md" },
    ]
    const controller = createWorkspaceController({
      listNotes: () => summaries,
      showNote: (selector) => {
        const summary = summaries.find((candidate) => candidate.key === selector || candidate.relativePath === selector) ?? summaries[0]!
        return { ...summary, body: `# ${summary.title}\n\nHydrated preview body.` }
      },
      searchNotes: () => [],
    })

    controller.refreshManager()
    controller.moveManagerSelection("down")

    const vm = buildManagerViewModel(controller.getState(), controller.getManagerBrowserModel())

    assert.equal(vm.layout2.preview.type, "note-content")
    assert.equal(vm.layout2.preview.path, "notes/root-note.md")
    assert.deepEqual(vm.layout2.preview.contentLines, ["# Root Note", "", "Hydrated preview body."])
  })

  test("editor view model exposes structured topbar, editor body metadata, and bottombar data", () => {
    const vm = buildEditorViewModel({ ...baseState, screen: "editor" })

    assert.deepEqual(Object.keys(vm).sort(), ["body", "bottombar", "find", "topbar"])
    assert.deepEqual(vm.topbar, {
      noteName: "Daily Plan",
      directoryPath: "notes/inbox",
      filename: "daily-plan.md",
      relativePath: "notes/inbox/daily-plan.md",
      key: "daily-plan",
      dirty: false,
      saveStatusLabel: "Saved",
      statusIntent: "mutedText",
      updatedLabel: "Updated unknown",
      updatedIntent: "mutedText",
    })
    assert.deepEqual(vm.body, {
      inputId: "bluenote-editor-body-input",
      value: "# Daily Plan\n\nShip renderer screens.",
      lineCount: 3,
      characterCount: 36,
      placeholder: "Write your note…",
      focused: true,
      cursor: { line: 3, column: 23 },
      wrapMode: "word",
      overflow: { above: false, below: false, indicator: "" },
    })
    assert.equal(vm.find, null)
    assert.deepEqual(vm.bottombar.shortcuts, [
      { label: "Ctrl+S save", priority: 1 },
      { label: "Ctrl+F find", priority: 2 },
      { label: "Alt+Z wrap", priority: 3 },
      { label: "Ctrl+P search", priority: 4 },
      { label: "Esc manager", priority: 5 },
      { label: "Ctrl+C quit", priority: 6 },
    ])
    assert.deepEqual(vm.bottombar.hints, ["Ctrl+S save", "Ctrl+F find", "Alt+Z wrap", "Ctrl+P search", "Esc manager", "Ctrl+C quit"])
    assert.equal(vm.bottombar.cursorLabel, "Line 3, Col 23")
    assert.equal(vm.bottombar.saveStatusLabel, "Saved")
    assert.equal(vm.bottombar.updatedLabel, "Updated unknown")
    assert.equal(vm.bottombar.wrapLabel, "Wrap word")
    assert.equal(vm.bottombar.overflowIndicator, "")
    assert.deepEqual(vm.bottombar.visibleHints, ["Ctrl+S save", "Ctrl+F find", "Alt+Z wrap", "Ctrl+P search", "Esc manager", "Ctrl+C quit"])
    assert.equal(vm.bottombar.hiddenShortcutCount, 0)
    assert.equal(vm.bottombar.status, "Line 3, Col 23 · Wrap word · Saved · Updated unknown")
    assert.equal(vm.bottombar.statusIntent, "mutedText")

    const editorChrome = JSON.stringify({ topbar: vm.topbar, bottombar: vm.bottombar })
    assert.doesNotMatch(editorChrome, /BlueNote(?: TUI| Editor)?/i)
    assert.equal("title" in vm.topbar, false)

    const dirtyVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, dirty: true, body: `${baseState.editor!.body}\nunsaved` } })
    assert.equal(dirtyVm.topbar.saveStatusLabel, "Unsaved")
    assert.equal(dirtyVm.bottombar.saveStatusLabel, "Unsaved")
    assert.equal(dirtyVm.topbar.statusIntent, "primaryAccent")
    assert.equal(dirtyVm.bottombar.statusIntent, "primaryAccent")

    const autosaveVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, autosaveStatus: "saving" } as TuiState["editor"] })
    assert.equal(autosaveVm.topbar.saveStatusLabel, "Autosaving…")
    assert.equal(autosaveVm.bottombar.saveStatusLabel, "Autosaving…")
    assert.equal(autosaveVm.topbar.statusIntent, "secondaryAccent")
    assert.equal(autosaveVm.bottombar.statusIntent, "secondaryAccent")
  })

  test("editor responsive view model hides low-priority shortcuts first and reports body overflow", () => {
    const longBody = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n")
    const narrowVm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: longBody, savedBody: longBody, cursorOffset: 0, selectionStart: 0, selectionEnd: 0 },
    }, { width: 34, bodyViewportLines: 8 })

    assert.deepEqual(narrowVm.bottombar.visibleHints, ["Ctrl+S save", "Ctrl+F find"])
    assert.equal(narrowVm.bottombar.hiddenShortcutCount, 4)
    assert.deepEqual(narrowVm.body.overflow, { above: false, below: true, indicator: "↓" })
    assert.equal(narrowVm.bottombar.overflowIndicator, "More ↓")
    assert.match(narrowVm.bottombar.status, /More ↓/u)

    const bodyLength = Array.from(longBody).length
    const bottomCursorVm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: {
        ...baseState.editor!,
        body: longBody,
        savedBody: longBody,
        cursorOffset: bodyLength,
        selectionStart: bodyLength,
        selectionEnd: bodyLength,
      },
    }, { width: 80, bodyViewportLines: 8 })

    assert.deepEqual(bottomCursorVm.body.overflow, { above: true, below: false, indicator: "↑" })
    assert.equal(bottomCursorVm.bottombar.overflowIndicator, "More ↑")
  })

  test("editor chrome extracts note directory and latest updated or modified labels from metadata", () => {
    const vm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: {
        ...baseState.editor!,
        note: {
          ...baseState.editor!.note,
          relativePath: "notes/projects/client/client-brief.md",
          updatedAt: "2026-05-28T10:30:00.000Z",
          modifiedAt: "2026-05-28T11:45:00.000Z",
        },
      } as TuiState["editor"],
    })

    assert.equal(vm.topbar.directoryPath, "notes/projects/client")
    assert.equal(vm.topbar.filename, "client-brief.md")
    assert.equal(vm.topbar.updatedLabel, "Modified 2026-05-28T11:45:00.000Z")
    assert.equal(vm.bottombar.updatedLabel, "Modified 2026-05-28T11:45:00.000Z")
  })

  test("editor bottom bar displays autosave status labels", () => {
    const statusFor = (autosaveStatus: NonNullable<TuiState["editor"]>["autosaveStatus"], dirty = true) =>
      buildEditorViewModel({
        ...baseState,
        screen: "editor",
        editor: {
          ...baseState.editor!,
          dirty,
          autosaveStatus,
        },
      }).bottombar

    assert.deepEqual(
      [statusFor("pending"), statusFor("saving"), statusFor("saved", false), statusFor("error")].map((bar) => ({ status: bar.status, intent: bar.statusIntent })),
      [
        { status: "Line 3, Col 23 · Wrap word · Unsaved · Updated unknown", intent: "primaryAccent" },
        { status: "Line 3, Col 23 · Wrap word · Autosaving… · Updated unknown", intent: "secondaryAccent" },
        { status: "Line 3, Col 23 · Wrap word · Saved · Updated unknown", intent: "mutedText" },
        { status: "Line 3, Col 23 · Wrap word · Autosave failed · Updated unknown", intent: "danger" },
      ],
    )
  })

  test("editor find mode exposes one focused find input and match count while body is unfocused", () => {
    const vm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      mode: "editor.find",
      editor: {
        ...baseState.editor!,
        findQuery: "Ship",
        findMatchCount: 1,
        activeFindIndex: 0,
      },
    })

    assert.deepEqual(vm.find, {
      visible: true,
      query: "Ship",
      matchCount: 1,
      activeIndex: 0,
      countLabel: "1/1",
      placeholder: "Find in note…",
      focused: true,
      styleIntent: "secondaryAccent",
    })
    assert.equal(vm.body.focused, false)
    assert.equal(Number(vm.find.focused) + Number(vm.body.focused), 1)

    const bodyVm = buildEditorViewModel({ ...baseState, screen: "editor", mode: "editor.body" })
    assert.equal(bodyVm.find, null)
    assert.equal(bodyVm.body.focused, true)
  })

  test("Search Everything view model includes query, result list, selected preview/excerpt/command usage, and previous-screen context", () => {
    const results: SearchEverythingResult[] = [
      {
        kind: "content",
        id: "content:daily-plan:body",
        key: "daily-plan",
        title: "Daily Plan",
        relativePath: "notes/inbox/daily-plan.md",
        matchLabel: "body",
        excerpt: "Ship renderer screens with OpenTUI.",
        label: "Daily Plan",
        detail: "body — notes/inbox/daily-plan.md",
        score: 100,
      },
      {
        kind: "command",
        id: "command:/replace",
        label: "/replace",
        detail: "Find and replace text in the active editor buffer",
        score: 90,
        name: "/replace",
        description: "Find and replace text in the active editor buffer",
        usage: "/replace <query> <replacement>",
        shortcut: "Ctrl+H",
      },
    ]
    const vm = buildSearchEverythingViewModel(
      {
        ...baseState,
        screen: "search",
        search: { query: "/rep", selectedIndex: 1, previousScreen: "editor" },
      },
      results,
    )

    assert.equal(vm.query, "/rep")
    assert.equal(vm.previousScreen, "editor")
    assert.deepEqual(vm.styleIntents, {
      panel: "panel",
      input: "primaryAccent",
      result: "panel",
      selectedResult: "activeItem",
      preview: "panel",
    })
    assert.deepEqual(vm.shortcuts, ["type search", "↑/↓ select", "Enter open/run", "Esc editor"])
    assert.deepEqual(
      vm.results.map((row) => ({ marker: row.focusMarker, kind: row.kind, label: row.label, detail: row.detail, selected: row.selected })),
      [
        { marker: " ", kind: "content", label: "Daily Plan", detail: "body — notes/inbox/daily-plan.md", selected: false },
        { marker: "›", kind: "command", label: "/replace", detail: "Find and replace text in the active editor buffer", selected: true },
      ],
    )
    assert.deepEqual(vm.results.map((row) => row.styleIntent), ["panel", "activeItem"])
    assert.deepEqual(vm.preview, {
      title: "/replace",
      subtitle: "Find and replace text in the active editor buffer",
      lines: ["Usage: /replace <query> <replacement>", "Shortcut: Ctrl+H"],
      styleIntent: "panel",
    })

    const contentVm = buildSearchEverythingViewModel(
      {
        ...baseState,
        screen: "search",
        search: { query: "ship", selectedIndex: 0, previousScreen: "manager" },
      },
      results,
    )
    assert.deepEqual(contentVm.preview?.lines, ["Ship renderer screens with OpenTUI."])
  })

  test("Search Everything view model describes one input, result list, and preview regions in order", () => {
    const vm = buildSearchEverythingViewModel(
      {
        ...baseState,
        screen: "search",
        mode: "search.input",
        search: { query: "ship", selectedIndex: 0, previousScreen: "manager", previousMode: "manager.browse" },
      },
      [
        {
          kind: "note",
          id: "note:daily-plan",
          key: "daily-plan",
          title: "Daily Plan",
          relativePath: "notes/inbox/daily-plan.md",
          filename: "daily-plan.md",
          description: "Today priorities.",
          matchedFields: ["title"],
          label: "Daily Plan",
          detail: "notes/inbox/daily-plan.md",
          score: 10,
        },
      ],
    )

    assert.deepEqual(vm.input, {
      id: "bluenote-search-query",
      value: "ship",
      placeholder: "Search notes, content, folders, or /commands",
      focused: true,
      styleIntent: "primaryAccent",
    })
    assert.deepEqual(vm.regions.map((region) => region.id), ["input", "result-list", "preview"])
    assert.equal(vm.regions.findIndex((region) => region.id === "preview") > vm.regions.findIndex((region) => region.id === "result-list"), true)
    assert.equal(vm.regions.filter((region) => region.kind === "input").length, 1)
  })

  test("manager create renderer builds one stable focused title input", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [],
        showNote: () => ({ ...baseState.editor!.note }),
        searchNotes: () => [],
      })
      controller.openManagerCreate()
      controller.updateManagerCreateTitle("Project Plan")
      const screen = renderManagerScreen({ renderer, controller })
      renderer.root.add(screen)
      const inputs = screen.getChildren().flatMap((child) => [child, ...child.getChildren()]).filter((node) => node instanceof InputRenderable)

      assert.equal(inputs.length, 1)
      assert.equal(inputs[0]?.id, "bluenote-manager-create-title")
      assert.equal(inputs[0]?.focused, true)
      assert.equal((inputs[0] as InputRenderable | undefined)?.value, "Project Plan")
    } finally {
      renderer.destroy()
    }
  })

  test("manager renderer uses responsive panes, compact hidden preview hint, and minimal root chrome", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "notes/root-note.md", body: "# Root Note\n\nPreview body." }],
        showNote: () => ({ key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "notes/root-note.md", body: "# Root Note\n\nPreview body." }),
        searchNotes: () => [],
      })
      controller.refreshManager()

      const wideScreen = renderManagerScreen({ renderer, controller, width: 100 })
      renderer.root.add(wideScreen)
      const wideIds = descendants(wideScreen).map((node) => node.id)
      const wideLayout2 = descendants(wideScreen).find((node) => node.id === "bluenote-manager-layout-2") as { getChildren: () => Renderable[] } | undefined
      const widePreviewText = wideLayout2?.getChildren().map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "") ?? []

      assert.equal(wideIds.includes("bluenote-manager-layout-1"), true)
      assert.equal(wideIds.includes("bluenote-manager-layout-2"), true)
      assert.equal((wideScreen as any).border, false)
      assert.equal((wideScreen as any).title ?? "", "")
      assert.deepEqual(widePreviewText.slice(0, 4), ["Root Note", "notes/root-note.md", "# Root Note", ""])

      renderer.root.remove(wideScreen.id)
      wideScreen.destroyRecursively()

      const narrowScreen = renderManagerScreen({ renderer, controller, width: 60 })
      renderer.root.add(narrowScreen)
      const narrowIds = descendants(narrowScreen).map((node) => node.id)
      const narrowText = descendants(narrowScreen).map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")
      const narrowLayout1 = descendants(narrowScreen).find((node) => node.id === "bluenote-manager-layout-1") as { width?: unknown } | undefined

      assert.equal(narrowIds.includes("bluenote-manager-layout-1"), true)
      assert.equal(narrowIds.includes("bluenote-manager-layout-2"), false)
      assert.equal((narrowLayout1 as any)?._width, "100%")
      assert.match(narrowText, /root-note\.md/u)
      assert.match(narrowText, /Preview hidden.*p preview show/u)
      assert.doesNotMatch(narrowText, /Preview body/u)
    } finally {
      renderer.destroy()
    }
  })

  test("Search Everything renderer builds one stable focused input and no duplicate input regions", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [
          {
            key: "daily-plan",
            title: "Daily Plan",
            description: "Today priorities.",
            relativePath: "notes/inbox/daily-plan.md",
            body: "Ship renderer screens.",
          },
        ],
        showNote: () => ({ ...baseState.editor!.note }),
        searchNotes: () => [],
      })
      controller.openSearch("ship")

      const root = renderSearchEverythingScreen({ renderer, controller })
      const descendants = (node: Renderable): Renderable[] => [
        node,
        ...node.getChildren().flatMap((child) => descendants(child)),
      ]
      const descendantIds = descendants(root).map((node) => node.id)
      const searchInput = descendants(root).find((node) => node.id === "bluenote-search-query")

      assert.equal(descendantIds.filter((id) => id === "bluenote-search-query").length, 1)
      assert.equal(descendantIds.filter((id) => id === "bluenote-search-input-region").length, 1)
      assert.equal(descendantIds.filter((id) => id === "bluenote-search-results-region").length, 1)
      assert.equal(descendantIds.filter((id) => id === "bluenote-search-preview-region").length, 1)
      assert.equal(searchInput instanceof InputRenderable, true)
      assert.equal(searchInput?.focused, true)
    } finally {
      renderer.destroy()
    }
  })
})
