import { BoxRenderable, InputRenderable, InputRenderableEvents, StyledText, TextRenderable, bg, fg, type CliRenderer, type TextChunk } from "@opentui/core"

import {
  buildHighlightedSearchEverythingPreview,
  type SearchEverythingPreview,
  type SearchEverythingPreviewText,
  type SearchEverythingResult,
} from "./adapters/search-everything-adapter"
import { TUI_SHORTCUTS, renderShortcutHints, shortcutHintLabels, type ShortcutHint } from "./render-chrome"
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
  index: number
  id: string
  kind: SearchEverythingResult["kind"]
  typeLabel: string
  typeIcon: string
  tagLabel: string
  label: string
  primaryLabel: string
  detail: string
  riskLabel: "destructive" | "maintenance" | null
  availabilityLabel: "available" | "unavailable" | null
  selected: boolean
  focusMarker: "›" | " "
  selectedMarker: "›" | " "
  styleIntent: TuiColorIntent
  typeStyleIntent: TuiColorIntent
  primaryStyleIntent: TuiColorIntent
  detailStyleIntent: TuiColorIntent
  riskStyleIntent: TuiColorIntent | null
  availabilityStyleIntent: TuiColorIntent | null
}

export interface SearchEverythingEmptyStateViewModel {
  title: string
  examples: string[]
  recentActions: string[]
  commandSuggestions: string[]
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

export interface SearchEverythingResultViewportViewModel {
  startIndex: number
  endIndex: number
  visibleRowCount: number
  totalCount: number
  selectedIndex: number
  hasMoreAbove: boolean
  hasMoreBelow: boolean
  aboveLabel: string | null
  belowLabel: string | null
}

export interface SearchEverythingViewModel {
  query: string
  previousScreen: Exclude<TuiScreen, "search">
  styleIntents: SearchEverythingStyleIntents
  input: SearchEverythingInputViewModel
  regions: SearchEverythingRegionViewModel[]
  resultCount: number
  resultViewport: SearchEverythingResultViewportViewModel
  results: SearchEverythingResultRowViewModel[]
  emptyState: SearchEverythingEmptyStateViewModel | null
  preview: SearchEverythingPreviewViewModel | null
  shortcutHints: ShortcutHint[]
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

function resultViewportRowCapacity(height: number | undefined, previewVisible: boolean, statusVisible: boolean, resultCount: number): number {
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
    return Math.max(resultCount, 1)
  }

  const totalHeight = Math.max(1, Math.trunc(height))
  const inputHeight = 4
  const footerHeight = 1
  const statusHeight = statusVisible ? 1 : 0
  const hiddenPreviewStatusHeight = previewVisible ? 0 : 1
  const previewHeight = previewVisible ? Math.max(3, Math.floor(totalHeight * 0.3)) : 0
  const resultRegionHeight = Math.max(4, totalHeight - inputHeight - footerHeight - statusHeight - hiddenPreviewStatusHeight - previewHeight)
  return Math.max(1, resultRegionHeight - 5)
}

function buildSearchEverythingResultViewport(
  totalCount: number,
  selectedIndex: number,
  visibleRowCount: number,
  preferredOffset = 0,
): SearchEverythingResultViewportViewModel {
  const capacity = Math.max(1, Math.trunc(visibleRowCount))
  const selected = clampIndex(selectedIndex, totalCount)
  if (totalCount <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      visibleRowCount: capacity,
      totalCount,
      selectedIndex: selected,
      hasMoreAbove: false,
      hasMoreBelow: false,
      aboveLabel: null,
      belowLabel: null,
    }
  }

  let startIndex = Math.max(0, Math.min(Math.trunc(preferredOffset), Math.max(0, totalCount - capacity)))
  if (selected < startIndex) {
    startIndex = selected
  } else if (selected >= startIndex + capacity) {
    startIndex = selected - capacity + 1
  }
  startIndex = Math.max(0, Math.min(startIndex, Math.max(0, totalCount - capacity)))
  const endIndex = Math.min(totalCount, startIndex + capacity)
  const moreAbove = startIndex
  const moreBelow = Math.max(0, totalCount - endIndex)

  return {
    startIndex,
    endIndex,
    visibleRowCount: capacity,
    totalCount,
    selectedIndex: selected,
    hasMoreAbove: moreAbove > 0,
    hasMoreBelow: moreBelow > 0,
    aboveLabel: moreAbove > 0 ? `${moreAbove} more above` : null,
    belowLabel: moreBelow > 0 ? `${moreBelow} more below` : null,
  }
}

