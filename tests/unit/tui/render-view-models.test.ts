import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import { buildEditorViewModel } from "../../../src/tui/render-editor"
import { buildManagerViewModel } from "../../../src/tui/render-manager"
import { buildSearchEverythingViewModel } from "../../../src/tui/render-search-everything"
import { tuiTheme } from "../../../src/tui/theme"
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

describe("TUI render view models", () => {
  test("semantic TUI theme exposes required color tokens", () => {
    assert.deepEqual(Object.keys(tuiTheme).sort(), [
      "background",
      "danger",
      "focusedRow",
      "mutedText",
      "panel",
      "primaryAccent",
      "secondaryAccent",
      "selectedOpenNote",
      "success",
      "warning",
    ])
    for (const color of Object.values(tuiTheme)) {
      assert.match(color, /^#[0-9a-f]{6}$/iu)
    }
  })

  test("manager view model includes rows with filename/key, title, description, focus marker, and shortcut/status hints", () => {
    const vm = buildManagerViewModel(baseState)

    assert.equal(vm.title, "BlueNote Manager")
    assert.equal(vm.status, "2 items · selected daily-plan")
    assert.deepEqual(vm.shortcuts, ["↑/↓ move", "Enter/o open", "s search", "e editor", "q quit"])
    assert.deepEqual(
      vm.rows.map((row) => ({ marker: row.focusMarker, key: row.key, filename: row.filename, title: row.title, description: row.description, focused: row.focused })),
      [
        { marker: " ", key: "notes/inbox", filename: "inbox/", title: "inbox", description: "2 notes", focused: false },
        { marker: "›", key: "daily-plan", filename: "daily-plan.md", title: "Daily Plan", description: "Today priorities.", focused: true },
      ],
    )
    assert.deepEqual(
      vm.rows.map((row) => ({ key: row.key, styleIntent: row.styleIntent, itemStyleIntent: row.itemStyleIntent, openStyleIntent: row.openStyleIntent, metadataStyleIntent: row.metadataStyleIntent })),
      [
        { key: "notes/inbox", styleIntent: "panel", itemStyleIntent: "secondaryAccent", openStyleIntent: null, metadataStyleIntent: "mutedText" },
        { key: "daily-plan", styleIntent: "focusedRow", itemStyleIntent: "primaryAccent", openStyleIntent: "selectedOpenNote", metadataStyleIntent: "mutedText" },
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
        { key: "note-b", styleIntent: "panel", openStyleIntent: "selectedOpenNote" },
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

  test("editor view model includes only topbar, editor body metadata, and bottombar data", () => {
    const vm = buildEditorViewModel({ ...baseState, screen: "editor" })

    assert.deepEqual(Object.keys(vm).sort(), ["body", "bottombar", "find", "topbar"])
    assert.deepEqual(vm.topbar, {
      title: "Daily Plan",
      path: "notes/inbox/daily-plan.md",
      filename: "daily-plan.md",
      key: "daily-plan",
      dirty: false,
      status: "saved",
      statusIntent: "success",
    })
    assert.deepEqual(vm.body, {
      value: "# Daily Plan\n\nShip renderer screens.",
      lineCount: 3,
      characterCount: 36,
      placeholder: "Write your note…",
      focused: true,
    })
    assert.equal(vm.find, null)
    assert.deepEqual(vm.bottombar.hints, ["Ctrl+S save", "Ctrl+F find", "Ctrl+P search", "Esc manager", "Ctrl+C quit"])
    assert.equal(vm.bottombar.status, "Line 1, Col 1 · saved")
    assert.equal(vm.bottombar.statusIntent, "success")

    const dirtyVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, dirty: true, body: `${baseState.editor!.body}\nunsaved` } })
    assert.equal(dirtyVm.topbar.statusIntent, "warning")
    assert.equal(dirtyVm.bottombar.statusIntent, "warning")

    const autosaveVm = buildEditorViewModel({ ...baseState, screen: "editor", editor: { ...baseState.editor!, autosaveStatus: "saving" } as TuiState["editor"] })
    assert.equal(autosaveVm.topbar.statusIntent, "warning")
    assert.equal(autosaveVm.bottombar.statusIntent, "warning")
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
      selectedResult: "focusedRow",
      preview: "secondaryAccent",
    })
    assert.deepEqual(vm.shortcuts, ["type search", "↑/↓ select", "Enter open/run", "Esc editor"])
    assert.deepEqual(
      vm.results.map((row) => ({ marker: row.focusMarker, kind: row.kind, label: row.label, detail: row.detail, selected: row.selected })),
      [
        { marker: " ", kind: "content", label: "Daily Plan", detail: "body — notes/inbox/daily-plan.md", selected: false },
        { marker: "›", kind: "command", label: "/replace", detail: "Find and replace text in the active editor buffer", selected: true },
      ],
    )
    assert.deepEqual(vm.results.map((row) => row.styleIntent), ["panel", "focusedRow"])
    assert.deepEqual(vm.preview, {
      title: "/replace",
      subtitle: "Find and replace text in the active editor buffer",
      lines: ["Usage: /replace <query> <replacement>", "Shortcut: Ctrl+H"],
      styleIntent: "secondaryAccent",
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
})
