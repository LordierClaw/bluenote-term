import { BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable, type CliRenderer } from "@opentui/core"

import {
  buildHighlightedSearchEverythingPreview,
  type SearchEverythingPreview,
  type SearchEverythingResult,
} from "./adapters/search-everything-adapter"
import type { TuiScreen, TuiState } from "./state"
import type { WorkspaceController } from "./workspace-controller"

export interface SearchEverythingResultRowViewModel {
  id: string
  kind: SearchEverythingResult["kind"]
  label: string
  detail: string
  selected: boolean
  focusMarker: "›" | " "
}

export interface SearchEverythingViewModel {
  query: string
  previousScreen: Exclude<TuiScreen, "search">
  results: SearchEverythingResultRowViewModel[]
  preview: SearchEverythingPreview | null
  shortcuts: string[]
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0
  }

  return Math.max(0, Math.min(Math.trunc(index), length - 1))
}

export function buildSearchEverythingViewModel(
  state: TuiState,
  results: readonly SearchEverythingResult[],
): SearchEverythingViewModel {
  const query = state.search?.query ?? ""
  const previousScreen = state.search?.previousScreen ?? "manager"
  const selectedIndex = clampIndex(state.search?.selectedIndex ?? 0, results.length)

  return {
    query,
    previousScreen,
    results: results.map((result, index) => {
      const selected = index === selectedIndex
      return {
        id: result.id,
        kind: result.kind,
        label: result.label,
        detail: result.detail,
        selected,
        focusMarker: selected ? "›" : " ",
      }
    }),
    preview: buildHighlightedSearchEverythingPreview(results, selectedIndex),
    shortcuts: ["type search", "↑/↓ select", "Enter open/run", `Esc ${previousScreen}`],
  }
}

export interface RenderSearchEverythingScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onInvalidate?: () => void
}

export function renderSearchEverythingScreen(options: RenderSearchEverythingScreenOptions): BoxRenderable {
  const vm = buildSearchEverythingViewModel(options.controller.getState(), options.controller.getSearchResults())
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-search-everything-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: true,
    title: "Search Everything",
  })

  const input = new InputRenderable(options.renderer, {
    id: "bluenote-search-query",
    value: vm.query,
    placeholder: "Search notes, content, folders, or /commands",
  })
  input.on(InputRenderableEvents.INPUT, () => {
    options.controller.updateSearchQuery(input.value)
    options.onInvalidate?.()
  })
  input.on(InputRenderableEvents.CHANGE, () => {
    options.controller.updateSearchQuery(input.value)
    options.onInvalidate?.()
  })
  input.on(InputRenderableEvents.ENTER, () => {
    options.controller.selectSearchResult()
    options.onInvalidate?.()
  })

  root.add(input)
  for (const row of vm.results) {
    root.add(
      new TextRenderable(options.renderer, {
        content: `${row.focusMarker} [${row.kind}] ${row.label} — ${row.detail}`,
        height: 1,
      }),
    )
  }
  if (vm.preview) {
    root.add(new TextRenderable(options.renderer, { content: vm.preview.title, height: 1 }))
    root.add(new TextRenderable(options.renderer, { content: vm.preview.subtitle, height: 1 }))
    for (const line of vm.preview.lines) {
      root.add(new TextRenderable(options.renderer, { content: line, height: 1 }))
    }
  }
  root.add(new TextRenderable(options.renderer, { content: vm.shortcuts.join("  "), height: 1 }))
  input.focus()

  return root
}

export function routeSearchEverythingKey(sequence: string, controller: WorkspaceController): boolean {
  const state = controller.getState()
  const selectedIndex = state.search?.selectedIndex ?? 0

  switch (sequence) {
    case "\u001b":
      controller.cancelSearch()
      return true
    case "\u001b[A":
      controller.focusSearchResult(selectedIndex - 1)
      return true
    case "\u001b[B":
      controller.focusSearchResult(selectedIndex + 1)
      return true
    case "\r":
    case "\n":
      controller.selectSearchResult()
      return true
    default:
      return false
  }
}