function searchShortcutHints(_query: string, previousScreen: Exclude<TuiScreen, "search">, resultCount: number): ShortcutHint[] {
  const backLabel = previousScreen === "editor" ? "Editor" : "Manager"
  if (resultCount === 0) {
    return [{ key: "Esc", action: backLabel, priority: "primary" }, { ...TUI_SHORTCUTS.globalSearch, action: "Close", priority: "primary" }]
  }

  return [
    { key: "Enter", action: "Open/run", priority: "primary" },
    { key: "↑/↓", action: "Select", priority: "primary" },
    { key: "Esc", action: backLabel, priority: "primary" },
    { ...TUI_SHORTCUTS.globalSearch, action: "Close", priority: "primary" },
  ]
}

function commandRiskLabel(result: SearchEverythingResult): SearchEverythingResultRowViewModel["riskLabel"] {
  if (result.kind !== "command") {
    return null
  }
  if (result.name === "/delete") {
    return "destructive"
  }
  return null
}

function commandAvailabilityLabel(_result: SearchEverythingResult): SearchEverythingResultRowViewModel["availabilityLabel"] {
  return null
}

function resultTagLabel(result: SearchEverythingResult, riskLabel: SearchEverythingResultRowViewModel["riskLabel"]): string {
  if (result.kind === "command") {
    if (riskLabel === "destructive") {
      return "danger"
    }
    if (riskLabel === "maintenance") {
      return "maint"
    }
    return "cmd"
  }
  if (result.kind === "content") {
    return "note"
  }
  return result.kind
}

function tagStyleIntent(result: SearchEverythingResult, riskLabel: SearchEverythingResultRowViewModel["riskLabel"], availabilityLabel: SearchEverythingResultRowViewModel["availabilityLabel"]): TuiColorIntent {
  if (riskLabel === "destructive") {
    return "danger"
  }
  if (riskLabel === "maintenance") {
    return "warning"
  }
  if (result.kind === "folder") {
    return "statusInfo"
  }
  return "info"
}

function buildSearchEverythingEmptyState(query: string, resultCount: number): SearchEverythingEmptyStateViewModel | null {
  if (resultCount > 0) {
    return null
  }
  return {
    title: query.trim().length === 0 ? "Search your local workspace" : "No matches yet",
    examples: ["daily plan", "notes/inbox", "/save"],
    recentActions: ["Open recent notes", "Jump to folders", "Run available commands"],
    commandSuggestions: ["/new", "/find", "/replace", "/save", "/delete"],
    styleIntent: "mutedText",
  }
}

