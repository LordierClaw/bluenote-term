import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import { createCliRenderer, InputRenderable, type Renderable } from "@opentui/core"

import { buildEditorViewModel, renderEditorScreen } from "../../../src/tui/render-editor"
import { buildManagerViewModel, renderManagerScreen } from "../../../src/tui/render-manager"
import { renderShortcutHints } from "../../../src/tui/render-chrome"
import { buildSearchEverythingViewModel, renderPreviewText, renderSearchEverythingScreen } from "../../../src/tui/render-search-everything"
import { displayCellWidth } from "../../../src/tui/display-width"
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
    canCreateFolder: true,
    items: [
      {
        type: "folder",
        key: "note/inbox",
        filename: "inbox/",
        title: "inbox",
        description: "2 notes",
        relativePath: "note/inbox",
      },
      {
        type: "note",
        key: "daily-plan",
        filename: "daily-plan.md",
        title: "Daily Plan",
        description: "Today priorities.",
        relativePath: "note/inbox/daily-plan.md",
      },
    ],
  },
  editor: {
    note: {
      key: "daily-plan",
      title: "Daily Plan",
      description: "Today priorities.",
      relativePath: "note/inbox/daily-plan.md",
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
      "selection",
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
    assert.equal(tuiTheme.background, "#000000")
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
      workspaceLabel: "Workspace · note/",
      summaryLabel: "2 items · Ready",
      orientation: "Browse your local Markdown workspace.",
      primaryActions: ["[Enter] Open", "[/] Filter", "[n] New", "[N] New Draft", "[Ctrl+P] Search", "[Esc] Back", "[p] Preview", "[r] Rename", "[m] Move"],
    })
    assert.deepEqual(vm.topbar, {
      leftTitle: "BlueNote",
      itemCountLabel: "2 items",
      appStatusLabel: "Ready",
      rightLabel: "2 items | Ready",
      bottomPath: "Currently open: Daily Plan",
      styleIntent: "textPrimary",
    })
    assert.equal(vm.panels.layout1.title, "note/")
    assert.equal(vm.panels.layout2.title, "")
    assert.equal(vm.status, "Ready")
    assert.deepEqual(vm.shortcutHints, [
      { key: "Enter", action: "Open", priority: "primary" },
      { key: "/", action: "Filter", priority: "primary" },
      { key: "n", action: "New", priority: "primary" },
      { key: "N", action: "New Draft", priority: "primary" },
      { key: "Ctrl+P", action: "Search", priority: "primary" },
      { key: "Esc", action: "Back", priority: "primary" },
      { key: "p", action: "Preview", priority: "primary" },
      { key: "r", action: "Rename", priority: "secondary" },
      { key: "m", action: "Move", priority: "secondary" },
    ])
    assert.deepEqual(vm.shortcuts, ["[Enter] Open", "[/] Filter", "[n] New", "[N] New Draft", "[Ctrl+P] Search", "[Esc] Back", "[p] Preview", "[r] Rename", "[m] Move"])
    const creatingVm = buildManagerViewModel({
      ...baseState,
      mode: "manager.create",
      manager: { ...baseState.manager, createDraft: { title: "Project Plan", status: "Title required" } },
    })
    assert.deepEqual(creatingVm.createPrompt, {
      visible: true,
      sheetTitle: "New note",
      description: "Create a Markdown note in this workspace.",
      destinationLabel: "Create in: note/",
      inputLabel: "Title:",
      title: "Project Plan",
      status: "Title required",
      inputId: "bluenote-manager-create-title",
      placeholder: "Note title…",
      focused: true,
      styleIntent: "borderFocus",
      surfaceIntent: "surfacePanelRaised",
      statusIntent: "warning",
      actions: ["[Enter] Create", "[Tab] Folder", "[Esc] Cancel"],
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
          relativePath: "note/inbox/daily-plan.md",
          status: null,
        },
      },
    })
    assert.deepEqual(deletingVm.deletePrompt, {
      visible: true,
      key: "daily-plan",
      sheetTitle: "Delete note?",
      title: "Daily Plan",
      relativePath: "note/inbox/daily-plan.md",
      consequenceLines: [
        "Deletes the Markdown file and BlueNote sidecar metadata.",
        "This cannot be undone.",
      ],
      status: null,
      styleIntent: "danger",
      surfaceIntent: "surfacePanelRaised",
      statusIntent: "danger",
      actions: ["[y] Delete", "[Esc] Cancel"],
    })
    const managerChrome = [vm.title, vm.status, ...vm.shortcutHints.map((hint) => hint.action), vm.panels.layout1.title, vm.panels.layout2.title].join(" ")
    assert.doesNotMatch(managerChrome, /BlueNote(?: TUI| Manager)?/i)
    assert.doesNotMatch(JSON.stringify(vm), /Layout 1: current folder|Layout 2: preview/u)
    assert.deepEqual(
      vm.rows.map((row) => ({ marker: row.focusMarker, openMarker: row.openMarker, key: row.key, filename: row.filename, title: row.title, description: row.description, focused: row.focused })),
      [
        { marker: "", openMarker: "", key: "note/inbox", filename: "inbox/", title: "inbox", description: "2 notes", focused: false },
        { marker: "", openMarker: "", key: "daily-plan", filename: "daily-plan.md", title: "Daily Plan", description: "Today priorities.", focused: true },
      ],
    )
    assert.deepEqual(
      vm.rows.map((row) => row.displaySegments),
      [
        { primary: "inbox", secondary: "2 notes", metadata: "" },
        { primary: "Daily Plan", secondary: "Today priorities.", metadata: "" },
      ],
    )
    assert.deepEqual(
      vm.rows.map((row) => ({ key: row.key, type: row.type, icon: row.icon, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent, openStyleIntent: row.openStyleIntent, metadataStyleIntent: row.metadataStyleIntent })),
      [
        { key: "note/inbox", type: "folder", icon: "📁", styleIntent: "panel", itemStyleIntent: "textPrimary", openStyleIntent: null, metadataStyleIntent: "mutedText" },
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
      title: "No items here yet",
      body: "Search your workspace from note/ or choose another folder.",
      actions: ["[Ctrl+P] Search"],
      styleIntent: "mutedText",
    })
    assert.deepEqual(emptyVm.panels, {
      layout1: { title: "note/", styleIntent: "borderFocus" },
      layout2: { title: "", styleIntent: "borderSubtle" },
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
    const wideVm = buildManagerViewModel({ ...baseState, mode: "manager.browse" }, undefined, { width: 100 })
    const narrowVm = buildManagerViewModel({ ...baseState, mode: "manager.browse" }, undefined, { width: 60 })
    const filteringVm = buildManagerViewModel({ ...baseState, mode: "manager.filter" }, undefined, { width: 100 })

    assert.deepEqual(wideVm.shortcutHints, [
      { key: "Enter", action: "Open", priority: "primary" },
      { key: "/", action: "Filter", priority: "primary" },
      { key: "n", action: "New", priority: "primary" },
      { key: "N", action: "New Draft", priority: "primary" },
      { key: "Ctrl+P", action: "Search", priority: "primary" },
      { key: "Esc", action: "Back", priority: "primary" },
      { key: "p", action: "Preview", priority: "primary" },
      { key: "r", action: "Rename", priority: "secondary" },
      { key: "m", action: "Move", priority: "secondary" },
    ])
    assert.deepEqual(wideVm.shortcuts, ["[Enter] Open", "[/] Filter", "[n] New", "[N] New Draft", "[Ctrl+P] Search", "[Esc] Back", "[p] Preview", "[r] Rename", "[m] Move"])
    assert.ok(wideVm.shortcuts.every((hint) => /^\[[^\]]+\] [A-Z?]/u.test(hint)), wideVm.shortcuts.join(" | "))
    assert.deepEqual(narrowVm.shortcuts, ["[Enter] Open", "[/] Filter", "[n] New", "[N] New Draft", "[Ctrl+P] Search", "[Esc] Back", "[p] Preview", "[r] Rename", "[m] Move"])
    assert.doesNotMatch([...wideVm.shortcuts, ...narrowVm.shortcuts].join(" "), /\[\?\] More/u)
    assert.doesNotMatch(narrowVm.shortcuts.join(" "), /Delete|Quit/u)
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
        currentFolderPath: "note/inbox",
        hoveredPath: "note/inbox/daily-plan.md",
        selectedNoteKey: "daily-plan",
      },
    })

    assert.equal(vm.topbar.leftTitle, "BlueNote")
    assert.equal(vm.topbar.itemCountLabel, "1 items (filtered)")
    assert.equal(vm.topbar.appStatusLabel, "Indexing...")
    assert.equal(vm.topbar.rightLabel, "1 items (filtered) | Indexing...")
    assert.equal(vm.topbar.bottomPath, "Currently open: Daily Plan")
    assert.doesNotMatch(vm.topbar.rightLabel, /notes\/|daily-plan|Rebuild idle|Index ready/u)

    const filenameFallbackVm = buildManagerViewModel({
      ...baseState,
      editor: {
        ...baseState.editor!,
        note: { ...baseState.editor!.note, title: "", relativePath: "note/inbox/untitled-note.md" },
      },
    })
    assert.equal(filenameFallbackVm.topbar.bottomPath, "Currently open: untitled-note.md")

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
            relativePath: "note/note-a.md",
          },
          {
            type: "note",
            key: "note-b",
            filename: "note-b.md",
            title: "Note B",
            description: "Open note.",
            relativePath: "note/note-b.md",
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
          relativePath: "note/note-b.md",
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
        { key: "note/inbox", focused: false, styleIntent: "panel", openStyleIntent: null },
        { key: "daily-plan", focused: true, styleIntent: "focusedRow", openStyleIntent: null },
      ],
    )
  })

  test("manager browser view model exposes two-column rows and folder preview without decorative type coloring", () => {
    const summaries: NoteManagerSummary[] = [
      { key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "note/root-note.md", body: "# Root Note" },
      { key: "api-roadmap", title: "API Roadmap", description: "Ship API work.", relativePath: "note/projects/api-roadmap.md" },
      { key: "client-brief", title: "Client Brief", description: "Client notes.", relativePath: "note/projects/client/client-brief.md" },
    ]
    const browser = buildManagerBrowserModel(summaries, {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "api-roadmap",
      currentFolderPath: "note",
      hoveredPath: "note/projects",
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
      bottomPath: "Currently open: Daily Plan",
      styleIntent: "textPrimary",
    })
    assert.deepEqual(vm.panels, {
      layout1: { title: "note", styleIntent: "borderFocus" },
      layout2: { title: "projects", styleIntent: "borderSubtle" },
    })
    assert.match(vm.shortcuts.join(" "), /\[Ctrl\+P\] Search/u)
    assert.doesNotMatch(vm.shortcuts.join(" "), /\[\?\] More/u)
    assert.doesNotMatch(JSON.stringify(vm), /Layout 1: current folder|Layout 2: preview/u)
    assert.deepEqual(
      vm.layout1.rows.map((row) => ({ filename: row.filename, displaySegments: row.displaySegments, focused: row.focused, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent })),
      [
        { filename: "projects", displaySegments: { primary: "projects", secondary: "", metadata: "" }, focused: true, styleIntent: "focusedRow", itemStyleIntent: "textPrimary" },
        { filename: "root-note.md", displaySegments: { primary: "Root Note", secondary: "A top-level note.", metadata: "" }, focused: false, styleIntent: "panel", itemStyleIntent: "textPrimary" },
      ],
    )
    assert.equal(vm.layout2.preview.type, "folder")
    assert.deepEqual(vm.layout2.preview.sections, [
      { label: "Items", lines: ["client", "API Roadmap"] },
    ])
    assert.deepEqual(vm.layout2.preview.sections.map((section) => section.label), ["Items"])
    assert.doesNotMatch(JSON.stringify(vm.layout2.preview.sections), /Path|Description|Contents/u)
    assert.deepEqual(
      vm.layout2.preview.rows.map((row) => ({ filename: row.filename, displaySegments: row.displaySegments, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent })),
      [
        { filename: "client", displaySegments: { primary: "client", secondary: "", metadata: "" }, styleIntent: "panel", itemStyleIntent: "textPrimary" },
        { filename: "api-roadmap.md", displaySegments: { primary: "API Roadmap", secondary: "Ship API work.", metadata: "" }, styleIntent: "panel", itemStyleIntent: "textPrimary" },
      ],
    )
  })

  test("manager row display labels clamp long folder and note text at narrow manager widths", () => {
    const longFolderName = "folder-".repeat(12)
    const longNoteFilename = `${"filename-".repeat(10)}日本語𠀀.md`
    const longNoteTitle = `Launch notes ${"日本語".repeat(8)} ${"alpha ".repeat(10)}`
    const longDescription = `Description ${"detail ".repeat(20)}`
    const vm = buildManagerViewModel({
      ...baseState,
      editor: null,
      manager: {
        items: [
          {
            type: "folder",
            key: "note/long-folder",
            filename: `${longFolderName}/`,
            title: longFolderName,
            description: "42 notes in this very long folder description",
            relativePath: `note/${longFolderName}`,
          },
          {
            type: "note",
            key: "long-note",
            filename: longNoteFilename,
            title: longNoteTitle,
            description: longDescription,
            relativePath: "note/long-note.md",
          },
        ],
        focusedIndex: 0,
        selectedNoteKey: null,
      },
    }, undefined, { width: 80 })

    assert.equal(vm.layout1.rows.length, 2)
    for (const row of vm.layout1.rows) {
      assert.ok(row.displaySegments.primary.endsWith("…"), row.displaySegments.primary)
      assert.ok(displayCellWidth(row.displaySegments.primary) <= 24, row.displaySegments.primary)
      assert.ok(displayCellWidth(row.displaySegments.secondary) <= 12, row.displaySegments.secondary)
    }
    assert.match(vm.layout1.rows[0]!.displaySegments.primary, /^folder-/u)
    assert.match(vm.layout1.rows[1]!.displaySegments.primary, /^Launch note/u)
    assert.doesNotMatch(vm.layout1.rows[1]!.displaySegments.primary, /^filename-/u)
    assert.doesNotMatch(vm.layout1.rows[1]!.displaySegments.primary, /�/u)
    assert.ok(vm.layout1.rows[1]!.displaySegments.secondary.endsWith("…"), vm.layout1.rows[1]!.displaySegments.secondary)
  })

  test("manager note preview exposes title and content lines without metadata rows", () => {
    const browser = buildManagerBrowserModel([
      {
        key: "root-note",
        title: "Root Note",
        description: "A top-level note.",
        relativePath: "note/root-note.md",
        body: "# Root Note\n\nPreview body.",
      },
    ], {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "root-note",
      currentFolderPath: "note",
      hoveredPath: "note/root-note.md",
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
        note: { ...baseState.editor!.note, key: "root-note", relativePath: "note/root-note.md", title: "Root Note" },
      },
    } as TuiState, browser)

    assert.deepEqual(vm.layout2.preview, {
      type: "note-content",
      title: "Root Note",
      path: "note/root-note.md",
      noteKey: "root-note",
      contentLines: ["# Root Note", "", "Preview body."],
      sections: [
        { label: "", lines: ["Root Note", "", "# Root Note", "", "Preview body."] },
      ],
      styleIntent: "panel",
    })
    assert.equal("description" in vm.layout2.preview, false)
    assert.deepEqual(vm.layout2.preview.sections.map((section) => section.label), [""])
    assert.deepEqual(vm.layout2.preview.sections[0]?.lines, ["Root Note", "", "# Root Note", "", "Preview body."])
    assert.doesNotMatch(JSON.stringify(vm.layout2.preview.sections), /"label":"Preview"/u)
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
        relativePath: "note/root-note.md",
        body: "# Root Note\n\nPreview body.",
      },
    ], {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "root-note",
      currentFolderPath: "note",
      hoveredPath: "note/root-note.md",
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
      { key: "api-roadmap", title: "API Roadmap", description: "Ship API work.", relativePath: "note/projects/api-roadmap.md" },
    ], {
      items: [],
      focusedIndex: 0,
      selectedNoteKey: "api-roadmap",
      currentFolderPath: "note/projects",
      hoveredPath: "note/projects/api-roadmap.md",
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
    assert.equal(vm.panels.layout1.title, "note/projects")
    assert.equal(vm.panels.layout2.title, "Preview hidden")
    assert.equal(vm.layout2.preview.type, "hidden")
    assert.match(vm.shortcuts.join(" "), /\[Ctrl\+P\] Search/u)
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
      { key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "note/root-note.md" },
      { key: "api-roadmap", title: "API Roadmap", description: "Ship API work.", relativePath: "note/projects/api-roadmap.md" },
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
    assert.equal(vm.layout2.preview.path, "note/root-note.md")
    assert.deepEqual(vm.layout2.preview.contentLines, ["# Root Note", "", "Hydrated preview body."])
  })

  test("editor view model exposes structured topbar, editor body metadata, and bottombar data", () => {
    const vm = buildEditorViewModel({ ...baseState, screen: "editor" })

    assert.deepEqual(Object.keys(vm).sort(), ["body", "bottombar", "chrome", "find", "topbar"])
    assert.deepEqual(vm.chrome, {
      topBodySeparator: "─",
      bodyBottomSeparator: "─",
      separatorIntent: "borderSubtle",
    })
    assert.deepEqual(vm.topbar, {
      noteName: "Daily Plan",
      directoryPath: "note/inbox",
      filename: "daily-plan.md",
      fullPath: "note/inbox/daily-plan.md",
      pathSeparator: "|",
      updatedSeparator: "|",
      fullPathIntent: "mutedText",
      relativePath: "note/inbox/daily-plan.md",
      key: "daily-plan",
      dirty: false,
      saveStatusLabel: "Saved",
      statusIntent: "success",
      updatedLabel: "Updated unknown",
      updatedIntent: "mutedText",
      titleIntent: "textPrimary",
      metadataIntent: "mutedText",
      statusLabel: "Saved",
      wrapLabel: "Wrap on",
      noteSwitchIndicator: null,
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
      margin: { top: 1, x: 0 },
      textIntent: "textPrimary",
      placeholderIntent: "mutedText",
      cursorIntent: "borderFocus",
    })
    assert.equal(vm.find, null)
    assert.equal("row1" in vm.bottombar, false)
    assert.deepEqual(vm.bottombar.row2, {
      shortcuts: [
        "[Ctrl+S] Save",
        "[Ctrl+F] Find",
        "[Ctrl+R] Replace",
        "[Ctrl+P] Search",
        "[Esc] Manager",
        "[Ctrl+Z] Undo",
        "[Ctrl+Y] Redo",
        "[Alt+Z] Wrap",
        "[Ctrl+PageUp/Down] Switch Note",
      ],
      visibleShortcuts: [
        "[Ctrl+S] Save",
        "[Ctrl+F] Find",
        "[Ctrl+R] Replace",
        "[Ctrl+P] Search",
        "[Esc] Manager",
        "[Ctrl+Z] Undo",
        "[Ctrl+Y] Redo",
        "[Alt+Z] Wrap",
        "[Ctrl+PageUp/Down] Switch Note",
      ],
      visibleShortcutHints: [
        { key: "Ctrl+S", action: "Save" },
        { key: "Ctrl+F", action: "Find" },
        { key: "Ctrl+R", action: "Replace" },
        { key: "Ctrl+P", action: "Search" },
        { key: "Esc", action: "Manager" },
        { key: "Ctrl+Z", action: "Undo" },
        { key: "Ctrl+Y", action: "Redo" },
        { key: "Alt+Z", action: "Wrap" },
        { key: "Ctrl+PageUp/Down", action: "Switch Note" },
      ],
      hiddenShortcutCount: 0,
    })

    const editorChrome = JSON.stringify({ topbar: vm.topbar, bottombar: vm.bottombar })
    assert.doesNotMatch(editorChrome, /BlueNote(?: TUI| Editor)?/i)
    assert.doesNotMatch(editorChrome, /Ctrl\+H/u)
    assert.equal("title" in vm.topbar, false)
    assert.doesNotMatch(JSON.stringify({ topbar: vm.topbar, body: vm.body, bottombar: vm.bottombar }), /Editor body|Line \d+, Col \d+|Ln \d+, Col \d+/u)
    assert.equal(vm.topbar.wrapLabel, "Wrap on")
    assert.doesNotMatch(editorChrome, /copy|paste|copy-all|replace-all|select all|Alt\+A|Ctrl\+A/i)

    const dirtyVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, dirty: true, body: `${baseState.editor!.body}\nunsaved` } })
    assert.equal(dirtyVm.topbar.saveStatusLabel, "Unsaved")
    assert.equal(dirtyVm.topbar.statusIntent, "warning")

    const autosaveVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, autosaveStatus: "saving" } as TuiState["editor"] })
    assert.equal(autosaveVm.topbar.saveStatusLabel, "Saving…")
    assert.equal(autosaveVm.topbar.statusIntent, "warning")
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

    const expected = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date("2026-05-28T10:30:00.000Z")).replace(",", "")
    assert.equal(vm.topbar.updatedLabel, `Updated ${expected}`)
    assert.equal(vm.topbar.updatedIntent, "mutedText")
    assert.notEqual(vm.topbar.updatedLabel, "Updated unknown")
  })

  test("editor writing polish keeps metadata calm, margins intentional, and shortcuts compressed while typing", () => {
    const vm = buildEditorViewModel({ ...baseState, screen: "editor", mode: "editor.body" }, { width: 48 })

    assert.deepEqual(
      {
        titleIntent: vm.topbar.titleIntent,
        metadataIntent: vm.topbar.metadataIntent,
        fullPathIntent: vm.topbar.fullPathIntent,
        updatedIntent: vm.topbar.updatedIntent,
        statusIntent: vm.topbar.statusIntent,
        bodyTextIntent: vm.body.textIntent,
        cursorIntent: vm.body.cursorIntent,
        margin: vm.body.margin,
      },
      {
        titleIntent: "textPrimary",
        metadataIntent: "mutedText",
        fullPathIntent: "mutedText",
        updatedIntent: "mutedText",
        statusIntent: "success",
        bodyTextIntent: "textPrimary",
        cursorIntent: "borderFocus",
        margin: { top: 1, x: 0 },
      },
    )
    assert.equal(vm.topbar.statusLabel, "Saved")
    assert.equal(vm.topbar.wrapLabel, "Wrap on")
    assert.deepEqual(vm.bottombar.row2.visibleShortcuts, ["[Ctrl+S] Save", "[Ctrl+F] Find"])
    assert.equal(vm.bottombar.row2.hiddenShortcutCount, 7)

    const eightyColumnVm = buildEditorViewModel({ ...baseState, screen: "editor", mode: "editor.body" }, { width: 76 })
    assert.deepEqual(eightyColumnVm.bottombar.row2.visibleShortcuts, ["[Ctrl+S] Save", "[Ctrl+F] Find", "[Ctrl+R] Replace", "[Ctrl+P] Search"])
    assert.equal(eightyColumnVm.bottombar.row2.visibleShortcuts.join("  ").length + "  +5".length <= 76, true)
  })

  test("editor find prompt is a quiet task sheet with query, match count, and find-specific actions", () => {
    const vm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      mode: "editor.find",
      editor: {
        ...baseState.editor!,
        findQuery: "Plan",
        findMatchCount: 2,
        activeFindIndex: 0,
      },
    })

    assert.deepEqual(vm.find, {
      visible: true,
      sheetTitle: "Find in note",
      description: "",
      inputLabel: "Query:",
      query: "Plan",
      matchCount: 2,
      activeIndex: 0,
      countLabel: "1/2 matches",
      placeholder: "Find in note…",
      focused: true,
      styleIntent: "borderFocus",
      surfaceIntent: "surfacePanelRaised",
      statusIntent: "info",
      shortcutHints: [
        { text: "1/2 matches" },
        { key: "Enter", action: "Next" },
        { key: "Shift+Enter", action: "Previous" },
        { key: "Esc", action: "Close" },
      ],
    })
    assert.deepEqual(vm.bottombar.row2.visibleShortcuts, [
      "[Ctrl+S] Save",
      "[Ctrl+F] Find",
      "[Ctrl+R] Replace",
      "[Ctrl+P] Search",
      "[Esc] Manager",
      "[Ctrl+Z] Undo",
      "[Ctrl+Y] Redo",
      "[Alt+Z] Wrap",
      "[Ctrl+PageUp/Down] Switch Note",
    ])
    assert.deepEqual(vm.bottombar.row2.visibleShortcutHints, [
      { key: "Ctrl+S", action: "Save" },
      { key: "Ctrl+F", action: "Find" },
      { key: "Ctrl+R", action: "Replace" },
      { key: "Ctrl+P", action: "Search" },
      { key: "Esc", action: "Manager" },
      { key: "Ctrl+Z", action: "Undo" },
      { key: "Ctrl+Y", action: "Redo" },
      { key: "Alt+Z", action: "Wrap" },
      { key: "Ctrl+PageUp/Down", action: "Switch Note" },
    ])
    assert.equal(vm.bottombar.row2.hiddenShortcutCount, 0)
  })

  test("editor replace prompt shows find and replacement inputs, replace actions, and active match range", () => {
    const vm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      mode: "editor.replace",
      editor: {
        ...baseState.editor!,
        body: "alpha beta alpha",
        savedBody: "alpha beta alpha",
        findQuery: "alpha",
        replacementText: "omega",
        replaceField: "find",
        findMatchCount: 2,
        activeFindIndex: 1,
      },
    })

    assert.equal(vm.find?.sheetTitle, "Find and replace")
    assert.equal(vm.find?.description, "")
    assert.doesNotMatch(JSON.stringify(vm.find), /Search within/u)
    assert.equal(vm.find?.inputLabel, "Find:")
    assert.equal(vm.find?.query, "alpha")
    assert.equal(vm.find?.activeField, "find")
    assert.equal(vm.find?.findFocused, true)
    assert.equal(vm.find?.replacementFocused, false)
    assert.equal(vm.find?.replacementLabel, "Replace:")
    assert.equal(vm.find?.replacement, "omega")
    assert.deepEqual(vm.find?.shortcutHints, [
      { text: "2/2 matches" },
      { key: "Tab", action: "Replacement field" },
      { key: "Enter", action: "Next match" },
      { key: "Alt+Enter", action: "All" },
      { key: "Esc", action: "Close" },
    ])
    assert.deepEqual(vm.body.activeFindRange, { start: 11, end: 16, intent: "activeItem" })
    assert.equal(vm.body.value, "alpha beta alpha")
    assert.ok(vm.bottombar.row2.visibleShortcuts.includes("[Ctrl+S] Save"))
    assert.ok(vm.bottombar.row2.visibleShortcuts.includes("[Ctrl+F] Find"))
    assert.ok(vm.bottombar.row2.visibleShortcuts.includes("[Ctrl+R] Replace"))
    assert.equal(vm.bottombar.row2.visibleShortcutHints.length > 0, true)
  })

  test("editor replace prompt keeps occurrence context without noisy copy or cramped field layout", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    const state: TuiState = {
      ...baseState,
      screen: "editor",
      mode: "editor.replace",
      editor: {
        ...baseState.editor!,
        body: "alpha beta alpha",
        savedBody: "alpha beta alpha",
        findQuery: "alpha",
        replacementText: "omega",
        replaceField: "find",
        findMatchCount: 2,
        activeFindIndex: 1,
      },
    }
    const controller = {
      getState: () => state,
      setEditorReplaceField: () => {},
      updateEditorFindQuery: () => {},
      updateEditorReplacement: () => {},
      advanceEditorFind: () => {},
      replaceCurrentEditorMatch: () => {},
    } as any
    try {
      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const findBar = screen.getChildren().find((child: any) => child.id === "bluenote-editor-find-bar") as any
      const copy = descendants(screen).find((child: any) => child.id === "bluenote-editor-find-copy")
      const replacement = descendants(screen).find((child: any) => child.id === "bluenote-editor-replace-text")
      const hints = descendants(screen).find((child: any) => child.id === "bluenote-editor-find-hints") as any
      const hintText = hints?.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? hints?.content ?? ""

      assert.equal(copy, undefined)
      assert.equal(findBar?.height, 7)
      assert.notEqual(replacement, undefined)
      assert.match(hintText, /2\/2 matches/u)
    } finally {
      renderer.destroy()
    }
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
    assert.equal(narrowVm.bottombar.row2.hiddenShortcutCount, 7)
    assert.doesNotMatch(narrowVm.bottombar.row2.shortcuts.join(" "), /\[\?\] More/u)
    assert.deepEqual(
      {
        above: narrowVm.body.overflow.above,
        below: narrowVm.body.overflow.below,
        indicator: narrowVm.body.overflow.indicator,
      },
      { above: false, below: true, indicator: "↓" },
    )
    assert.deepEqual(narrowVm.body.overflow.vertical, {
      indicatorIntent: "info",
      lineCount: 30,
      viewportLines: 8,
      scrollTop: 0,
      thumbTop: 0,
      thumbHeight: 2,
    })

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

    assert.deepEqual(
      {
        above: bottomCursorVm.body.overflow.above,
        below: bottomCursorVm.body.overflow.below,
        indicator: bottomCursorVm.body.overflow.indicator,
      },
      { above: true, below: false, indicator: "↑" },
    )
    assert.equal(bottomCursorVm.body.overflow.vertical?.scrollTop, 22)
    assert.equal(bottomCursorVm.body.overflow.vertical?.thumbTop, 6)
  })

  test("editor unwrap mode reports horizontal overflow and cursor-driven pan without changing body value", () => {
    const longLine = "abcdefghijklmnopqrstuvwxyz"
    const atStart = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: longLine, savedBody: longLine, cursorOffset: 0, selectionStart: 0, selectionEnd: 0, wrapMode: "none" },
    }, { bodyViewportColumns: 10 })

    assert.equal(atStart.body.value, longLine)
    assert.equal(atStart.body.wrapMode, "none")
    assert.equal(atStart.topbar.wrapLabel, "Wrap off")
    assert.deepEqual(atStart.body.overflow.horizontal, { left: false, right: true, indicator: "›", indicatorIntent: "info", scrollLeft: 0, lineIndicators: ["›"] })

    const panned = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: longLine, savedBody: longLine, cursorOffset: 15, selectionStart: 15, selectionEnd: 15, wrapMode: "none" },
    }, { bodyViewportColumns: 10 })

    assert.deepEqual(panned.body.overflow.horizontal, { left: true, right: true, indicator: "↔", indicatorIntent: "info", scrollLeft: 6, lineIndicators: ["↔"] })
    assert.equal(panned.topbar.wrapLabel, "Wrap off")

    const wrapped = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: longLine, savedBody: longLine, cursorOffset: 15, selectionStart: 15, selectionEnd: 15, wrapMode: "word" },
    }, { bodyViewportColumns: 10 })
    assert.equal(wrapped.body.overflow.horizontal, undefined)
  })

  test("editor unwrap right overflow exposes a high-contrast edge marker for undisplayed content", () => {
    const longLine = "abcdefghijklmnopqrstuvwxyz"
    const vm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: longLine, savedBody: longLine, cursorOffset: 0, selectionStart: 0, selectionEnd: 0, wrapMode: "none" },
    }, { bodyViewportColumns: 10 })

    assert.deepEqual(vm.body.overflow.horizontal, {
      left: false,
      right: true,
      indicator: "›",
      scrollLeft: 0,
      indicatorIntent: "info",
      lineIndicators: ["›"],
    })
    assert.equal(vm.topbar.wrapLabel, "Wrap off")

    const multipleVisibleLines = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: {
        ...baseState.editor!,
        body: `short\n${longLine}\n${longLine}`,
        savedBody: `short\n${longLine}\n${longLine}`,
        cursorOffset: 0,
        selectionStart: 0,
        selectionEnd: 0,
        wrapMode: "none",
      },
    }, { bodyViewportColumns: 10, bodyViewportLines: 3 })
    assert.deepEqual(multipleVisibleLines.body.overflow.horizontal?.lineIndicators, ["", "›", "›"])
  })

  test("editor unwrap horizontal pan uses terminal display-cell widths for wide and combining characters", () => {
    const wideLine = "日本語日本語"
    const wideAtStart = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: wideLine, savedBody: wideLine, cursorOffset: 0, selectionStart: 0, selectionEnd: 0, wrapMode: "none" },
    }, { bodyViewportColumns: 10 })

    assert.equal(wideAtStart.body.value, wideLine)
    assert.deepEqual(wideAtStart.body.overflow.horizontal, { left: false, right: true, indicator: "›", indicatorIntent: "info", scrollLeft: 0, lineIndicators: ["›"] })

    const wideAtEnd = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: wideLine, savedBody: wideLine, cursorOffset: Array.from(wideLine).length, selectionStart: Array.from(wideLine).length, selectionEnd: Array.from(wideLine).length, wrapMode: "none" },
    }, { bodyViewportColumns: 10 })

    assert.deepEqual(wideAtEnd.body.overflow.horizontal, { left: true, right: false, indicator: "‹", indicatorIntent: "info", scrollLeft: 3, lineIndicators: ["‹"] })

    const mixedLine = "abc日本語def"
    const mixedCursor = Array.from("abc日本").length
    const mixed = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: mixedLine, savedBody: mixedLine, cursorOffset: mixedCursor, selectionStart: mixedCursor, selectionEnd: mixedCursor, wrapMode: "none" },
    }, { bodyViewportColumns: 6 })

    assert.deepEqual(mixed.body.overflow.horizontal, { left: true, right: true, indicator: "↔", indicatorIntent: "info", scrollLeft: 2, lineIndicators: ["↔"] })

    const combiningLine = "a\u0301bcdefghi"
    const combining = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: { ...baseState.editor!, body: combiningLine, savedBody: combiningLine, cursorOffset: Array.from(combiningLine).length, selectionStart: Array.from(combiningLine).length, selectionEnd: Array.from(combiningLine).length, wrapMode: "none" },
    }, { bodyViewportColumns: 9 })

    assert.equal(combining.body.value, combiningLine)
    assert.equal(combining.body.overflow.horizontal, undefined)
  })

  test("editor renderer applies unwrapped horizontal scroll and display-only overflow indicator", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      ;(renderer as typeof renderer & { width?: number; height?: number }).width = 12
      ;(renderer as typeof renderer & { width?: number; height?: number }).height = 8
      const longLine = "abcdefghijklmnopqrstuvwxyz"
      const controller = createWorkspaceController({
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "note/daily.md", body: longLine }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "note/daily.md", body: longLine }),
        searchNotes: () => [],
      })
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      controller.toggleEditorWrapMode()
      controller.moveEditorCursor("home")
      for (let index = 0; index < 15; index += 1) controller.moveEditorCursor("right")

      const screen = renderEditorScreen({ renderer, controller })
      renderer.root.add(screen)
      const bodyDisplay = descendants(screen).find((node) => node.id === "bluenote-editor-body") as { scrollX?: number; content?: unknown } | undefined
      const indicator = descendants(screen).find((node) => node.id === "bluenote-editor-body-horizontal-overflow") as { content?: { chunks?: Array<{ text?: string }> } | string } | undefined
      const indicatorText = typeof indicator?.content === "string" ? indicator.content : indicator?.content?.chunks?.map((chunk) => chunk.text ?? "").join("")

      assert.equal(bodyDisplay?.scrollX, 8)
      assert.equal(indicatorText, "↔")
      assert.deepEqual((indicator as { fg?: { toInts?: () => number[] } } | undefined)?.fg?.toInts?.(), colorInts(tuiTheme.info))
      assert.equal(controller.getState().editor?.body, longLine)
    } finally {
      renderer.destroy()
    }
  })

  test("editor chrome extracts note directory and latest updated or modified labels from metadata", () => {
    const vm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: {
        ...baseState.editor!,
        note: {
          ...baseState.editor!.note,
          relativePath: "note/projects/client/client-brief.md",
          updatedAt: "2026-05-28T10:30:00.000Z",
          modifiedAt: "2026-05-28T11:45:00.000Z",
        },
      } as TuiState["editor"],
    })

    assert.equal(vm.topbar.directoryPath, "note/projects/client")
    assert.equal(vm.topbar.filename, "client-brief.md")
    const expectedModified = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date("2026-05-28T11:45:00.000Z")).replace(",", "")
    assert.equal(vm.topbar.updatedLabel, `Modified ${expectedModified}`)
  })

  test("editor topbar displays autosave status labels", () => {
    const statusFor = (autosaveStatus: NonNullable<TuiState["editor"]>["autosaveStatus"], dirty = true) =>
      buildEditorViewModel({
        ...baseState,
        screen: "editor",
        editor: {
          ...baseState.editor!,
          dirty,
          autosaveStatus,
        },
      }).topbar

    assert.deepEqual(
      [statusFor("pending"), statusFor("saving"), statusFor("saved", false), statusFor("error")].map((bar) => ({
        saveStatusLabel: bar.saveStatusLabel,
        saveStatusIntent: bar.statusIntent,
        statusLabel: bar.statusLabel,
      })),
      [
        { saveStatusLabel: "Unsaved", saveStatusIntent: "warning", statusLabel: "Unsaved" },
        { saveStatusLabel: "Saving…", saveStatusIntent: "warning", statusLabel: "Saving…" },
        { saveStatusLabel: "Saved", saveStatusIntent: "success", statusLabel: "Saved" },
        { saveStatusLabel: "Unsaved", saveStatusIntent: "danger", statusLabel: "Autosave failed" },
      ],
    )

    const clipboardStatusVm = buildEditorViewModel({
      ...baseState,
      screen: "editor",
      editor: {
        ...baseState.editor!,
        statusMessage: "Copied 12 chars to desktop clipboard",
        autosaveStatus: "saved",
        dirty: false,
      },
    })
    assert.equal(clipboardStatusVm.topbar.statusLabel, "Saved")
    assert.equal(clipboardStatusVm.topbar.statusIntent, "success")
    assert.deepEqual(clipboardStatusVm.bottombar.status, {
      label: "Copied 12 chars to desktop clipboard",
      intent: "info",
    })
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
      sheetTitle: "Find in note",
      description: "",
      inputLabel: "Query:",
      query: "Ship",
      matchCount: 1,
      activeIndex: 0,
      countLabel: "1/1 matches",
      placeholder: "Find in note…",
      focused: true,
      styleIntent: "borderFocus",
      surfaceIntent: "surfacePanelRaised",
      statusIntent: "info",
      shortcutHints: [
        { text: "1/1 matches" },
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
        relativePath: "note/inbox/daily-plan.md",
        matchIndex: 0,
        matchLabel: "body",
        excerpt: "Ship renderer screens with OpenTUI.",
        label: "Daily Plan",
        detail: "body — note/inbox/daily-plan.md",
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
        shortcut: "Ctrl+R",
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
      panel: "borderSubtle",
      input: "borderFocus",
      result: "borderSubtle",
      selectedResult: "activeItem",
      preview: "borderSubtle",
    })
    assert.deepEqual(vm.shortcutHints, [
      { key: "Enter", action: "Open/run", priority: "primary" },
      { key: "↑/↓", action: "Select", priority: "primary" },
      { key: "Esc", action: "Editor", priority: "primary" },
      { key: "Ctrl+P", action: "Close", priority: "primary" },
    ])
    assert.deepEqual(vm.shortcuts, ["[Enter] Open/run", "[↑/↓] Select", "[Esc] Editor", "[Ctrl+P] Close"])
    assert.doesNotMatch(vm.shortcuts.join(" "), /\[\?\] More/u)
    assert.deepEqual(
      vm.results.map((row) => ({
        marker: row.focusMarker,
        typeLabel: row.typeLabel,
        tagLabel: row.tagLabel,
        riskLabel: row.riskLabel,
        availabilityLabel: row.availabilityLabel,
        typeIcon: row.typeIcon,
        primaryLabel: row.primaryLabel,
        detail: row.detail,
        selected: row.selected,
        selectedMarker: row.selectedMarker,
      })),
      [
        { marker: " ", typeLabel: "content", tagLabel: "note", riskLabel: null, availabilityLabel: null, typeIcon: "content", primaryLabel: "Daily Plan", detail: "body — note/inbox/daily-plan.md", selected: false, selectedMarker: " " },
        { marker: "›", typeLabel: "command", tagLabel: "cmd", riskLabel: null, availabilityLabel: null, typeIcon: "command", primaryLabel: "/replace", detail: "Find and replace text in the active editor buffer", selected: true, selectedMarker: "›" },
      ],
    )
    assert.deepEqual(vm.results.map((row) => row.styleIntent), ["panel", "focusedRow"])
    assert.deepEqual(vm.results.map((row) => row.primaryStyleIntent), ["textPrimary", "activeItem"])
    assert.deepEqual(vm.results.map((row) => row.detailStyleIntent), ["mutedText", "activeItem"])
    assert.deepEqual(vm.results.map((row) => row.typeStyleIntent), ["info", "info"])
    assert.deepEqual(vm.results.map((row) => row.availabilityStyleIntent), [null, null])
    assert.deepEqual(vm.preview, {
      visible: true,
      hiddenReason: null,
      hiddenStatus: null,
      title: "/replace",
      subtitle: "",
      lines: ["Find and replace text in the active editor buffer", "/replace <query> <replacement>", "Ctrl+R"],
      sections: [],
      styleIntent: "borderSubtle",
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
      assert.equal(contentPreview.title, "note/inbox/daily-plan.md")
      assert.deepEqual(contentPreview.sections, [])
      assert.deepEqual(contentPreview.linesText, [{ text: "Ship renderer screens with OpenTUI.", highlights: [{ start: 0, end: 4 }] }])
    }
  })

  test("Search Everything preview view model highlights centered content excerpts", () => {
    const results: SearchEverythingResult[] = [
      {
        kind: "content",
        typeLabel: "content",
        typeIcon: "content",
        id: "content:daily-plan:deep",
        key: "daily-plan",
        title: "Daily Plan",
        relativePath: "note/inbox/daily-plan.md",
        matchIndex: 0,
        matchLabel: "body line 30",
        excerpt: "...release checklist identifies launch blockers before handoff...",
        label: "Daily Plan",
        detail: "body line 30 — note/inbox/daily-plan.md",
        score: 100,
      },
    ]
    const vm = buildSearchEverythingViewModel({ ...baseState, screen: "search", search: { query: "launch blockers", selectedIndex: 0, previousScreen: "manager" } }, results)

    assert.equal(vm.preview?.visible, true)
    if (vm.preview?.visible) {
      assert.deepEqual(vm.preview.sections, [])
      assert.deepEqual(vm.preview.linesText, [
        { text: "...release checklist identifies launch blockers before handoff...", highlights: [{ start: 32, end: 47 }] },
      ])
      const rendered = renderPreviewText(vm.preview.linesText![0]!, "mutedText")
      const chunks = typeof rendered === "string" ? [{ text: rendered }] : rendered.chunks
      assert.deepEqual(chunks.map((chunk: { text?: string }) => chunk.text), ["...release checklist identifies ", "launch blockers", " before handoff..."])
    }
  })

  test("Search Everything empty state teaches examples, recents, and command suggestions without impossible Enter action", () => {
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
      assert.deepEqual(vm.shortcutHints, [{ key: "Esc", action: "Manager", priority: "primary" }, { key: "Ctrl+P", action: "Close", priority: "primary" }])
      assert.deepEqual(vm.shortcuts, ["[Esc] Manager", "[Ctrl+P] Close"])
      assert.doesNotMatch(vm.shortcuts.join(" "), /Enter|Open\/run|Preview|Select|type search|\[\?\] More/u)
    }
    assert.deepEqual(emptyVm.emptyState, {
      title: "Search your local workspace",
      examples: ["daily plan", "note/projects", "/save"],
      recentActions: ["Open recent notes", "Jump to folders", "Run available commands"],
      commandSuggestions: ["/new", "/find", "/replace", "/save", "/delete"],
      styleIntent: "mutedText",
    })
    assert.equal(typingVm.emptyState?.title, "No matches yet")
  })

  test("Search Everything view model windows long result lists by available height and selected row", () => {
    const results: SearchEverythingResult[] = Array.from({ length: 12 }, (_, index) => ({
      kind: "note",
      typeLabel: "note",
      typeIcon: "note",
      id: `note:daily-${index}`,
      key: `daily-${index}`,
      title: `Daily ${index}`,
      relativePath: `note/daily-${index}.md`,
      filename: `daily-${index}.md`,
      description: `Daily ${index} body`,
      matchedFields: ["title"],
      label: `Daily ${index}`,
      detail: `note/daily-${index}.md`,
      score: 100 - index,
    }))
    const build = (selectedIndex: number) => buildSearchEverythingViewModel(
      { ...baseState, screen: "search", search: { query: "daily", selectedIndex, previousScreen: "manager" } },
      results,
      { height: 20 },
    )

    const top = build(0)
    const deep = build(8)
    const backNearTop = build(2)

    assert.equal(top.resultCount, 12)
    assert.equal(top.results.length, top.resultViewport.visibleRowCount)
    assert.deepEqual(top.results.map((row) => row.primaryLabel), ["Daily 0", "Daily 1", "Daily 2", "Daily 3"])
    assert.deepEqual(top.resultViewport, { startIndex: 0, endIndex: 4, visibleRowCount: 4, totalCount: 12, selectedIndex: 0, hasMoreAbove: false, hasMoreBelow: true, aboveLabel: null, belowLabel: "8 more below" })

    assert.deepEqual(deep.results.map((row) => row.primaryLabel), ["Daily 5", "Daily 6", "Daily 7", "Daily 8"])
    assert.equal(deep.results.some((row) => row.primaryLabel === "Daily 8" && row.selected), true)
    assert.deepEqual(deep.resultViewport, { startIndex: 5, endIndex: 9, visibleRowCount: 4, totalCount: 12, selectedIndex: 8, hasMoreAbove: true, hasMoreBelow: true, aboveLabel: "5 more above", belowLabel: "3 more below" })

    assert.deepEqual(backNearTop.results.map((row) => row.primaryLabel), ["Daily 0", "Daily 1", "Daily 2", "Daily 3"])
    assert.equal(backNearTop.results.some((row) => row.primaryLabel === "Daily 2" && row.selected), true)
  })

  test("Search Everything folder preview view model carries item-only contents and title highlights", () => {
    const results: SearchEverythingResult[] = [
      {
        kind: "folder",
        typeLabel: "folder",
        typeIcon: "folder",
        id: "folder:note/projects/client",
        path: "note/projects/client",
        name: "client",
        noteCount: 3,
        previewLines: ["research", "brief.md", "todo.md"],
        label: "client/",
        detail: "3 notes in note/projects/client",
        score: 100,
      },
    ]
    const vm = buildSearchEverythingViewModel(
      {
        ...baseState,
        screen: "search",
        search: { query: "client", selectedIndex: 0, previousScreen: "manager" },
      },
      results,
    )

    assert.equal(vm.preview?.visible, true)
    if (vm.preview?.visible) {
      assert.equal(vm.preview.title, "note/projects/client")
      assert.deepEqual(vm.preview.titleText, {
        text: "note/projects/client",
        highlights: [{ start: 14, end: 20 }],
      })
      assert.equal(vm.preview.subtitle, "")
      assert.deepEqual(vm.preview.lines, ["research", "brief.md", "todo.md"])
      assert.deepEqual(vm.preview.sections, [])
      assert.doesNotMatch(JSON.stringify(vm.preview.sections), /notes\/projects\/client|\bnotes?\b in/u)
    }
  })

  test("Search Everything slash commands expose compact command tags without unavailable rows", () => {
    const commands: SearchEverythingResult[] = [
      { kind: "command", id: "command:/save", typeLabel: "command", typeIcon: "command", label: "/save", detail: "Save the active editor buffer", score: 100, name: "/save", description: "Save the active editor buffer", usage: "/save", shortcut: "Ctrl+S" },
      { kind: "command", id: "command:/delete", typeLabel: "command", typeIcon: "command", label: "/delete", detail: "Delete the selected or active note after confirmation", score: 90, name: "/delete", description: "Delete the selected or active note after confirmation", usage: "/delete [note-key]", shortcut: "d" },
    ]
    const vm = buildSearchEverythingViewModel({ ...baseState, screen: "search", search: { query: "/", selectedIndex: 1, previousScreen: "manager" } }, commands)

    assert.deepEqual(vm.results.map((row) => ({ label: row.primaryLabel, tag: row.tagLabel, risk: row.riskLabel, available: row.availabilityLabel, riskIntent: row.riskStyleIntent, availabilityIntent: row.availabilityStyleIntent })), [
      { label: "/save", tag: "cmd", risk: null, available: null, riskIntent: null, availabilityIntent: null },
      { label: "/delete", tag: "danger", risk: "destructive", available: null, riskIntent: "danger", availabilityIntent: null },
    ])
    assert.equal(vm.results.find((row) => row.primaryLabel === "/delete")?.typeStyleIntent, "danger")
    const preview = vm.preview
    assert.equal(preview?.visible, true)
    if (preview?.visible) {
      assert.deepEqual(preview.sections, [])
      assert.deepEqual(preview.lines, ["Delete the selected or active note after confirmation", "/delete [note-key]", "d"])
      assert.doesNotMatch(JSON.stringify(preview), /Usage|Shortcut|Risk|Availability|destructive|unavailable/u)
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
        listNotes: () => [{ key: "daily", title: "Daily", description: "", relativePath: "note/daily.md", body: "alpha beta" }],
        showNote: () => ({ key: "daily", title: "Daily", description: "", relativePath: "note/daily.md", body: "alpha beta" }),
        searchNotes: () => [],
      })
      controller.focusManagerItem(1)
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      assert.equal(controller.openFocusedManagerItem().blocked, false)
      controller.openEditorFind()
      const editorRoot = renderEditorScreen({ renderer, controller })
      assert.deepEqual(chunkTextsForId(editorRoot, "bluenote-editor-find-hints"), ["0/0 matches", "  ", "[Enter]", " Next", "  ", "[Shift+Enter]", " Previous", "  ", "[Esc]", " Close"])

      controller.showManager()
      controller.openManagerFilter()
      let managerRoot = renderManagerScreen({ renderer, controller })
      const filterText = descendants(managerRoot).map(textFor).join("\n")
      assert.match(filterText, /Narrow the current folder without leaving the dashboard\./u)
      assert.match(filterText, /Scope: note\b/u)
      assert.match(filterText, /Filter:/u)
      assert.deepEqual(chunkTextsForId(managerRoot, "bluenote-manager-filter-hints"), ["[Esc]", " Close", "  ", "[Enter]", " Open"])

      controller.openManagerCreate()
      controller.updateManagerCreateTitle("Draft")
      managerRoot = renderManagerScreen({ renderer, controller })
      assert.deepEqual(chunkTextsForId(managerRoot, "bluenote-manager-create-hints"), ["[Enter]", " Create", "  ", "[Tab]", " Folder", "  ", "[Esc]", " Cancel"])

      controller.cancelManagerCreate()
      controller.openManagerDeleteConfirmation()
      managerRoot = renderManagerScreen({ renderer, controller })
      assert.deepEqual(chunkTextsForId(managerRoot, "bluenote-manager-delete-hints"), ["[y]", " Delete", "  ", "[Esc]", " Cancel"])
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
        relativePath: "note/inbox/daily-plan.md",
        filename: "daily-plan.md",
        description: "Today priorities.",
        body: "Today priorities.",
        matchedFields: ["title"],
        label: "Daily Plan",
        detail: "note/inbox/daily-plan.md",
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
      assert.deepEqual(thresholdPreview.sections, [])
      assert.deepEqual(thresholdPreview.lines, ["Today priorities."])
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
          relativePath: "note/inbox/daily-plan.md",
          filename: "daily-plan.md",
          description: "Today priorities.",
          matchedFields: ["title"],
          label: "Daily Plan",
          detail: "note/inbox/daily-plan.md",
          score: 10,
        },
      ],
    )

    assert.deepEqual(vm.input, {
      id: "bluenote-search-query",
      value: "ship",
      placeholder: "Search notes, content, folders, or /commands",
      focused: true,
      styleIntent: "borderFocus",
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
        listNoteFolders: () => ["note"],
        showNote: () => ({ ...baseState.editor!.note }),
        searchNotes: () => [],
      })
      controller.focusManagerItem(1)
      controller.openFocusedManagerItem()
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
        listNotes: () => [{ key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "note/root-note.md", body: "# Root Note\n\nPreview body." }],
        showNote: () => ({ key: "root-note", title: "Root Note", description: "A top-level note.", relativePath: "note/root-note.md", body: "# Root Note\n\nPreview body." }),
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
      assert.deepEqual(widePreviewText.slice(0, 5), ["Root Note", "", "# Root Note", "", "Preview body."])
      assert.equal(widePreviewText.includes("Preview"), false)
      assert.doesNotMatch(widePreviewText.join("\n"), /Path|Description|notes\/root-note\.md|A top-level note\./u)
      assert.equal(renderedRowText.startsWith("Root Note"), true)
      assert.doesNotMatch(renderedRowText, /^[\s›●📁📄]/u)
      assert.doesNotMatch(renderedRowText, /[›●]/u)
      assert.deepEqual(renderedRowSegments.slice(0, 1), ["Root Note".padEnd(24)])

      const wideRootChildren = wideScreen.getChildren()
      const footerHintIndex = wideRootChildren.findIndex((node) => node.id === "bluenote-manager-footer-hints")
      const statusRowIndex = wideRootChildren.findIndex((node) => node.id === "bluenote-manager-footer-status-row")
      const statusRow = wideRootChildren[statusRowIndex] as { getChildren?: () => Renderable[] } | undefined
      const statusRowChildren = statusRow?.getChildren?.() ?? []
      const aiStatusIndex = statusRowChildren.findIndex((node) => node.id === "bluenote-manager-ai-status")
      assert.equal(statusRowIndex, footerHintIndex - 1)
      assert.equal(statusRowIndex, wideRootChildren.length - 2)
      assert.equal(statusRowChildren.some((node) => node.id === "bluenote-manager-current-open"), true)
      const aiStatusNode = statusRowChildren[aiStatusIndex] as any
      assert.match(aiStatusNode?.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? aiStatusNode?.content, /AI: not configured$/u)
      assert.equal(aiStatusNode?.flexShrink ?? aiStatusNode?._flexShrink, 1)

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
      assert.doesNotMatch(narrowText, /root-note\.md/u)
      assert.match(narrowText, /Root Note/u)
      assert.doesNotMatch(narrowText, /notes\/root-note\.md/u)
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
            relativePath: "note/inbox/daily-plan.md",
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

  test("Search Everything renderer keeps stable title chrome while typing and preserves footer hints", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    const textForNode = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
    const renderSearch = (query: string) => {
      const controller = createWorkspaceController({
        listNotes: () => [
          {
            key: "daily-plan",
            title: "Daily Plan",
            description: "Today priorities.",
            relativePath: "note/inbox/daily-plan.md",
            body: "Ship renderer screens.",
          },
        ],
        showNote: () => ({ ...baseState.editor!.note }),
        searchNotes: () => [],
      })
      controller.openSearch(query)
      const root = renderSearchEverythingScreen({ renderer, controller })
      const nodes = descendants(root)
      const inputRegion = nodes.find((node) => node.id === "bluenote-search-input-region") as { title?: string } | undefined
      const input = nodes.find((node) => node.id === "bluenote-search-query") as InputRenderable | undefined
      const footer = nodes.find((node) => node.id === "bluenote-search-footer-hints")
      const textRows = nodes.map(textForNode).filter((text) => text.length > 0)
      return { root, nodes, inputRegion, input, footer, textRows, resultCount: controller.getSearchResults().length }
    }

    try {
      const empty = renderSearch("")
      const typed = renderSearch("daily")
      const typedText = typed.textRows.join("\n")

      assert.equal(empty.inputRegion?.title, "Search Everything")
      assert.equal(typed.inputRegion?.title, "Search Everything")
      assert.equal(typed.input?.value, "daily")
      assert.equal(typed.footer ? textForNode(typed.footer) : "", "[Enter] Open/run  [↑/↓] Select  [Esc] Manager  [Ctrl+P] Close")

      assert.equal(typed.textRows.filter((text) => text === "Search Everything").length, 0, "title belongs to input panel chrome, not a standalone text row")
      assert.equal(typed.nodes.filter((node) => textForNode(node) === "Search Everything" && node.id !== "bluenote-search-input-region").length, 0)
      assert.doesNotMatch(typedText, /Search · daily|Search · type to begin/u)
      assert.equal((typed.nodes.find((node) => node.id === "bluenote-search-results-region") as any)?.title, `Results · ${typed.resultCount}`)
      assert.match(typedText, /Daily Plan/u)
      assert.notEqual(typedText, empty.textRows.join("\n"), "typing still updates input/results content")

      empty.root.destroyRecursively()
      typed.root.destroyRecursively()
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
            relativePath: "note/inbox/daily-plan.md",
            body: "Ship renderer screens.",
          },
        ],
        listNoteFolders: () => ["note", "note/inbox"],
        showNote: () => ({ ...baseState.editor!.note, relativePath: "note/inbox/daily-plan.md" }),
        searchNotes: () => [],
      })
      controller.openSearch("daily")

      const root = renderSearchEverythingScreen({ renderer, controller })
      const nodes = descendants(root)
      const textForNode = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
      const text = nodes.map(textForNode).join("\n")
      const resultsRegion = nodes.find((node) => node.id === "bluenote-search-results-region") as { getChildren: () => Renderable[] } | undefined
      const previewRegion = nodes.find((node) => node.id === "bluenote-search-preview-region") as { getChildren: () => Renderable[] } | undefined
      const resultText = resultsRegion?.getChildren().map(textForNode).join("\n") ?? ""
      const previewLines = previewRegion?.getChildren().map(textForNode) ?? []

      assert.equal((root as any).border, false)
      assert.equal((root as any).title ?? "", "")
      assert.notEqual(nodes.find((node) => node.id === "bluenote-search-input-region"), undefined)
      assert.notEqual(resultsRegion, undefined)
      assert.notEqual(previewRegion, undefined)
      assert.equal((nodes.find((node) => node.id === "bluenote-search-input-region") as any)?.title, "Search Everything")
      assert.equal((resultsRegion as any)?.title, `Results · ${controller.getSearchResults().length}`)
      assert.equal(resultsRegion?.getChildren().map(textForNode).filter((row) => /^Results · \d+$/u.test(row)).length, 0)
      assert.doesNotMatch(text, /Search · daily/u)
      assert.match(resultText, /› \[note\] Daily Plan —/u)
      assert.doesNotMatch(resultText, /undefined/u)
      assert.deepEqual(previewLines.slice(0, 2), ["note/inbox/daily-plan.md", "Ship renderer screens."])
      assert.match(text, /Ship renderer screens\./u)
      const previewTitle = previewRegion?.getChildren()[0] as any
      assert.deepEqual(previewTitle?.content?.chunks?.map((chunk: { text?: string }) => chunk.text), ["note/inbox/", "daily", "-plan.md"])
      assert.deepEqual(Array.from(previewTitle?.content?.chunks?.[1]?.bg.buffer ?? []), colorInts(tuiTheme.focusedRow))
      assert.doesNotMatch(text, /Preview ·|Summary|Excerpt|Items|Availability/u)
      controller.openSearch("/archive")
      const statusRoot = renderSearchEverythingScreen({ renderer, controller })
      const textFor = (node: any) => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content
      const renderedStatusText = descendants(statusRoot).map((node: any) => textFor(node) ?? "").join("\n")
      const statusInputRegion = descendants(statusRoot).find((node: any) => node.id === "bluenote-search-input-region") as any
      assert.equal(statusInputRegion?.title, "Search Everything")
      assert.match(renderedStatusText, /\[Esc\] Manager/u)
      assert.doesNotMatch(renderedStatusText, /Search Everything · Esc/u)
      assert.doesNotMatch(renderedStatusText, /Command unavailable|\/archive/u)

      controller.cancelSearch()
      controller.focusManagerItem(1)
      controller.openFocusedManagerItem()
      controller.openSearch("/new")
      const dangerRoot = renderSearchEverythingScreen({ renderer, controller })
      const commandRow = descendants(dangerRoot).find((node) => node.id === "bluenote-search-result-row-0") as any
      const commandChunks = commandRow?.content?.chunks ?? []
      assert.deepEqual(commandChunks.map((chunk: { text?: string }) => chunk.text), [
        "› [",
        "cmd",
        "] ",
        "/new",
        " — ",
        "Create a new folder in the current note folder",
      ])
      assert.deepEqual(Array.from(commandChunks[1].fg.buffer), colorInts(tuiTheme.info))
      dangerRoot.destroyRecursively()
      root.destroyRecursively()
      statusRoot.destroyRecursively()
    } finally {
      renderer.destroy()
    }
  })

  test("Search Everything renderer respects result viewport height and keeps preview/footer siblings", async () => {
    const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })
    try {
      const notes = Array.from({ length: 14 }, (_, index) => ({
        key: `daily-${index}`,
        title: `Daily ${index}`,
        description: `Daily ${index} body`,
        relativePath: `note/daily-${index}.md`,
        body: `Daily ${index} body`,
      }))
      const controller = createWorkspaceController({
        listNotes: () => notes,
        showNote: (selector) => notes.find((note) => note.key === selector || note.relativePath === selector) ?? notes[0]!,
        searchNotes: () => [],
      })
      controller.openSearch("daily")
      controller.focusSearchResult(9)

      const root = renderSearchEverythingScreen({ renderer, controller, height: 20 })
      const nodes = descendants(root)
      const textForNode = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
      const resultsRegion = nodes.find((node) => node.id === "bluenote-search-results-region") as { getChildren: () => Renderable[] } | undefined
      const resultText = resultsRegion?.getChildren().map(textForNode).join("\n") ?? ""

      assert.equal(nodes.some((node) => node.id === "bluenote-search-preview-region"), true)
      assert.equal(nodes.some((node) => node.id === "bluenote-search-footer-hints"), true)
      assert.equal(resultsRegion?.getChildren().filter((node) => node.id.startsWith("bluenote-search-result-row-")).length, 4)
      assert.match(resultText, /6 more above/u)
      assert.match(resultText, /4 more below/u)
      assert.match(resultText, /› \[note\] Daily 9 —/u)
      assert.doesNotMatch(resultText, /Daily 0 —|Daily 13 —/u)
      root.destroyRecursively()
    } finally {
      renderer.destroy()
    }
  })

  test("Search Everything preview text rendering normalizes malformed highlight ranges", () => {
    const text = "abcdef"
    const rendered = renderPreviewText({
      text,
      highlights: [
        { start: 4, end: 2 },
        { start: -5, end: 2 },
        { start: 1, end: 4 },
        { start: 3, end: 99 },
      ],
    }, "mutedText")

    const chunks = typeof rendered === "string" ? [{ text: rendered }] : rendered.chunks
    assert.equal(chunks.map((chunk: { text?: string }) => chunk.text ?? "").join(""), text)
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
            relativePath: "note/inbox/daily-plan.md",
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
      const textForNode = (node: any): string => node.content?.chunks?.map?.((chunk: { text?: string }) => chunk.text ?? "").join("") ?? node.content ?? ""
      const text = nodes.map(textForNode).join("\n")

      assert.equal(nodes.some((node) => node.id === "bluenote-search-preview-region"), false)
      assert.match(text, /Preview hidden · Alt\+P preview show/u)
      assert.match(text, /\[note\] Daily Plan/u)
      assert.doesNotMatch(text, /Stale preview should not show|Hidden preview body|Metadata|Description/u)
    } finally {
      renderer.destroy()
    }
  })
})
