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

export const SEARCH_PREVIEW_MIN_HEIGHT = 20

export type SearchEverythingPreviewHiddenReason = "manual" | "short-height"

export interface SearchEverythingVisiblePreviewViewModel extends SearchEverythingPreview {
  visible: true
  hiddenReason: null
  hiddenStatus: null
  styleIntent: TuiColorIntent
}

export interface SearchEverythingHiddenPreviewViewModel {
  visible: false
  hiddenReason: SearchEverythingPreviewHiddenReason
  hiddenStatus: string
  styleIntent: TuiColorIntent
}

export type SearchEverythingPreviewViewModel = SearchEverythingVisiblePreviewViewModel | SearchEverythingHiddenPreviewViewModel

export interface SearchEverythingResultRowViewModel {
  id: string
  kind: SearchEverythingResult["kind"]
  typeLabel: string
  typeIcon: string
  label: string
  primaryLabel: string
  detail: string
  selected: boolean
  focusMarker: "›" | " "
  selectedMarker: "›" | " "
  styleIntent: TuiColorIntent
  typeStyleIntent: TuiColorIntent
  primaryStyleIntent: TuiColorIntent
  detailStyleIntent: TuiColorIntent
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
  status: string | null
}

export interface SearchEverythingViewModelOptions {
  height?: number
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
  options: SearchEverythingViewModelOptions = {},
): SearchEverythingViewModel {
  const query = state.search?.query ?? ""
  const previousScreen = state.search?.previousScreen ?? "manager"
  const selectedIndex = clampIndex(state.search?.selectedIndex ?? 0, results.length)
  const styleIntents: SearchEverythingStyleIntents = {
    panel: "panel",
    input: "primaryAccent",
    result: "panel",
    selectedResult: "activeItem",
    preview: "panel",
  }
  const previewHiddenReason: SearchEverythingPreviewHiddenReason | null = state.search?.previewVisible === false
    ? "manual"
    : typeof options.height === "number" && options.height < SEARCH_PREVIEW_MIN_HEIGHT
      ? "short-height"
      : null
  const previewVisible = previewHiddenReason === null
  const preview = previewVisible ? buildHighlightedSearchEverythingPreview(results, selectedIndex) : null
  const previewRegion: SearchEverythingRegionViewModel = {
    id: "preview",
    renderableId: "bluenote-search-preview-region",
    kind: "preview",
    styleIntent: styleIntents.preview,
  }

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
      ...(previewVisible ? [previewRegion] : []),
    ],
    results: results.map((result, index) => {
      const selected = index === selectedIndex
      return {
        id: result.id,
        kind: result.kind,
        typeLabel: result.typeLabel ?? result.kind,
        typeIcon: result.typeIcon ?? result.kind,
        label: result.label,
        primaryLabel: result.label,
        detail: result.detail,
        selected,
        focusMarker: selected ? "›" : " ",
        selectedMarker: selected ? "›" : " ",
        styleIntent: selected ? "focusedRow" : styleIntents.result,
        typeStyleIntent: selected ? styleIntents.selectedResult : "mutedText",
        primaryStyleIntent: selected ? styleIntents.selectedResult : "primaryAccent",
        detailStyleIntent: selected ? styleIntents.selectedResult : "mutedText",
      }
    }),
    preview: previewVisible
      ? (preview ? { ...preview, visible: true, hiddenReason: null, hiddenStatus: null, styleIntent: styleIntents.preview } : null)
      : {
        visible: false,
        hiddenReason: previewHiddenReason,
        hiddenStatus: previewHiddenReason === "manual" ? "Preview hidden · Alt+P preview show" : "Preview hidden for short terminal · Alt+P preview show",
        styleIntent: "mutedText",
      },
    shortcuts: ["type search", "↑/↓ select", "Enter open/run", "Alt+P preview hide/show", `Esc ${previousScreen}`],
    status: state.search?.status ?? null,
  }
}