function renderSearchResultRowText(row: SearchEverythingResultRowViewModel): StyledText {
  const tagChunks: TextChunk[] = [
    fg(tuiTheme[row.typeStyleIntent])(row.tagLabel) as TextChunk,
  ]
  if (row.riskLabel && row.riskStyleIntent) {
    tagChunks.push(fg(tuiTheme.mutedText)(" · ") as TextChunk)
    tagChunks.push(fg(tuiTheme[row.riskStyleIntent])(row.riskLabel) as TextChunk)
  }
  if (row.availabilityLabel && row.availabilityStyleIntent) {
    tagChunks.push(fg(tuiTheme.mutedText)(" · ") as TextChunk)
    tagChunks.push(fg(tuiTheme[row.availabilityStyleIntent])(row.availabilityLabel) as TextChunk)
  }

  return new StyledText([
    fg(tuiTheme.mutedText)(`${row.focusMarker} [`) as TextChunk,
    ...tagChunks,
    fg(tuiTheme.mutedText)("] ") as TextChunk,
    fg(tuiTheme[row.primaryStyleIntent])(row.primaryLabel) as TextChunk,
    fg(tuiTheme.mutedText)(" — ") as TextChunk,
    fg(tuiTheme[row.detailStyleIntent])(row.detail) as TextChunk,
  ])
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
    panel: "borderSubtle",
    input: "borderFocus",
    result: "borderSubtle",
    selectedResult: "activeItem",
    preview: "borderSubtle",
  }
  const previewHiddenReason: SearchEverythingPreviewHiddenReason | null = state.search?.previewVisible === false
    ? "manual"
    : typeof options.height === "number" && options.height < SEARCH_PREVIEW_MIN_HEIGHT
      ? "short-height"
      : null
  const previewVisible = previewHiddenReason === null
  const preview = previewVisible ? buildHighlightedSearchEverythingPreview(results, selectedIndex, query) : null
  const shortcutHints = searchShortcutHints(query, previousScreen, results.length)
  const resultViewport = buildSearchEverythingResultViewport(
    results.length,
    selectedIndex,
    resultViewportRowCapacity(options.height, previewVisible, Boolean(state.search?.status), results.length),
    state.search?.resultScrollOffset ?? 0,
  )
  const visibleResults = results.slice(resultViewport.startIndex, resultViewport.endIndex)
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
    resultCount: results.length,
    resultViewport,
    results: visibleResults.map((result, visibleIndex) => {
      const index = resultViewport.startIndex + visibleIndex
      const selected = index === selectedIndex
      const riskLabel = commandRiskLabel(result)
      const availabilityLabel = commandAvailabilityLabel(result)
      const riskStyleIntent = riskLabel === "destructive" ? "danger" : riskLabel === "maintenance" ? "warning" : null
      const availabilityStyleIntent = availabilityLabel === "available" ? "success" : availabilityLabel === "unavailable" ? "mutedText" : null
      return {
        index,
        id: result.id,
        kind: result.kind,
        typeLabel: result.typeLabel ?? result.kind,
        typeIcon: result.typeIcon ?? result.kind,
        tagLabel: resultTagLabel(result, riskLabel),
        label: result.label,
        primaryLabel: result.label,
        detail: result.detail,
        riskLabel,
        availabilityLabel,
        selected,
        focusMarker: selected ? "›" : " ",
        selectedMarker: selected ? "›" : " ",
        styleIntent: selected ? "focusedRow" : "panel",
        typeStyleIntent: tagStyleIntent(result, riskLabel, availabilityLabel),
        primaryStyleIntent: selected ? styleIntents.selectedResult : "textPrimary",
        detailStyleIntent: selected ? styleIntents.selectedResult : "mutedText",
        riskStyleIntent,
        availabilityStyleIntent,
      }
    }),
    emptyState: buildSearchEverythingEmptyState(query, results.length),
    preview: previewVisible
      ? (preview ? { ...preview, visible: true, hiddenReason: null, hiddenStatus: null, styleIntent: styleIntents.preview } : null)
      : {
        visible: false,
        hiddenReason: previewHiddenReason,
        hiddenStatus: previewHiddenReason === "manual" ? "Preview hidden · Alt+P preview show" : "Preview hidden for short terminal · Alt+P preview show",
        styleIntent: "mutedText",
      },
    shortcutHints,
    shortcuts: shortcutHintLabels(shortcutHints),
    status: state.search?.status ?? null,
  }
}

export interface RenderSearchEverythingScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onInvalidate?: () => void
  height?: number
}

function normalizePreviewHighlightRanges(value: SearchEverythingPreviewText): Array<{ start: number; end: number }> {
  const textLength = value.text.length
  const ranges = value.highlights ?? []
  const normalized = ranges
    .map((range) => {
      const rawStart = Number.isFinite(range.start) ? Math.trunc(range.start) : 0
      const rawEnd = Number.isFinite(range.end) ? Math.trunc(range.end) : 0
      const start = Math.max(0, Math.min(rawStart, textLength))
      const end = Math.max(0, Math.min(rawEnd, textLength))
      return { start, end }
    })
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start) || left.end - right.end)

  const nonOverlapping: Array<{ start: number; end: number }> = []
  for (const range of normalized) {
    const previous = nonOverlapping.at(-1)
    if (!previous || range.start >= previous.end) {
      nonOverlapping.push(range)
    }
  }

  return nonOverlapping
}

export function renderPreviewText(text: SearchEverythingPreviewText | string, intent: TuiColorIntent): StyledText | string {
  const value = typeof text === "string" ? { text } : text
  const ranges = normalizePreviewHighlightRanges(value)
  if (ranges.length === 0) {
    return value.text
  }

  const chunks: TextChunk[] = []
  let offset = 0
  for (const range of ranges) {
    if (range.start > offset) {
      chunks.push(fg(tuiTheme[intent])(value.text.slice(offset, range.start)) as TextChunk)
    }
    chunks.push(bg(tuiTheme.focusedRow)(fg(tuiTheme.textPrimary)(value.text.slice(range.start, range.end))) as TextChunk)
    offset = Math.max(offset, range.end)
  }
  if (offset < value.text.length) {
    chunks.push(fg(tuiTheme[intent])(value.text.slice(offset)) as TextChunk)
  }

  return new StyledText(chunks)
}

