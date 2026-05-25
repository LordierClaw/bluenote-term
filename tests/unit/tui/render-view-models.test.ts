import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import { buildEditorViewModel } from "../../../src/tui/render-editor"
import { buildManagerViewModel } from "../../../src/tui/render-manager"
import { buildSearchEverythingViewModel } from "../../../src/tui/render-search-everything"
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
  })

  test("editor view model includes only topbar, editor body metadata, and bottombar data", () => {
    const vm = buildEditorViewModel({ ...baseState, screen: "editor" })

    assert.deepEqual(Object.keys(vm).sort(), ["body", "bottombar", "topbar"])
    assert.deepEqual(vm.topbar, {
      title: "Daily Plan",
      path: "notes/inbox/daily-plan.md",
      filename: "daily-plan.md",
      key: "daily-plan",
      dirty: false,
      status: "saved",
    })
    assert.deepEqual(vm.body, {
      value: "# Daily Plan\n\nShip renderer screens.",
      lineCount: 3,
      characterCount: 36,
      placeholder: "Write your note…",
    })
    assert.deepEqual(vm.bottombar.hints, ["Ctrl+S save", "Ctrl+F find", "Ctrl+P search", "Esc manager", "Ctrl+C quit"])
    assert.equal(vm.bottombar.status, "Line 1, Col 1 · saved")
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
    assert.deepEqual(vm.shortcuts, ["type search", "↑/↓ select", "Enter open/run", "Esc editor"])
    assert.deepEqual(
      vm.results.map((row) => ({ marker: row.focusMarker, kind: row.kind, label: row.label, detail: row.detail, selected: row.selected })),
      [
        { marker: " ", kind: "content", label: "Daily Plan", detail: "body — notes/inbox/daily-plan.md", selected: false },
        { marker: "›", kind: "command", label: "/replace", detail: "Find and replace text in the active editor buffer", selected: true },
      ],
    )
    assert.deepEqual(vm.preview, {
      title: "/replace",
      subtitle: "Find and replace text in the active editor buffer",
      lines: ["Usage: /replace <query> <replacement>", "Shortcut: Ctrl+H"],
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
