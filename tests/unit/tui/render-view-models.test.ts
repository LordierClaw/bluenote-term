import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { createCliRenderer, InputRenderable, type Renderable } from "@opentui/core"

import { buildEditorViewModel, renderEditorScreen } from "../../../src/tui/render-editor"
import { buildManagerViewModel, renderManagerScreen } from "../../../src/tui/render-manager"
import { renderShortcutHints } from "../../../src/tui/render-chrome"
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

function colorInts(color: string): number[] {
  const normalized = color.replace(/^#/u, "")
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)).concat(255)
}

describe("TUI render view models", () => {
  test("TUI theme exposes semantic design tokens for surfaces, borders, text, and statuses", () => {
    assert.deepEqual(Object.keys(tuiTheme).sort(), [
      "activeItem",
      "background",
      "borderFocus",
      "borderSubtle",
      "danger",
      "focusedRow",
      "info",
      "mutedText",
      "panel",
      "primaryAccent",
      "secondaryAccent",
      "statusDanger",
      "statusInfo",
      "statusSuccess",
      "statusWarning",
      "success",
      "surfacePanel",
      "surfacePanelRaised",
      "textMuted",
      "textPrimary",
      "textSecondary",
      "warning",
    ])
    assert.equal(tuiTheme.background, "#0f172a")
    assert.equal(tuiTheme.surfacePanel, "#111827")
    assert.equal(tuiTheme.surfacePanelRaised, "#162033")
    assert.equal(tuiTheme.panel, tuiTheme.surfacePanel)
    assert.equal(tuiTheme.focusedRow, "#1e3a8a")
    assert.equal(tuiTheme.activeItem, "#0e7490")
    assert.equal(tuiTheme.borderSubtle, "#334155")
    assert.equal(tuiTheme.borderFocus, "#38bdf8")
    assert.equal(tuiTheme.primaryAccent, "#38bdf8")
    assert.equal(tuiTheme.secondaryAccent, "#22d3ee")
    assert.notEqual(tuiTheme.borderSubtle, tuiTheme.primaryAccent)
    assert.equal(tuiTheme.textPrimary, "#f8fafc")
    assert.equal(tuiTheme.textSecondary, "#cbd5e1")
    assert.equal(tuiTheme.textMuted, "#94a3b8")
    assert.equal(tuiTheme.mutedText, tuiTheme.textMuted)
    assert.equal(tuiTheme.statusSuccess, "#22c55e")
    assert.equal(tuiTheme.statusWarning, "#f59e0b")
    assert.equal(tuiTheme.statusDanger, "#ef4444")
    assert.equal(tuiTheme.statusInfo, "#60a5fa")
    assert.equal(tuiTheme.success, tuiTheme.statusSuccess)
    assert.equal(tuiTheme.warning, tuiTheme.statusWarning)
    assert.equal(tuiTheme.danger, tuiTheme.statusDanger)
    assert.equal(tuiTheme.info, tuiTheme.statusInfo)
    for (const color of Object.values(tuiTheme)) {
      assert.match(color, /^#[0-9a-f]{6}$/iu)
    }
  })

  test("manager view model includes rows with filename/key, title, description, hover highlight, and minimal shortcut/status hints", () => {
    const vm = buildManagerViewModel(baseState)

    assert.equal(vm.title, "")
    assert.deepEqual(vm.dashboard, {
      productLabel: "BlueNote",
      workspaceLabel: "Workspace · notes/",
      summaryLabel: "2 items · Ready",
      orientation: "Browse your local Markdown workspace.",
      primaryActions: ["[Enter] Open", "[n] New", "[s] Search"],
    })
    assert.deepEqual(vm.topbar, {
      leftTitle: "BlueNote",
      itemCountLabel: "2 items",
      appStatusLabel: "Ready",
      rightLabel: "2 items | Ready",
      bottomPath: "notes/inbox/daily-plan.md",
      styleIntent: "textPrimary",
    })
    assert.equal(vm.panels.layout1.title, "notes/")
    assert.equal(vm.panels.layout2.title, "Preview")
    assert.equal(vm.status, "Ready")
    assert.deepEqual(vm.shortcutHints, [
      { key: "Enter", action: "Open", priority: "primary" },
      { key: "n", action: "New", priority: "primary" },
      { key: "s", action: "Search", priority: "secondary" },
    ])
    assert.deepEqual(vm.shortcuts, ["[Enter] Open", "[n] New", "[s] Search"])
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
    const managerChrome = [vm.title, vm.status, ...vm.shortcutHints.map((hint) => hint.action), vm.panels.layout1.title, vm.panels.layout2.title].join(" ")
    assert.doesNotMatch(managerChrome, /BlueNote(?: TUI| Manager)?/i)
    assert.doesNotMatch(JSON.stringify(vm), /Layout 1: current folder|Layout 2: preview/u)
    assert.deepEqual(
      vm.rows.map((row) => ({ marker: row.focusMarker, openMarker: row.openMarker, key: row.key, filename: row.filename, title: row.title, description: row.description, focused: row.focused })),
      [
        { marker: "", openMarker: "", key: "notes/inbox", filename: "inbox/", title: "inbox", description: "2 notes", focused: false },
        { marker: "", openMarker: "", key: "daily-plan", filename: "daily-plan.md", title: "Daily Plan", description: "Today priorities.", focused: true },
      ],
    )
    assert.deepEqual(
      vm.rows.map((row) => row.displaySegments),
      [
        { primary: "inbox", secondary: "2 notes", metadata: "folder · notes/inbox" },
        { primary: "Daily Plan", secondary: "Today priorities.", metadata: "daily-plan.md · notes/inbox/daily-plan.md" },
      ],
    )
    assert.deepEqual(
      vm.rows.map((row) => ({ key: row.key, type: row.type, icon: row.icon, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent, openStyleIntent: row.openStyleIntent, metadataStyleIntent: row.metadataStyleIntent })),
      [
        { key: "notes/inbox", type: "folder", icon: "📁", styleIntent: "panel", itemStyleIntent: "textPrimary", openStyleIntent: null, metadataStyleIntent: "mutedText" },
        { key: "daily-plan", type: "note", icon: "📄", styleIntent: "focusedRow", itemStyleIntent: "textPrimary", openStyleIntent: null, metadataStyleIntent: "mutedText" },
      ],
    )
  })

  test("manager dashboard view model has quiet empty, hidden preview, and active panel styling", () => {
    const emptyVm = buildManagerViewModel({
      ...baseState,
      editor: null,
      manager: { items: [], focusedIndex: 0, selectedNoteKey: null, currentFolderPath: "" },
    }, { layout1Rows: [], preview: { type: "empty", path: null }, currentFolderPath: "", hoveredPath: null, focusedIndex: 0, empty: true, state: { items: [], focusedIndex: 0, selectedNoteKey: null } })

    assert.deepEqual(emptyVm.layout1.emptyState, {
      title: "No notes here yet",
      body: "Create a note in notes/ or search your workspace.",
      actions: ["[n] New", "[s] Search"],
      styleIntent: "mutedText",
    })
    assert.deepEqual(emptyVm.panels, {
      layout1: { title: "notes/", styleIntent: "borderFocus" },
      layout2: { title: "Preview", styleIntent: "borderSubtle" },
    })
    assert.deepEqual(emptyVm.layout2.preview, {
      type: "empty",
      path: null,
      title: "Nothing selected",
      message: "Move through notes to show a preview here.",
      sections: [],
      styleIntent: "panel",
    })

    const hiddenVm = buildManagerViewModel(baseState, undefined, { width: 60 })
    assert.deepEqual(hiddenVm.layout2.preview, {
      type: "hidden",
      path: null,
      reason: "responsive",
      title: "Preview hidden",
      message: "Preview hidden for narrow terminal · p show",
      sections: [],
      styleIntent: "mutedText",
    })
  })

  test("manager shortcut chrome prioritizes key/action pairs and demotes secondary hints on narrow widths", () => {
    const wideVm = buildManagerViewModel(baseState, undefined, { width: 100 })
    const narrowVm = buildManagerViewModel(baseState, undefined, { width: 60 })
    const filteringVm = buildManagerViewModel({ ...baseState, mode: "manager.filter" }, undefined, { width: 100 })

    assert.deepEqual(wideVm.shortcutHints, [
      { key: "Enter", action: "Open", priority: "primary" },
      { key: "n", action: "New", priority: "primary" },
      { key: "s", action: "Search", priority: "secondary" },
    ])
    assert.deepEqual(wideVm.shortcuts, ["[Enter] Open", "[n] New", "[s] Search"])
    assert.ok(wideVm.shortcuts.every((hint) => /^\[[^\]]+\] [A-Z?]/u.test(hint)), wideVm.shortcuts.join(" | "))
    assert.deepEqual(narrowVm.shortcuts, ["[Enter] Open", "[n] New"])
    assert.doesNotMatch([...wideVm.shortcuts, ...narrowVm.shortcuts].join(" "), /\[\?\] More/u)
    assert.doesNotMatch(narrowVm.shortcuts.join(" "), /Delete|Filter|Quit|Preview/u)
    assert.deepEqual(filteringVm.shortcutHints, [
      { key: "Enter", action: "Open", priority: "primary" },
      { key: "Esc", action: "Close", priority: "primary" },
    ])
    assert.deepEqual(filteringVm.shortcuts, ["[Enter] Open", "[Esc] Close"])
  })

  test("manager topbar uses filtered count, app status, and bottom path without path or selection clutter", () => {
    const vm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...baseState.manager,
        items: [baseState.manager.items[1]!],
        filterQuery: "daily",
        status: "Indexing...",
        currentFolderPath: "notes/inbox",
        hoveredPath: "notes/inbox/daily-plan.md",
        selectedNoteKey: "daily-plan",
      },
    })

    assert.equal(vm.topbar.leftTitle, "BlueNote")
    assert.equal(vm.topbar.itemCountLabel, "1 items (filtered)")
    assert.equal(vm.topbar.appStatusLabel, "Indexing...")
    assert.equal(vm.topbar.rightLabel, "1 items (filtered) | Indexing...")
    assert.equal(vm.topbar.bottomPath, "notes/inbox/daily-plan.md")
    assert.doesNotMatch(vm.topbar.rightLabel, /notes\/|daily-plan|Rebuild idle|Index ready/u)

    const noOpenNoteVm = buildManagerViewModel({
      ...baseState,
      editor: null,
      manager: { ...baseState.manager, status: "Latest Updated: unknown" },
    })
    assert.equal(noOpenNoteVm.topbar.bottomPath, "")
    assert.equal(noOpenNoteVm.status, "Latest Updated: unknown")
  })

  test("manager row highlight follows only focused hover state, not open editor note", () => {
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
        { key: "note-b", styleIntent: "panel", openStyleIntent: null },
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
      leftTitle: "BlueNote",
      itemCountLabel: "2 items",
      appStatusLabel: "Ready",
      rightLabel: "2 items | Ready",
      bottomPath: "notes/inbox/daily-plan.md",
      styleIntent: "textPrimary",
    })
    assert.deepEqual(vm.panels, {
      layout1: { title: "notes/", styleIntent: "borderFocus" },
      layout2: { title: "projects", styleIntent: "borderSubtle" },
    })
    assert.match(vm.shortcuts.join(" "), /\[s\] Search/u)
    assert.doesNotMatch(vm.shortcuts.join(" "), /\[\?\] More/u)
    assert.doesNotMatch(JSON.stringify(vm), /Layout 1: current folder|Layout 2: preview/u)
    assert.deepEqual(
      vm.layout1.rows.map((row) => ({ filename: row.filename, displaySegments: row.displaySegments, focused: row.focused, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent })),
      [
        { filename: "projects", displaySegments: { primary: "projects", secondary: "", metadata: "folder · notes/projects" }, focused: true, styleIntent: "focusedRow", itemStyleIntent: "textPrimary" },
        { filename: "root-note.md", displaySegments: { primary: "Root Note", secondary: "A top-level note.", metadata: "root-note.md · notes/root-note.md" }, focused: false, styleIntent: "panel", itemStyleIntent: "textPrimary" },
      ],
    )
    assert.equal(vm.layout2.preview.type, "folder")
    assert.deepEqual(
      vm.layout2.preview.rows.map((row) => ({ filename: row.filename, displaySegments: row.displaySegments, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent })),
      [
        { filename: "client", displaySegments: { primary: "client", secondary: "", metadata: "folder · notes/projects/client" }, styleIntent: "panel", itemStyleIntent: "textPrimary" },
        { filename: "api-roadmap.md", displaySegments: { primary: "API Roadmap", secondary: "Ship API work.", metadata: "api-roadmap.md · notes/projects/api-roadmap.md" }, styleIntent: "panel", itemStyleIntent: "textPrimary" },
      ],
    )
  })

  test("manager note preview exposes title, path, content lines, and focus background without open marker styling", () => {
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
      sections: [
        { label: "Title", lines: ["Root Note"] },
        { label: "Path", lines: ["notes/root-note.md"] },
        { label: "Description", lines: ["A top-level note."] },
        { label: "Body", lines: ["# Root Note", "", "Preview body."] },
      ],
      styleIntent: "panel",
    })
    assert.equal(vm.layout1.rows[0]?.styleIntent, "focusedRow")
    assert.equal(vm.layout1.rows[0]?.focusMarker, "")
    assert.equal(vm.layout1.rows[0]?.openMarker, "")
    assert.equal(vm.layout1.rows[0]?.openStyleIntent, null)
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
    assert.equal(narrowVm.shortcuts.includes("[?] More"), false)
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
    assert.match(vm.shortcuts.join(" "), /\[s\] Search/u)
    const stateOnlyHiddenVm = buildManagerViewModel({
      ...baseState,
      manager: {
        ...baseState.manager,
        previewVisible: false,
      },
    })
    assert.equal(stateOnlyHiddenVm.panels.layout2.title, "Preview hidden")
    assert.equal(stateOnlyHiddenVm.shortcuts.includes("[?] More"), false)
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
      fullPath: "notes/inbox/daily-plan.md",
      pathSeparator: "|",
      updatedSeparator: "|",
      fullPathIntent: "mutedText",
      relativePath: "notes/inbox/daily-plan.md",
      key: "daily-plan",
      dirty: false,
      saveStatusLabel: "Saved",
      statusIntent: "success",
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
    assert.deepEqual(vm.bottombar.row1, {
      leftLabel: "Line 3, Col 23",
      centerPrefixLabel: "Wrap word: ",
      centerStatusLabel: "Enabled",
      centerStatusIntent: "success",
      rightLabel: "Saved",
      rightIntent: "success",
      errorLabel: null,
    })
    assert.deepEqual(vm.bottombar.row2, {
      shortcuts: ["[Ctrl+S] Save", "[Ctrl+F] Find", "[Alt+Z] Wrap", "[Ctrl+P] Search", "[Esc] Manager"],
      visibleShortcuts: ["[Ctrl+S] Save", "[Ctrl+F] Find", "[Alt+Z] Wrap", "[Ctrl+P] Search", "[Esc] Manager"],
      visibleShortcutHints: [
        { key: "Ctrl+S", action: "Save" },
        { key: "Ctrl+F", action: "Find" },
        { key: "Alt+Z", action: "Wrap" },
        { key: "Ctrl+P", action: "Search" },
        { key: "Esc", action: "Manager" },
      ],
      hiddenShortcutCount: 0,
    })

    const editorChrome = JSON.stringify({ topbar: vm.topbar, bottombar: vm.bottombar })
    assert.doesNotMatch(editorChrome, /BlueNote(?: TUI| Editor)?/i)
    assert.equal("title" in vm.topbar, false)
    assert.doesNotMatch(JSON.stringify({ topbar: vm.topbar, body: vm.body }), /Editor body|Line \d+, Col \d+/u)
    assert.equal(vm.bottombar.row1.leftLabel, "Line 3, Col 23")

    const dirtyVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, dirty: true, body: `${baseState.editor!.body}\nunsaved` } })
    assert.equal(dirtyVm.topbar.saveStatusLabel, "Unsaved")
    assert.equal(dirtyVm.bottombar.row1.rightLabel, "Unsaved")
    assert.equal(dirtyVm.topbar.statusIntent, "warning")
    assert.equal(dirtyVm.bottombar.row1.rightIntent, "warning")

    const autosaveVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, autosaveStatus: "saving" } as TuiState["editor"] })
    assert.equal(autosaveVm.topbar.saveStatusLabel, "Saving")
    assert.equal(autosaveVm.bottombar.row1.rightLabel, "Saving")
    assert.equal(autosaveVm.topbar.statusIntent, "warning")
    assert.equal(autosaveVm.bottombar.row1.rightIntent, "warning")
  })

  test("editor topbar shows note updated timestamp when metadata exists", () => {
    const vm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      mode: "editor.body",
      editor: {
        ...baseState.editor!,
        note: {
          ...baseState.editor!.note,
          updatedAt: "2026-05-28T10:30:00.000Z",
        },
      },
    })

    assert.equal(vm.topbar.updatedLabel, "Updated 2026-05-28T10:30:00.000Z")
    assert.equal(vm.topbar.updatedIntent, "mutedText")
    assert.notEqual(vm.topbar.updatedLabel, "Updated unknown")
  })

  test("editor responsive view model hides low-priority shortcuts first and reports body overflow", () => {
    const longBody = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n")
    const narrowVm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: longBody, savedBody: longBody, cursorOffset: 0, selectionStart: 0, selectionEnd: 0 },
    }, { width: 34, bodyViewportLines: 8 })

    assert.deepEqual(narrowVm.bottombar.row2.visibleShortcuts, ["[Ctrl+S] Save", "[Ctrl+F] Find"])
    assert.deepEqual(narrowVm.bottombar.row2.visibleShortcutHints, [
      { key: "Ctrl+S", action: "Save" },
      { key: "Ctrl+F", action: "Find" },
    ])
    assert.equal(narrowVm.bottombar.row2.hiddenShortcutCount, 3)
    assert.doesNotMatch(narrowVm.bottombar.row2.shortcuts.join(" "), /\[\?\] More/u)
    assert.deepEqual(narrowVm.body.overflow, { above: false, below: true, indicator: "↓" })

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
      [statusFor("pending"), statusFor("saving"), statusFor("saved", false), statusFor("error")].map((bar) => ({
        saveStatusLabel: bar.row1.rightLabel,
        saveStatusIntent: bar.row1.rightIntent,
        errorLabel: bar.row1.errorLabel,
      })),
      [
        { saveStatusLabel: "Unsaved", saveStatusIntent: "warning", errorLabel: null },
        { saveStatusLabel: "Saving", saveStatusIntent: "warning", errorLabel: null },
        { saveStatusLabel: "Saved", saveStatusIntent: "success", errorLabel: null },
        { saveStatusLabel: "Unsaved", saveStatusIntent: "danger", errorLabel: "Autosave failed" },
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
      shortcutHints: [
        { text: "1/1" },
        { key: "Enter", action: "Next" },
        { key: "Shift+Enter", action: "Previous" },
        { key: "Esc", action: "Close" },
      ],
    })
    assert.equal(vm.body.focused, false)
    assert.equal(Number(vm.find.focused) + Number(vm.body.focused), 1)

    const bodyVm = buildEditorViewModel({ ...baseState, screen: "editor", mode: "editor.body" })
    assert.equal(bodyVm.find, null)
    assert.equal(bodyVm.body.focused, true)
  })

  test("Search Everything view model includes readable result fields, preview sections, and previous-screen context", () => {
    const results: SearchEverythingResult[] = [
      {
        kind: "content",
        typeLabel: "content",
        typeIcon: "content",
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
        typeLabel: "command",
        typeIcon: "command",
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
    assert.deepEqual(vm.shortcutHints, [
      { key: "Enter", action: "Open/run", priority: "primary" },
      { key: "↑/↓", action: "Select", priority: "primary" },
      { key: "Esc", action: "Editor", priority: "primary" },
    ])
    assert.deepEqual(vm.shortcuts, ["[Enter] Open/run", "[↑/↓] Select", "[Esc] Editor"])
    assert.doesNotMatch(vm.shortcuts.join(" "), /\[\?\] More/u)
    assert.deepEqual(
      vm.results.map((row) => ({
        marker: row.focusMarker,
        typeLabel: row.typeLabel,
        typeIcon: row.typeIcon,
        primaryLabel: row.primaryLabel,
        detail: row.detail,
        selected: row.selected,
        selectedMarker: row.selectedMarker,
      })),
      [
        { marker: " ", typeLabel: "content", typeIcon: "content", primaryLabel: "Daily Plan", detail: "body — notes/inbox/daily-plan.md", selected: false, selectedMarker: " " },
        { marker: "›", typeLabel: "command", typeIcon: "command", primaryLabel: "/replace", detail: "Find and replace text in the active editor buffer", selected: true, selectedMarker: "›" },
      ],
    )
    assert.deepEqual(vm.results.map((row) => row.styleIntent), ["panel", "focusedRow"])
    assert.deepEqual(vm.results.map((row) => row.primaryStyleIntent), ["textPrimary", "activeItem"])
    assert.deepEqual(vm.results.map((row) => row.detailStyleIntent), ["mutedText", "activeItem"])
    assert.deepEqual(vm.results.map((row) => row.typeStyleIntent), ["mutedText", "activeItem"])
    assert.deepEqual(vm.preview, {
      visible: true,
      hiddenReason: null,
      hiddenStatus: null,
      title: "/replace",
      subtitle: "Find and replace text in the active editor buffer",
      lines: ["Usage: /replace <query> <replacement>", "Shortcut: Ctrl+H"],
      sections: [
        { label: "Usage", lines: ["/replace <query> <replacement>"] },
        { label: "Shortcut", lines: ["Ctrl+H"] },
      ],
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
    const contentPreview = contentVm.preview
    assert.equal(contentPreview?.visible, true)
    if (contentPreview?.visible) {
      assert.deepEqual(contentPreview.lines, ["Ship renderer screens with OpenTUI."])
      assert.deepEqual(contentPreview.sections.map((section) => section.label), ["Match", "Excerpt"])
    }
  })

  test("Search Everything shortcut chrome omits impossible Enter action when no results exist", () => {
    const typingVm = buildSearchEverythingViewModel(
      {
        ...baseState,
        screen: "search",
        search: { query: "daily", selectedIndex: 0, previousScreen: "manager" },
      },
      [],
    )
    const emptyVm = buildSearchEverythingViewModel(
      {
        ...baseState,
        screen: "search",
        search: { query: "", selectedIndex: 0, previousScreen: "manager" },
      },
      [],
    )

    for (const vm of [typingVm, emptyVm]) {
      assert.deepEqual(vm.shortcutHints, [{ key: "Esc", action: "Manager", priority: "primary" }])
      assert.deepEqual(vm.shortcuts, ["[Esc] Manager"])
      assert.doesNotMatch(vm.shortcuts.join(" "), /Enter|Open\/run|Preview|Select|type search|\[\?\] More/u)
    }
  })

  test("prompt shortcut chrome uses shared keycap formatting for find, filter, create, and delete bars", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    const textFor = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
    const chunkTextsForId = (root: Renderable, id: string): string[] => {
      const node = descendants(root).find((candidate) => candidate.id === id) as any
      return node?.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "") ?? []
    }
    try {
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "notes/daily.md", body: "alpha beta" }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      controller.openEditorFind()
      const editorRoot = renderEditorScreen({ renderer, controller })
      assert.deepEqual(chunkTextsForId(editorRoot, "bluenote-editor-find-hints"), ["0/0", "  ", "[Enter]", " Next", "  ", "[Shift+Enter]", " Previous", "  ", "[Esc]", " Close"])

      controller.showManager()
      controller.openManagerFilter()
      let managerRoot = renderManagerScreen({ renderer, controller })
      assert.deepEqual(chunkTextsForId(managerRoot, "bluenote-manager-filter-hints"), ["[Esc]", " Close", "  ", "[Enter]", " Open"])

      controller.openManagerCreate()
      controller.updateManagerCreateTitle("Draft")
      managerRoot = renderManagerScreen({ renderer, controller })
      assert.deepEqual(chunkTextsForId(managerRoot, "bluenote-manager-create-hints"), ["[Enter]", " Create", "  ", "[Esc]", " Cancel"])

      controller.cancelManagerCreate()
      controller.openManagerDeleteConfirmation()
      managerRoot = renderManagerScreen({ renderer, controller })
      assert.deepEqual(chunkTextsForId(managerRoot, "bluenote-manager-delete-hints"), ["[Enter/y]", " Confirm", "  ", "[Esc/n]", " Cancel"])
      assert.doesNotMatch(descendants(managerRoot).map(textFor).join("\n"), /Enter\/y confirm|Esc\/n cancel|Enter create|Esc cancel|Enter apply|Esc close/u)
    } finally {
      renderer.destroy()
    }
  })

  test("shortcut renderer treats overflow counts as muted text rather than fake keycaps", () => {
    const content = renderShortcutHints([{ key: "Ctrl+S", action: "Save" }, { key: "Ctrl+F", action: "Find" }, { text: "+3" }])
    const chunks = content.chunks.map((chunk) => ({ text: chunk.text, color: chunk.fg?.toString() }))

    assert.deepEqual(chunks.map((chunk) => chunk.text), ["[Ctrl+S]", " Save", "  ", "[Ctrl+F]", " Find", "  ", "+3"])
    assert.equal(chunks.find((chunk) => chunk.text === "+3")?.color, chunks.find((chunk) => chunk.text === " Save")?.color)
    assert.equal(chunks.some((chunk) => chunk.text === "[+3]"), false)
  })

  test("Search Everything view model hides preview manually or at short heights with compact status", () => {
    const results: SearchEverythingResult[] = [
      {
        kind: "note",
        typeLabel: "note",
        typeIcon: "note",
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
    ]
    const visibleState: TuiState = {
      ...baseState,
      screen: "search",
      search: { query: "daily", selectedIndex: 0, previousScreen: "manager", previewVisible: true },
    }

    const manualVm = buildSearchEverythingViewModel(
      { ...visibleState, search: { ...visibleState.search!, previewVisible: false } },
      results,
      { height: 40 },
    )
    const shortVm = buildSearchEverythingViewModel(visibleState, results, { height: 19 })
    const thresholdVm = buildSearchEverythingViewModel(visibleState, results, { height: 20 })

    assert.deepEqual(manualVm.preview, {
      visible: false,
      hiddenReason: "manual",
      hiddenStatus: "Preview hidden · Alt+P preview show",
      styleIntent: "mutedText",
    })
    assert.equal("sections" in manualVm.preview!, false)
    assert.deepEqual(shortVm.preview, {
      visible: false,
      hiddenReason: "short-height",
      hiddenStatus: "Preview hidden for short terminal · Alt+P preview show",
      styleIntent: "mutedText",
    })
    assert.equal("sections" in shortVm.preview!, false)
    const thresholdPreview = thresholdVm.preview
    assert.equal(thresholdPreview?.visible, true)
    if (thresholdPreview?.visible) {
      assert.deepEqual(thresholdPreview.sections.map((section) => section.label), ["Metadata", "Description"])
    }
    assert.deepEqual(manualVm.regions.map((region) => region.id), ["input", "result-list"])
    assert.deepEqual(shortVm.regions.map((region) => region.id), ["input", "result-list"])
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
    assert.equal(vm.regions.filter((region) => region.kind === "results").length, 1)
    assert.equal(vm.regions.filter((region) => region.kind === "preview").length, 1)
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

  test("manager renderer uses responsive panes, bottom-path-only hidden preview state, and minimal root chrome", async () => {
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
      const wideLayout1 = descendants(wideScreen).find((node) => node.id === "bluenote-manager-layout-1") as { getChildren: () => Renderable[] } | undefined
      const wideLayout2 = descendants(wideScreen).find((node) => node.id === "bluenote-manager-layout-2") as { getChildren: () => Renderable[] } | undefined
      const widePreviewText = wideLayout2?.getChildren().map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "") ?? []
      const renderedRowSegments = wideLayout1?.getChildren()[0]?.getChildren().map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "") ?? []
      const renderedRowText = renderedRowSegments.join("")

      assert.equal(wideIds.includes("bluenote-manager-layout-1"), true)
      assert.equal(wideIds.includes("bluenote-manager-layout-2"), true)
      assert.equal((wideScreen as any).border, false)
      assert.equal((wideScreen as any).title ?? "", "")
      assert.deepEqual(widePreviewText.slice(0, 6), ["Title", "Root Note", "Path", "notes/root-note.md", "Description", "A top-level note."])
      assert.equal(renderedRowText.startsWith("Root Note"), true)
      assert.doesNotMatch(renderedRowText, /^[\s›●📁📄]/u)
      assert.doesNotMatch(renderedRowText, /[›●]/u)
      assert.deepEqual(renderedRowSegments.slice(0, 1), ["Root Note".padEnd(24)])

      renderer.root.remove(wideScreen.id)
      wideScreen.destroyRecursively()

      const narrowScreen = renderManagerScreen({ renderer, controller, width: 60 })
      renderer.root.add(narrowScreen)
      const narrowIds = descendants(narrowScreen).map((node) => node.id)
      const narrowText = descendants(narrowScreen).map((node: any) => node.content?.chunks?.map((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? "").join("\n")
      const narrowLayout1 = descendants(narrowScreen).find((node) => node.id === "bluenote-manager-layout-1") as { width?: unknown } | undefined

      assert.equal(narrowIds.includes("bluenote-manager-layout-1"), true)
      assert.equal(narrowIds.includes("bluenote-manager-layout-2"), false)
      assert.equal((narrowLayout1 as any)?._width, "100%")
      assert.match(narrowText, /root-note\.md/u)
      assert.doesNotMatch(narrowText, /\[\?\] More/u)
      assert.match(narrowText, /Preview hidden for narrow terminal · p show/u)
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

  test("Search Everything renderer uses readable compact chrome, typed rows, and sectioned preview", async () => {
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
      controller.openSearch("daily")

      const root = renderSearchEverythingScreen({ renderer, controller })
      const nodes = descendants(root)
      const text = nodes.map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")
      const resultsRegion = nodes.find((node) => node.id === "bluenote-search-results-region") as { getChildren: () => Renderable[] } | undefined
      const previewRegion = nodes.find((node) => node.id === "bluenote-search-preview-region") as { getChildren: () => Renderable[] } | undefined
      const resultText = resultsRegion?.getChildren().map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n") ?? ""
      const previewLines = previewRegion?.getChildren().map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "") ?? []

      assert.equal((root as any).border, false)
      assert.equal((root as any).title ?? "", "")
      assert.notEqual(nodes.find((node) => node.id === "bluenote-search-input-region"), undefined)
      assert.notEqual(resultsRegion, undefined)
      assert.notEqual(previewRegion, undefined)
      assert.match(text, /Search Everything/u)
      assert.match(text, /Search · daily/u)
      assert.match(text, /Results · \d+/u)
      assert.match(resultText, /› \[note\] Daily Plan —/u)
      assert.doesNotMatch(resultText, /undefined/u)
      assert.deepEqual(previewLines.slice(0, 5), ["Preview · Daily Plan", "daily-plan.md — notes/inbox/daily-plan.md", "Metadata", "daily-plan.md — notes/inbox/daily-plan.md", "Description"])
      assert.match(text, /Today priorities\./u)
      controller.openSearch("/archive")
      controller.selectSearchResult()
      const statusRoot = renderSearchEverythingScreen({ renderer, controller })
      const statusText = descendants(statusRoot).map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")
      assert.match(statusText, /Command unavailable: \/archive/u)
      const textFor = (node: any) => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content
      const renderedStatusText = descendants(statusRoot).map((node: any) => textFor(node) ?? "").join("\n")
      const topbar = descendants(statusRoot).find((node: any) => textFor(node) === "Search Everything" && node.fg) as any
      const status = descendants(statusRoot).find((node: any) => textFor(node) === "Command unavailable: /archive" && node.fg) as any
      assert.notEqual(topbar, undefined)
      assert.match(renderedStatusText, /\[Esc\] Manager/u)
      assert.doesNotMatch(renderedStatusText, /Search Everything · Esc/u)
      assert.notEqual(status, undefined)
      assert.deepEqual(Array.from(topbar.fg.buffer), colorInts(tuiTheme.textPrimary))
      assert.deepEqual(Array.from(status.fg.buffer), colorInts(tuiTheme.statusInfo))
      assert.notDeepEqual(Array.from(topbar.fg.buffer), colorInts(tuiTheme.primaryAccent))
      assert.notDeepEqual(Array.from(status.fg.buffer), colorInts(tuiTheme.secondaryAccent))
      root.destroyRecursively()
      statusRoot.destroyRecursively()
    } finally {
      renderer.destroy()
    }
  })

  test("Search Everything renderer omits preview pane when hidden and does not render stale preview content", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const controller = createWorkspaceController({
        listNotes: () => [
          {
            key: "daily-plan",
            title: "Daily Plan",
            description: "Stale preview should not show.",
            relativePath: "notes/inbox/daily-plan.md",
            body: "Hidden preview body.",
          },
        ],
        showNote: () => ({ ...baseState.editor!.note }),
        searchNotes: () => [],
      })
      controller.openSearch("daily")
      controller.setSearchPreviewVisible(false)

      const root = renderSearchEverythingScreen({ renderer, controller })
      const nodes = descendants(root)
      const text = nodes.map((node: any) => node.content?.chunks?.[0]?.text ?? node.content ?? "").join("\n")

      assert.equal(nodes.some((node) => node.id === "bluenote-search-preview-region"), false)
      assert.match(text, /Preview hidden · Alt\+P preview show/u)
      assert.match(text, /\[note\] Daily Plan/u)
      assert.doesNotMatch(text, /Stale preview should not show|Hidden preview body|Metadata|Description/u)
    } finally {
      renderer.destroy()
    }
  })
})