export function renderSearchEverythingScreen(options: RenderSearchEverythingScreenOptions): BoxRenderable {
  const vm = buildSearchEverythingViewModel(options.controller.getState(), options.controller.getSearchResults(), { height: options.height })
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-search-everything-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: false,
    title: "",
  })
  if (vm.status) {
    root.add(new TextRenderable(options.renderer, { content: vm.status, height: 1, fg: tuiTheme.statusInfo }))
  }

  const inputRegion = new BoxRenderable(options.renderer, {
    id: "bluenote-search-input-region",
    flexDirection: "column",
    width: "100%",
    height: 4,
    border: true,
    borderColor: tuiTheme[vm.styleIntents.input],
    title: "Search Everything",
  })
  const resultsRegion = new BoxRenderable(options.renderer, {
    id: "bluenote-search-results-region",
    flexDirection: "column",
    width: "100%",
    flexGrow: 1,
    border: true,
    borderColor: tuiTheme[vm.styleIntents.result],
    title: `Results · ${vm.resultCount}`,
  })
  const previewRegion = vm.regions.some((region) => region.id === "preview")
    ? new BoxRenderable(options.renderer, {
      id: "bluenote-search-preview-region",
      flexDirection: "column",
      width: "100%",
      height: "30%",
      border: true,
      borderColor: tuiTheme[vm.styleIntents.preview],
      title: "",
    })
    : null

  const input = new InputRenderable(options.renderer, {
    id: vm.input.id,
    value: vm.input.value,
    placeholder: vm.input.placeholder,
    textColor: tuiTheme.textPrimary,
    focusedTextColor: tuiTheme.textPrimary,
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
  if (vm.resultViewport.aboveLabel) {
    resultsRegion.add(new TextRenderable(options.renderer, { id: "bluenote-search-results-overflow-above", content: `↑ ${vm.resultViewport.aboveLabel}`, height: 1, fg: tuiTheme.textMuted }))
  }
  for (const row of vm.results) {
    resultsRegion.add(
      new TextRenderable(options.renderer, {
        id: `bluenote-search-result-row-${row.index}`,
        content: renderSearchResultRowText(row),
        height: 1,
        ...(row.selected ? { bg: tuiTheme.focusedRow } : {}),
      }),
    )
  }
  if (vm.resultViewport.belowLabel) {
    resultsRegion.add(new TextRenderable(options.renderer, { id: "bluenote-search-results-overflow-below", content: `↓ ${vm.resultViewport.belowLabel}`, height: 1, fg: tuiTheme.textMuted }))
  }
  if (vm.emptyState) {
    resultsRegion.add(new TextRenderable(options.renderer, { content: vm.emptyState.title, height: 1, fg: tuiTheme.textSecondary }))
    resultsRegion.add(new TextRenderable(options.renderer, { content: `Examples: ${vm.emptyState.examples.join(" · ")}`, height: 1, fg: tuiTheme[vm.emptyState.styleIntent] }))
    resultsRegion.add(new TextRenderable(options.renderer, { content: `Recent actions: ${vm.emptyState.recentActions.join(" · ")}`, height: 1, fg: tuiTheme[vm.emptyState.styleIntent] }))
    resultsRegion.add(new TextRenderable(options.renderer, { content: `Commands: ${vm.emptyState.commandSuggestions.join("  ")}`, height: 1, fg: tuiTheme[vm.emptyState.styleIntent] }))
  }

  if (vm.preview?.visible && previewRegion) {
    previewRegion.add(new TextRenderable(options.renderer, { content: renderPreviewText(vm.preview.titleText ?? vm.preview.title, "textSecondary"), height: 1, fg: tuiTheme.textSecondary }))
    if (vm.preview.subtitle.trim().length > 0) {
      previewRegion.add(new TextRenderable(options.renderer, { content: renderPreviewText(vm.preview.subtitleText ?? vm.preview.subtitle, "mutedText"), height: 1, fg: tuiTheme.mutedText }))
    }
    for (const [lineIndex, line] of vm.preview.lines.entries()) {
      previewRegion.add(new TextRenderable(options.renderer, { content: renderPreviewText(vm.preview.linesText?.[lineIndex] ?? line, "mutedText"), height: 1, fg: tuiTheme.mutedText }))
    }
  }
  root.add(inputRegion)
  root.add(resultsRegion)
  if (previewRegion) {
    root.add(previewRegion)
  } else if (vm.preview && !vm.preview.visible) {
    root.add(new TextRenderable(options.renderer, { content: vm.preview.hiddenStatus, height: 1, fg: tuiTheme[vm.preview.styleIntent] }))
  }
  root.add(new TextRenderable(options.renderer, { id: "bluenote-search-footer-hints", content: renderShortcutHints(vm.shortcutHints), height: 1, fg: tuiTheme.textMuted }))
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
    case "\u001bp":
      controller.toggleSearchPreview()
      return true
    case "\r":
    case "\n":
      if (controller.getSearchResults().length > 0) {
        controller.selectSearchResult()
      }
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