export interface RenderSearchEverythingScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onInvalidate?: () => void
  height?: number
}

export function renderSearchEverythingScreen(options: RenderSearchEverythingScreenOptions): BoxRenderable {
  const vm = buildSearchEverythingViewModel(options.controller.getState(), options.controller.getSearchResults(), { height: options.height })
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-search-everything-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: false,
    backgroundColor: tuiTheme.background,
    title: "",
  })
  root.add(new TextRenderable(options.renderer, { content: `Search Everything · Esc ${vm.previousScreen}`, height: 1, fg: tuiTheme.primaryAccent, bg: tuiTheme.background }))
  if (vm.status) {
    root.add(new TextRenderable(options.renderer, { content: vm.status, height: 1, fg: tuiTheme.secondaryAccent, bg: tuiTheme.background }))
  }

  const inputRegion = new BoxRenderable(options.renderer, {
    id: "bluenote-search-input-region",
    flexDirection: "column",
    width: "100%",
    height: 4,
    border: true,
    borderColor: tuiTheme[vm.styleIntents.input],
    backgroundColor: tuiTheme.panel,
    title: `Search · ${vm.query || "type to begin"}`,
  })
  const resultsRegion = new BoxRenderable(options.renderer, {
    id: "bluenote-search-results-region",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    border: true,
    borderColor: tuiTheme[vm.styleIntents.result],
    backgroundColor: tuiTheme.panel,
    title: `Results · ${vm.results.length}`,
  })
  const previewRegion = vm.regions.some((region) => region.id === "preview")
    ? new BoxRenderable(options.renderer, {
      id: "bluenote-search-preview-region",
      flexDirection: "column",
      width: "100%",
      height: "30%",
      border: true,
      borderColor: tuiTheme[vm.styleIntents.preview],
      backgroundColor: tuiTheme.panel,
      title: "Preview",
    })
    : null

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

  inputRegion.add(new TextRenderable(options.renderer, { content: `Search · ${vm.query || "type to begin"}`, height: 1, fg: tuiTheme.secondaryAccent, bg: tuiTheme.panel }))
  inputRegion.add(input)
  resultsRegion.add(new TextRenderable(options.renderer, { content: `Results · ${vm.results.length}`, height: 1, fg: tuiTheme.secondaryAccent, bg: tuiTheme.panel }))
  for (const row of vm.results) {
    resultsRegion.add(
      new TextRenderable(options.renderer, {
        content: `${row.focusMarker} [${row.typeLabel}] ${row.primaryLabel} — ${row.detail}`,
        height: 1,
        fg: tuiTheme[row.selected ? row.primaryStyleIntent : "primaryAccent"],
        bg: tuiTheme[row.selected ? "focusedRow" : "panel"],
      }),
    )
  }
  if (vm.results.length === 0) {
    resultsRegion.add(new TextRenderable(options.renderer, { content: "No results", height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
  }

  if (vm.preview?.visible && previewRegion) {
    previewRegion.add(new TextRenderable(options.renderer, { content: `Preview · ${vm.preview.title}`, height: 1, fg: tuiTheme.secondaryAccent, bg: tuiTheme.panel }))
    previewRegion.add(new TextRenderable(options.renderer, { content: vm.preview.subtitle, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
    for (const section of vm.preview.sections) {
      previewRegion.add(new TextRenderable(options.renderer, { content: section.label, height: 1, fg: tuiTheme.primaryAccent, bg: tuiTheme.panel }))
      for (const line of section.lines) {
        previewRegion.add(new TextRenderable(options.renderer, { content: line, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
      }
    }
  }
  root.add(inputRegion)
  root.add(resultsRegion)
  if (previewRegion) {
    root.add(previewRegion)
  } else if (vm.preview && !vm.preview.visible) {
    root.add(new TextRenderable(options.renderer, { content: vm.preview.hiddenStatus, height: 1, fg: tuiTheme[vm.preview.styleIntent], bg: tuiTheme.panel }))
  }
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
