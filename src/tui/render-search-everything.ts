import { BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable, type CliRenderer } from "@opentui/core"

import {
  buildHighlightedSearchEverythingPreview,
  type SearchEverythingPreview,
  type SearchEverythingResult,
} from "./adapters/search-everything-adapter"
import type { TuiScreen, TuiState } from "./state"
import { tuiTheme, type TuiColorIntent } from "./theme"
import type { WorkspaceController } from "./workspace-controller"

export interface SearchEverythingStyleIntents {
  panel: TuiColorIntent
  input: TuiColorIntent
  result: TuiColorIntent
  selectedResult: TuiColorIntent
  preview: TuiColorIntent
}

export interface SearchEverythingPreviewViewModel extends SearchEverythingPreview {
  styleIntent: TuiColorIntent
}

export interface SearchEverythingResultRowViewModel {
  id: string
  kind: SearchEverythingResult["kind"]
  label: string
  detail: string
  selected: boolean
  focusMarker: "›" | " "
  styleIntent: TuiColorIntent
}

export interface SearchEverythingInputViewModel {
  id: "bluenote-search-query"
  value: string
  placeholder: string
  focused: true
  styleIntent: TuiColorIntent
}

export interface SearchEverythingRegionViewModel {
  id: "input" | "result-list" | "preview"
  renderableId: "bluenote-search-input-region" | "bluenote-search-results-region" | "bluenote-search-preview-region"
  kind: "input" | "results" | "preview"
  styleIntent: TuiColorIntent
}

export interface SearchEverythingViewModel {
  query: string
  previousScreen: Exclude<TuiScreen, "search">
  styleIntents: SearchEverythingStyleIntents
  input: SearchEverythingInputViewModel
  regions: SearchEverythingRegionViewModel[]
  results: SearchEverythingResultRowViewModel[]
  preview: SearchEverythingPreviewViewModel | null
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
  const styleIntents: SearchEverythingStyleIntents = {
    panel: "panel",
    input: "primaryAccent",
    result: "panel",
    selectedResult: "focusedRow",
    preview: "secondaryAccent",
  }
  const preview = buildHighlightedSearchEverythingPreview(results, selectedIndex)

  return {
    query,
    previousScreen,
    styleIntents,
    input: {
      id: "bluenote-search-query",
      value: query,
      placeholder: "Search notes, content, folders, or /commands",
      focused: true,
      styleIntent: styleIntents.input,
    },
    regions: [
      { id: "input", renderableId: "bluenote-search-input-region", kind: "input", styleIntent: styleIntents.input },
      { id: "result-list", renderableId: "bluenote-search-results-region", kind: "results", styleIntent: styleIntents.result },
      { id: "preview", renderableId: "bluenote-search-preview-region", kind: "preview", styleIntent: styleIntents.preview },
    ],
    results: results.map((result, index) => {
      const selected = index === selectedIndex
      return {
        id: result.id,
        kind: result.kind,
        label: result.label,
        detail: result.detail,
        selected,
        focusMarker: selected ? "›" : " ",
        styleIntent: selected ? styleIntents.selectedResult : styleIntents.result,
      }
    }),
    preview: preview ? { ...preview, styleIntent: styleIntents.preview } : null,
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
    borderColor: tuiTheme.primaryAccent,
    backgroundColor: tuiTheme.background,
    title: "Search Everything",
  })

  const inputRegion = new BoxRenderable(options.renderer, {
    id: "bluenote-search-input-region",
    flexDirection: "column",
    width: "100%",
    height: 3,
    border: true,
    borderColor: tuiTheme[vm.styleIntents.input],
    backgroundColor: tuiTheme.panel,
    title: "Input",
  })
  const resultsRegion = new BoxRenderable(options.renderer, {
    id: "bluenote-search-results-region",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    border: true,
    borderColor: tuiTheme[vm.styleIntents.result],
    backgroundColor: tuiTheme.panel,
    title: "Results",
  })
  const previewRegion = new BoxRenderable(options.renderer, {
    id: "bluenote-search-preview-region",
    flexDirection: "column",
    width: "100%",
    height: "30%",
    border: true,
    borderColor: tuiTheme[vm.styleIntents.preview],
    backgroundColor: tuiTheme.panel,
    title: "Preview",
  })

  const input = new InputRenderable(options.renderer, {
    id: vm.input.id,
    value: vm.input.value,
    placeholder: vm.input.placeholder,
    backgroundColor: tuiTheme.panel,
    focusedBackgroundColor: tuiTheme.focusedRow,
    textColor: tuiTheme.primaryAccent,
    focusedTextColor: tuiTheme.primaryAccent,
    placeholderColor: tuiTheme.mutedText,
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

  inputRegion.add(input)
  for (const row of vm.results) {
    resultsRegion.add(
      new TextRenderable(options.renderer, {
        content: `${row.focusMarker} [${row.kind}] ${row.label} — ${row.detail}`,
        height: 1,
        fg: tuiTheme[row.selected ? vm.styleIntents.selectedResult : row.styleIntent],
        bg: tuiTheme.panel,
      }),
    )
  }
  if (vm.preview) {
    previewRegion.add(new TextRenderable(options.renderer, { content: vm.preview.title, height: 1, fg: tuiTheme.primaryAccent, bg: tuiTheme.panel }))
    previewRegion.add(new TextRenderable(options.renderer, { content: vm.preview.subtitle, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
    for (const line of vm.preview.lines) {
      previewRegion.add(new TextRenderable(options.renderer, { content: line, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
    }
  } else {
    previewRegion.add(new TextRenderable(options.renderer, { content: "No preview", height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
  }
  root.add(inputRegion)
  root.add(resultsRegion)
  root.add(previewRegion)
  root.add(new TextRenderable(options.renderer, { content: vm.shortcuts.join("  "), height: 1, fg: tuiTheme.secondaryAccent, bg: tuiTheme.panel }))
  input.focus()

  return root
}

export function routeSearchEverythingKey(sequence: string, controller: WorkspaceController): boolean {
  const state = controller.getState()
  const selectedIndex = state.search?.selectedIndex ?? 0

  switch (sequence) {
    case "\u001b":
    case "\u001b[":
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
    case "\u007f":
    case "\b":
      controller.updateSearchQuery((state.search?.query ?? "").slice(0, -1))
      return true
    default:
      if (isPrintableSearchInput(sequence)) {
        controller.updateSearchQuery(`${state.search?.query ?? ""}${sequence}`)
        return true
      }
      return false
  }
}

function isPrintableSearchInput(sequence: string): boolean {
  return sequence.length > 0 && !sequence.startsWith("\u001b") && Array.from(sequence).every((character) => {
    const codepoint = character.codePointAt(0) ?? 0
    return codepoint >= 32 && codepoint !== 127
  })
}
