import { describe, test } from "bun:test"
import assert from "node:assert/strict"

import { routeWorkspaceKey } from "../../../src/tui/app"
import { routeEditorKey } from "../../../src/tui/render-editor"
import { routeSearchEverythingKey } from "../../../src/tui/render-search-everything"
import type { TuiState } from "../../../src/tui/state"
import type { WorkspaceController } from "../../../src/tui/workspace-controller"

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
    openSearch: (query) => {
      calls.push(`openSearch:${query ?? ""}`)
      state.screen = "search"
      state.search = { query: query ?? "", selectedIndex: 0, previousScreen: screen === "search" ? "editor" : screen }
    },
    updateSearchQuery: (query) => calls.push(`updateSearchQuery:${query}`),
    focusSearchResult: (index) => calls.push(`focusSearchResult:${index}`),
    cancelSearch: () => calls.push("cancelSearch"),
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

  test("workspace route opens Search Everything with Ctrl+P but leaves slash to editor textarea", () => {
    const { controller, calls } = createController("editor")

    assert.deepEqual(routeWorkspaceKey("/", controller, () => {}), { handled: false })
    assert.deepEqual(routeWorkspaceKey("\u0010", controller, () => {}), { handled: true })
    assert.deepEqual(calls, ["openSearch:"])
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

  test("search route does not consume printable query input", () => {
    const { controller, calls } = createController("search")

    assert.equal(routeSearchEverythingKey("a", controller), false)
    assert.equal(routeSearchEverythingKey("/", controller), false)
    assert.deepEqual(calls, [])
  })
})
