import { BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable, type CliRenderer } from "@opentui/core"

import type { ManagerBrowserModel, ManagerBrowserRow, ManagerPreviewModel } from "./adapters/note-manager-adapter"
import { padEndDisplayCells, truncateDisplayCells } from "./display-width"
import { TUI_SHORTCUTS, renderShortcutHints, shortcutHintLabels, topbarTextIntent, type ShortcutHint, type ShortcutRenderableHint } from "./render-chrome"
import type { AiStatusState, ManagerItem, TuiState } from "./state"
import { tuiTheme, type TuiColorIntent } from "./theme"
import type { WorkspaceController } from "./workspace-controller"

export interface ManagerRowViewModel {
  key: string
  filename: string
  title: string
  description: string
  relativePath: string
  type: "note" | "folder"
  focused: boolean
  focusMarker: ""
  openMarker: ""
  icon: "📁" | "📄"
  columns: {
    filename: string
    title: string
    description: string
  }
  displaySegments: {
    primary: string
    secondary: string
    metadata: string
  }
  styleIntent: TuiColorIntent
  itemStyleIntent: TuiColorIntent
  openStyleIntent: TuiColorIntent | null
  metadataStyleIntent: TuiColorIntent
}

export interface ManagerTopbarViewModel {
  leftTitle: "BlueNote"
  itemCountLabel: string
  appStatusLabel: string
  rightLabel: string
  bottomPath: string
  styleIntent: TuiColorIntent
}

export interface ManagerPanelViewModel {
  title: string
  styleIntent: TuiColorIntent
}

export interface ManagerDashboardViewModel {
  productLabel: "BlueNote"
  workspaceLabel: string
  summaryLabel: string
  orientation: string
  primaryActions: string[]
}

export interface ManagerEmptyStateViewModel {
  title: string
  body: string
  actions: string[]
  styleIntent: TuiColorIntent
}

export interface ManagerPreviewSectionViewModel {
  label: string
  lines: string[]
}

export interface ManagerAiStatusViewModel {
  text: string
  renderedText: string
  styleIntent: TuiColorIntent
}

export type ManagerPreviewViewModel =
  | {
      type: "empty"
      path: null
      title: string
      message: string
      sections: ManagerPreviewSectionViewModel[]
      rows?: undefined
      noteKey?: undefined
      contentLines?: undefined
      styleIntent: TuiColorIntent
    }
  | {
      type: "hidden"
      path: string | null
      reason: "manual" | "responsive"
      title: string
      message: string
      sections: ManagerPreviewSectionViewModel[]
      rows?: undefined
      noteKey?: undefined
      contentLines?: undefined
      styleIntent: TuiColorIntent
    }
  | {
      type: "folder"
      path: string
      rows: ManagerRowViewModel[]
      title: string
      message: string
      sections: ManagerPreviewSectionViewModel[]
      noteKey?: undefined
      contentLines?: undefined
      styleIntent: TuiColorIntent
    }
  | {
      type: "note-content"
      path: string
      noteKey: string
      title: string
      contentLines: string[]
      sections: ManagerPreviewSectionViewModel[]
      rows?: undefined
      styleIntent: TuiColorIntent
    }

export interface BuildManagerViewModelOptions {
  width?: number
}

export const MANAGER_PREVIEW_NARROW_WIDTH = 72
const MANAGER_ROW_PRIMARY_WIDTH = 24

export interface ManagerViewModel {
  title: string
  dashboard: ManagerDashboardViewModel
  topbar: ManagerTopbarViewModel
  panels: {
    layout1: ManagerPanelViewModel
    layout2: ManagerPanelViewModel
  }
  layout1: {
    rows: ManagerRowViewModel[]
    empty: boolean
    emptyState: ManagerEmptyStateViewModel | null
  }
  layout2: {
    preview: ManagerPreviewViewModel
  }
  rows: ManagerRowViewModel[]
  status: string
  aiStatus: ManagerAiStatusViewModel
  shortcutHints: ShortcutHint[]
  shortcuts: string[]
  createPrompt?: {
    visible: true
    inputId: string
    sheetTitle: string
    description: string
    destinationLabel: string
    inputLabel: string
    title: string
    placeholder: string
    status: string | null
    focused: true
    styleIntent: TuiColorIntent
    surfaceIntent: TuiColorIntent
    statusIntent: TuiColorIntent
    actions: string[]
  }
  actionPrompt?: {
    visible: true
    inputId: string
    sheetTitle: string
    description: string
    inputLabel: string
    title: string
    placeholder: string
    status: string | null
    focused: true
    styleIntent: TuiColorIntent
    surfaceIntent: TuiColorIntent
    statusIntent: TuiColorIntent
    actions: string[]
  }
  deletePrompt?: {
    visible: true
    key: string
    sheetTitle: string
    title: string
    relativePath: string
    consequenceLines: string[]
    status: string | null
    styleIntent: TuiColorIntent
    surfaceIntent: TuiColorIntent
    statusIntent: TuiColorIntent
    actions: string[]
  }
}

type BrowserishRow = ManagerBrowserRow | ManagerItem

function currentPathLabel(path: string | null | undefined, managedRootPath?: string | null): string {
  const normalized = (path ?? "").replace(/^\/+|\/+$/gu, "")
  return normalized ? normalized : (managedRootPath?.trim() || "note/")
}

function basenameLabel(path: string | null | undefined): string {
  const normalized = (path ?? "").replace(/^\/+|\/+$/gu, "")
  return normalized.split("/").filter(Boolean).at(-1) ?? ""
}

function currentOpenNoteLabel(state: TuiState): string {
  const note = state.editor?.note
  if (!note) {
    return ""
  }

  const contentLabel = note.title.trim() || basenameLabel(note.relativePath) || note.key
  return `Currently open: ${contentLabel}`
}

function normalizeAiStatus(ai: AiStatusState | null | undefined): AiStatusState {
  return ai ?? { kind: "not-configured" }
}

function cleanAiStatusDetail(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim()
}

function nonNegativeInteger(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0
}

function aiQueueStatusSuffix(status: AiStatusState): string {
  if (!("queue" in status) || !status.queue) {
    return ""
  }
  const failed = nonNegativeInteger(status.queue.failed ?? 0)
  return failed > 0 ? ` · ${failed} failed` : ""
}

function aiStatusIntent(status: AiStatusState): TuiColorIntent {
  if (("queue" in status && nonNegativeInteger(status.queue?.failed ?? 0) > 0) || status.kind === "error") {
    return "danger"
  }

  switch (status.kind) {
    case "running":
    case "auth-required":
      return "warning"
    case "connected":
    case "updated":
      return "success"
    case "not-configured":
    default:
      return "mutedText"
  }
}

export function buildAiStatusViewModel(ai: AiStatusState | null | undefined, width?: number): ManagerAiStatusViewModel {
  const status = normalizeAiStatus(ai)
  let text: string

  switch (status.kind) {
    case "auth-required": {
      const reason = truncateDisplayCells(cleanAiStatusDetail(status.reason) || "auth required", 62)
      text = `AI: ${reason}`
      break
    }
    case "connected": {
      const model = cleanAiStatusDetail(status.model)
      text = model ? `AI: connected · ${model}` : "AI: connected"
      break
    }
    case "running": {
      const key = cleanAiStatusDetail(status.key)
      if (status.progress) {
        const processed = nonNegativeInteger(status.progress.processed)
        const total = nonNegativeInteger(status.progress.total)
        text = `AI: running · processing ${Math.min(processed, total)}/${total}`
      } else if (key) {
        text = `AI: running · ${key}`
      } else {
        text = "AI: running"
      }
      break
    }
    case "updated": {
      const key = cleanAiStatusDetail(status.key)
      if (key) {
        text = `AI: updated · ${key}`
      } else if (typeof status.count === "number") {
        text = `AI: updated ${Math.max(0, Math.trunc(status.count))} description(s)`
      } else {
        text = "AI: updated"
      }
      break
    }
    case "error": {
      const reason = truncateDisplayCells(cleanAiStatusDetail(status.reason) || "unknown", 62)
      text = `AI: error · ${reason}`
      break
    }
    case "not-configured":
    default:
      text = "AI: not configured"
      break
  }

  text += aiQueueStatusSuffix(status)

  return {
    text,
    renderedText: typeof width === "number" ? truncateDisplayCells(text, Math.max(0, Math.trunc(width))) : text,
    styleIntent: aiStatusIntent(status),
  }
}

function focusedItemLabel(rows: ManagerRowViewModel[], preview: ManagerPreviewViewModel): string {
  if (preview.type === "hidden") {
    return "Preview hidden"
  }

  if (preview.type === "folder") {
    return basenameLabel(preview.path) || preview.title || "Folder"
  }

  if (preview.type === "note-content") {
    return basenameLabel(preview.path) || preview.title
  }

  const focused = rows.find((row) => row.focused)
  return focused ? focused.filename.replace(/\/+$/u, "") : "No preview"
}

function managerShortcutHints(state: TuiState, previewHidden: boolean, width?: number): ShortcutHint[] {
  if (state.mode === "manager.filter") {
    return [
      { key: "Enter", action: "Open", priority: "primary" },
      { key: "Esc", action: "Close", priority: "primary" },
    ]
  }

  if (state.mode === "manager.create") {
    return [
      { key: "Enter", action: "Create", priority: "primary" },
      { key: "Esc", action: "Cancel", priority: "primary" },
    ]
  }

  if (state.mode === "manager.rename" || state.mode === "manager.move") {
    return [
      { key: "Enter", action: state.mode === "manager.rename" ? "Rename" : "Move", priority: "primary" },
      { key: "Esc", action: "Cancel", priority: "primary" },
    ]
  }

  if (state.mode === "manager.deleteConfirm") {
    return [
      { key: "y", action: "Delete", priority: "primary" },
      { key: "Esc", action: "Cancel", priority: "primary" },
    ]
  }

  const primary: ShortcutHint[] = [
    { ...TUI_SHORTCUTS.managerOpen, priority: "primary" },
    { ...TUI_SHORTCUTS.managerFilter, priority: "primary" },
    ...(state.manager.canCreateFolder ? [{ ...TUI_SHORTCUTS.managerNew, priority: "primary" as const }] : []),
    { ...TUI_SHORTCUTS.quickNewDraft, priority: "primary" },
    { ...TUI_SHORTCUTS.globalSearch, priority: "primary" },
    { ...TUI_SHORTCUTS.managerBack, priority: "primary" },
    { ...TUI_SHORTCUTS.managerPreview, priority: "primary" },
    { key: "r", action: "Rename", priority: "secondary" },
    ...((state.manager.currentFolderPath ?? "").split("/").filter(Boolean)[0] === "draft" ? [] : [{ key: "m", action: "Move", priority: "secondary" as const }]),
  ]
  if (typeof width === "number" && width < MANAGER_PREVIEW_NARROW_WIDTH) {
    return primary
  }

  return primary
}

function managerRowTextWidth(width: number | undefined): number | undefined {
  if (typeof width !== "number") {
    return undefined
  }
  if (width < MANAGER_PREVIEW_NARROW_WIDTH) {
    return Math.max(0, width - 2)
  }
  return Math.max(0, Math.floor((width - 1) / 2) - 2)
}

function rowSegmentWidthsForAvailable(available: number | undefined): { primary: number; secondary: number | undefined } {
  if (typeof available !== "number") {
    return { primary: MANAGER_ROW_PRIMARY_WIDTH, secondary: undefined }
  }

  const primary = Math.min(MANAGER_ROW_PRIMARY_WIDTH, available)
  const secondary = Math.max(0, available - primary - 1)
  return { primary, secondary }
}

function displaySegmentsFor(row: BrowserishRow, maxWidth?: number): ManagerRowViewModel["displaySegments"] {
  const primary = row.type === "folder"
    ? row.title || basenameLabel(row.relativePath) || row.filename.replace(/\/+$/u, "")
    : row.title.trim() || row.filename || row.key
  const secondary = row.description
  const segments = {
    primary,
    secondary,
    metadata: "",
  }

  if (typeof maxWidth !== "number") {
    return segments
  }

  const widths = rowSegmentWidthsForAvailable(maxWidth)
  return {
    primary: truncateDisplayCells(segments.primary, widths.primary),
    secondary: typeof widths.secondary === "number" ? truncateDisplayCells(segments.secondary, widths.secondary) : segments.secondary,
    metadata: segments.metadata,
  }
}

function columnsFor(row: BrowserishRow): ManagerRowViewModel["columns"] {
  if ("columns" in row) {
    return { ...row.columns }
  }

  return {
    filename: row.filename,
    title: row.type === "folder" ? "" : row.title,
    description: row.type === "folder" ? "" : row.description,
  }
}

function toRowViewModel(row: BrowserishRow, _index: number, focused: boolean, _openNoteKey: string | null, maxWidth?: number): ManagerRowViewModel {
  return {
    key: row.key,
    filename: row.filename,
    title: row.title,
    description: row.description,
    relativePath: row.relativePath,
    type: row.type,
    focused,
    focusMarker: "",
    openMarker: "",
    icon: row.type === "folder" ? "📁" : "📄",
    columns: columnsFor(row),
    displaySegments: displaySegmentsFor(row, maxWidth),
    styleIntent: focused ? "focusedRow" : "panel",
    itemStyleIntent: "textPrimary",
    openStyleIntent: null,
    metadataStyleIntent: "mutedText",
  }
}

function emptyPreview(): ManagerPreviewViewModel {
  return {
    type: "empty",
    path: null,
    title: "Nothing selected",
    message: "Move through notes to show a preview here.",
    sections: [],
    styleIntent: "panel",
  }
}

function hiddenPreview(path: string | null, reason: "manual" | "responsive"): ManagerPreviewViewModel {
  return {
    type: "hidden",
    path,
    reason,
    title: "Preview hidden",
    message: reason === "responsive" ? "Preview hidden for narrow terminal · p show" : "Preview hidden · p show",
    sections: [],
    styleIntent: "mutedText",
  }
}

function previewSectionsFor(preview: Extract<ManagerPreviewViewModel, { type: "note-content" }>): ManagerPreviewSectionViewModel[] {
  return [
    { label: "", lines: [preview.title, "", ...preview.contentLines] },
  ]
}

function previewViewModelFor(preview: ManagerPreviewModel | null | undefined, openNoteKey: string | null, maxWidth?: number): ManagerPreviewViewModel {
  if (!preview || preview.type === "empty") {
    return emptyPreview()
  }

  if (preview.type === "hidden") {
    return hiddenPreview(preview.path, preview.reason)
  }

  if (preview.type === "folder") {
    return {
      type: "folder",
      path: preview.path,
      rows: preview.rows.map((row, index) => toRowViewModel(row, index, false, openNoteKey, maxWidth)),
      title: basenameLabel(preview.path) || "Folder",
      message: `${preview.rows.length} ${preview.rows.length === 1 ? "item" : "items"}`,
      sections: [
        { label: "Items", lines: preview.rows.map((row) => displaySegmentsFor(row, maxWidth).primary) },
      ],
      styleIntent: "panel",
    }
  }

  const notePreview: Extract<ManagerPreviewViewModel, { type: "note-content" }> = {
    type: "note-content",
    path: preview.path,
    noteKey: preview.noteKey,
    title: preview.title,
    contentLines: [...preview.contentLines],
    sections: [],
    styleIntent: "panel",
  }
  notePreview.sections = previewSectionsFor(notePreview)
  return notePreview
}

function emptyStateFor(currentPath: string, canCreateFolder: boolean): ManagerEmptyStateViewModel {
  const searchAction = shortcutHintLabels([{ ...TUI_SHORTCUTS.globalSearch }])[0]!
  if (!canCreateFolder) {
    return {
      title: "No items here yet",
      body: `Search your workspace from ${currentPath} or choose another folder.`,
      actions: [searchAction],
      styleIntent: "mutedText",
    }
  }

  return {
    title: "No folders here yet",
    body: `Create a folder in ${currentPath} or search your workspace.`,
    actions: [shortcutHintLabels([{ ...TUI_SHORTCUTS.managerNew }])[0]!, searchAction],
    styleIntent: "mutedText",
  }
}

export function buildManagerViewModel(state: TuiState, browserModel?: ManagerBrowserModel, options: BuildManagerViewModelOptions = {}): ManagerViewModel {
  const openNoteKey = state.editor?.note.key ?? null
  const hoveredPath = browserModel?.hoveredPath ?? state.manager.hoveredPath ?? null
  const currentFolderPath = browserModel?.currentFolderPath ?? state.manager.currentFolderPath ?? ""
  const responsivePreviewHidden = typeof options.width === "number" && options.width < MANAGER_PREVIEW_NARROW_WIDTH
  const rowTextWidth = managerRowTextWidth(options.width)
  const layout1SourceRows = browserModel?.layout1Rows ?? state.manager.items
  const rows = layout1SourceRows.map((item, index) => {
    const focused = browserModel ? item.relativePath === hoveredPath : index === state.manager.focusedIndex
    return toRowViewModel(item, index, focused, openNoteKey, rowTextWidth)
  })
  const preview = responsivePreviewHidden
    ? hiddenPreview(hoveredPath, "responsive")
    : browserModel
      ? previewViewModelFor(browserModel.preview, openNoteKey, rowTextWidth)
      : state.manager.previewVisible === false
        ? hiddenPreview(hoveredPath, "manual")
        : previewViewModelFor(undefined, openNoteKey, rowTextWidth)
  const itemCountLabel = `${rows.length} items${state.manager.filterQuery ? " (filtered)" : ""}`
  const appStatusLabel = state.manager.status?.trim() || "Ready"
  const rightLabel = `${itemCountLabel} | ${appStatusLabel}`
  const bottomPath = currentOpenNoteLabel(state)
  const aiStatus = buildAiStatusViewModel(state.ai, options.width)

  const currentPath = currentPathLabel(currentFolderPath, state.manager.managedRootPath)
  const createKind = state.manager.createDraft?.kind ?? "note"
  const createPrompt = state.mode === "manager.create"
    ? {
        visible: true as const,
        inputId: "bluenote-manager-create-title",
        sheetTitle: createKind === "folder" ? "New folder" : "New note",
        description: createKind === "folder" ? "Create a folder in this workspace." : "Create a Markdown note in this workspace.",
        destinationLabel: `Create in: ${currentPath}`,
        inputLabel: createKind === "folder" ? "Folder name:" : "Title:",
        title: state.manager.createDraft?.title ?? "",
        placeholder: createKind === "folder" ? "Folder name…" : "Note title…",
        status: state.manager.createDraft?.status ?? null,
        focused: true as const,
        styleIntent: "borderFocus" as const,
        surfaceIntent: "surfacePanelRaised" as const,
        statusIntent: (state.manager.createDraft?.status ? "warning" : "mutedText") as TuiColorIntent,
        actions: createKind === "folder" ? ["[Enter] Create", "[Tab] Note", "[Esc] Cancel"] : ["[Enter] Create", "[Tab] Folder", "[Esc] Cancel"],
      }
    : undefined
  const actionPrompt = (state.mode === "manager.rename" || state.mode === "manager.move" || state.mode === "manager.saveDraftAs") && state.manager.actionDraft
    ? {
        visible: true as const,
        inputId: `bluenote-manager-${state.manager.actionDraft.kind}-input`,
        sheetTitle: state.manager.actionDraft.kind === "rename" ? "Rename" : state.manager.actionDraft.kind === "saveDraftAs" ? "Save draft as" : "Move note",
        description: state.manager.actionDraft.kind === "rename"
          ? "Rename the selected folder or note."
          : state.manager.actionDraft.kind === "saveDraftAs"
            ? "Choose an existing note/ folder and edit the destination title."
            : "Choose an existing note/ folder, then press Enter to move the selected normal note.",
        inputLabel: state.manager.actionDraft.kind === "rename" ? "New name:" : state.manager.actionDraft.kind === "saveDraftAs" ? "Title:" : "Selected destination:",
        title: state.manager.actionDraft.input,
        placeholder: state.manager.actionDraft.kind === "rename" ? "New title or folder name…" : state.manager.actionDraft.kind === "saveDraftAs" ? "Destination title…" : "Select a folder row",
        status: state.manager.actionDraft.status,
        focused: true as const,
        styleIntent: "borderFocus" as const,
        surfaceIntent: "surfacePanelRaised" as const,
        statusIntent: (state.manager.actionDraft.status ? "warning" : "mutedText") as TuiColorIntent,
        actions: [state.manager.actionDraft.kind === "rename" ? "[Enter] Rename" : state.manager.actionDraft.kind === "saveDraftAs" ? "[Enter] Save as" : "[Enter] Move", "[↑/↓] Folder", "[Esc] Cancel"],
      }
    : undefined
  const deletePrompt = state.mode === "manager.deleteConfirm" && state.manager.deleteDraft
    ? {
        visible: true as const,
        key: state.manager.deleteDraft.key,
        sheetTitle: "Delete note?",
        title: state.manager.deleteDraft.title,
        relativePath: state.manager.deleteDraft.relativePath,
        consequenceLines: [
          "Deletes the Markdown file and BlueNote sidecar metadata.",
          "This cannot be undone.",
        ],
        status: state.manager.deleteDraft.status,
        styleIntent: "danger" as const,
        surfaceIntent: "surfacePanelRaised" as const,
        statusIntent: "danger" as const,
        actions: ["[y] Delete", "[Esc] Cancel"],
      }
    : undefined

  const previewHidden = preview.type === "hidden" || state.manager.previewVisible === false
  const shortcutHints = managerShortcutHints(state, previewHidden, options.width)

  return {
    title: "",
    dashboard: {
      productLabel: "BlueNote",
      workspaceLabel: `Workspace · ${currentPath}`,
      summaryLabel: `${itemCountLabel} · ${appStatusLabel}`,
      orientation: "Browse your local Markdown workspace.",
      primaryActions: shortcutHintLabels(shortcutHints),
    },
    topbar: {
      leftTitle: "BlueNote",
      itemCountLabel,
      appStatusLabel,
      rightLabel,
      bottomPath,
      styleIntent: topbarTextIntent(),
    },
    panels: {
      layout1: { title: currentPath, styleIntent: "borderFocus" },
      layout2: { title: preview.type === "empty" ? "" : focusedItemLabel(rows, preview), styleIntent: "borderSubtle" },
    },
    layout1: {
      rows,
      empty: rows.length === 0,
      emptyState: rows.length === 0 ? emptyStateFor(currentPath, state.manager.canCreateFolder === true) : null,
    },
    layout2: {
      preview,
    },
    rows,
    status: appStatusLabel,
    aiStatus,
    shortcutHints,
    shortcuts: shortcutHintLabels(shortcutHints),
    createPrompt,
    actionPrompt,
    deletePrompt,
  }
}

function promptHints(status: string | null | undefined, hints: ShortcutHint[]): ShortcutRenderableHint[] {
  return status ? [...hints, { text: status }] : hints
}

export interface RenderManagerScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onExit?: () => void
  onInvalidate?: () => void
  width?: number
}

function effectiveRendererWidth(options: RenderManagerScreenOptions): number | undefined {
  if (typeof options.width === "number") {
    return options.width
  }

  const rendererSize = options.renderer as CliRenderer & { width?: number; terminalWidth?: number }
  return rendererSize.width ?? rendererSize.terminalWidth
}

function rowSegment(options: RenderManagerScreenOptions, content: string, fg: string, bg: string | undefined, width?: number, flexShrink = 1): TextRenderable {
  return new TextRenderable(options.renderer, {
    content,
    height: 1,
    width,
    flexShrink,
    fg,
    ...(bg ? { bg } : {}),
  })
}

function rowRenderable(options: RenderManagerScreenOptions, row: ManagerRowViewModel): BoxRenderable {
  const bg = row.styleIntent === "focusedRow" ? tuiTheme.focusedRow : undefined
  const itemColor = tuiTheme[row.itemStyleIntent]
  const metadataColor = tuiTheme[row.metadataStyleIntent]
  const box = new BoxRenderable(options.renderer, {
    flexDirection: "row",
    width: "100%",
    flexShrink: 1,
    height: 1,
    ...(bg ? { backgroundColor: bg } : {}),
  })

  const rowTextWidth = managerRowTextWidth(effectiveRendererWidth(options))
  const widths = rowSegmentWidthsForAvailable(rowTextWidth)
  const primary = truncateDisplayCells(row.displaySegments.primary, widths.primary)
  const secondaryContentWidth = typeof widths.secondary === "number" ? Math.max(0, widths.secondary - 1) : undefined
  const secondary = typeof secondaryContentWidth === "number" ? truncateDisplayCells(row.displaySegments.secondary, secondaryContentWidth) : row.displaySegments.secondary
  box.add(rowSegment(options, padEndDisplayCells(primary, widths.primary), itemColor, bg, widths.primary, 0))
  if (typeof widths.secondary === "number") {
    box.add(rowSegment(options, secondary ? ` ${secondary}` : "", metadataColor, bg, widths.secondary, 1))
  } else {
    box.add(rowSegment(options, ` ${secondary}`, metadataColor, bg, undefined, 1))
  }

  return box
}

export function renderManagerScreen(options: RenderManagerScreenOptions): BoxRenderable {
  const state = options.controller.getState()
  const screenWidth = effectiveRendererWidth(options)
  const responsivePreviewHidden = typeof screenWidth === "number" && screenWidth < MANAGER_PREVIEW_NARROW_WIDTH
  const browserModel = responsivePreviewHidden ? undefined : options.controller.getManagerBrowserModel()
  const vm = buildManagerViewModel(state, browserModel, { width: screenWidth })
  const previewHidden = vm.layout2.preview.type === "hidden"
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: false,
    title: vm.title,
  })

  root.add(new TextRenderable(options.renderer, {
    id: "bluenote-manager-topbar",
    content: `${vm.dashboard.productLabel}  ${vm.dashboard.workspaceLabel}  ${vm.dashboard.summaryLabel}`,
    height: 1,
    fg: tuiTheme[vm.topbar.styleIntent],
  }))

  const panels = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-panels",
    flexDirection: "row",
    width: "100%",
    flexGrow: 1,
    columnGap: 1,
  })
  const layout1 = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-layout-1",
    flexDirection: "column",
    width: previewHidden ? "100%" : "50%",
    height: "100%",
    border: true,
    borderColor: tuiTheme[vm.panels.layout1.styleIntent],
    title: vm.panels.layout1.title,
  })
  const layout2 = previewHidden ? null : new BoxRenderable(options.renderer, {
    id: "bluenote-manager-layout-2",
    flexDirection: "column",
    width: "50%",
    height: "100%",
    border: true,
    borderColor: tuiTheme[vm.panels.layout2.styleIntent],
    title: vm.panels.layout2.title,
  })

  for (const row of vm.layout1.rows) {
    layout1.add(rowRenderable(options, row))
  }
  if (vm.layout1.empty && vm.layout1.emptyState) {
    layout1.add(new TextRenderable(options.renderer, { content: vm.layout1.emptyState.title, height: 1, fg: tuiTheme.textSecondary }))
    layout1.add(new TextRenderable(options.renderer, { content: vm.layout1.emptyState.body, height: 1, fg: tuiTheme[vm.layout1.emptyState.styleIntent] }))
    layout1.add(new TextRenderable(options.renderer, { content: vm.layout1.emptyState.actions.join("  "), height: 1, fg: tuiTheme[vm.layout1.emptyState.styleIntent] }))
  }
  if (vm.layout2.preview.type === "hidden") {
    layout1.add(new TextRenderable(options.renderer, { content: vm.layout2.preview.message, height: 1, fg: tuiTheme[vm.layout2.preview.styleIntent] }))
  }

  const preview = vm.layout2.preview
  if (layout2 && preview.type === "folder") {
    for (const row of preview.rows) {
      layout2.add(rowRenderable(options, row))
    }
  } else if (layout2 && preview.type === "note-content") {
    for (const section of preview.sections) {
      if (section.label) {
        layout2.add(new TextRenderable(options.renderer, { content: section.label, height: 1, fg: tuiTheme.textSecondary }))
      }
      for (const line of section.lines.slice(0, 20)) {
        layout2.add(new TextRenderable(options.renderer, { content: line, height: 1, fg: tuiTheme.textPrimary }))
      }
    }
  } else if (layout2 && preview.type === "empty") {
    layout2.add(new TextRenderable(options.renderer, { content: preview.title, height: 1, fg: tuiTheme.textSecondary }))
    layout2.add(new TextRenderable(options.renderer, { content: preview.message, height: 1, fg: tuiTheme[preview.styleIntent] }))
  } else if (layout2) {
    layout2.add(new TextRenderable(options.renderer, { content: "Preview hidden", height: 1, fg: tuiTheme.mutedText }))
  }

  panels.add(layout1)
  if (layout2) {
    panels.add(layout2)
  }
  root.add(panels)
  if (options.controller.getState().mode === "manager.filter") {
    const filterBar = new BoxRenderable(options.renderer, {
      id: "bluenote-manager-filter-bar",
      flexDirection: "column",
      width: "100%",
      height: 6,
      border: true,
      borderColor: tuiTheme.borderFocus,
      title: "Filter current folder",
    })
    filterBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-filter-copy",
      content: "Narrow the current folder without leaving the dashboard.",
      height: 1,
      fg: tuiTheme.textSecondary,
    }))
    filterBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-filter-scope",
      content: `Scope: ${vm.panels.layout1.title}`,
      height: 1,
      fg: tuiTheme.mutedText,
    }))
    filterBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-filter-input-label",
      content: "Filter:",
      height: 1,
      fg: tuiTheme.textPrimary,
    }))
    const filterInput = new InputRenderable(options.renderer, {
      id: "bluenote-manager-filter-query",
      value: options.controller.getState().manager.filterQuery ?? "",
      placeholder: "Type to filter…",
      width: "70%",
    })
    const filterHint = new TextRenderable(options.renderer, {
      id: "bluenote-manager-filter-hints",
      content: renderShortcutHints([{ key: "Esc", action: "Close" }, { key: "Enter", action: "Open" }]),
      height: 1,
      fg: tuiTheme.mutedText,
    })
    filterInput.on(InputRenderableEvents.INPUT, () => {
      options.controller.updateManagerFilter(filterInput.value)
      options.onInvalidate?.()
    })
    filterInput.on(InputRenderableEvents.CHANGE, () => {
      options.controller.updateManagerFilter(filterInput.value)
      options.onInvalidate?.()
    })
    filterBar.add(filterInput)
    filterBar.add(filterHint)
    root.add(filterBar)
    filterInput.focus()
  }
  if (vm.createPrompt) {
    const createBar = new BoxRenderable(options.renderer, {
      id: "bluenote-manager-create-bar",
      flexDirection: "column",
      width: "100%",
      height: 6,
      border: true,
      borderColor: tuiTheme[vm.createPrompt.styleIntent],
      title: vm.createPrompt.sheetTitle,
    })
    createBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-create-copy",
      content: vm.createPrompt.description,
      height: 1,
      fg: tuiTheme.textSecondary,
    }))
    createBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-create-destination",
      content: vm.createPrompt.destinationLabel,
      height: 1,
      fg: tuiTheme.mutedText,
    }))
    createBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-create-input-label",
      content: vm.createPrompt.inputLabel,
      height: 1,
      fg: tuiTheme.textPrimary,
    }))
    const createInput = new InputRenderable(options.renderer, {
      id: vm.createPrompt.inputId,
      value: vm.createPrompt.title,
      placeholder: vm.createPrompt.placeholder,
      width: "70%",
    })
    const createStatus = new TextRenderable(options.renderer, {
      id: "bluenote-manager-create-status",
      content: vm.createPrompt.status ?? " ",
      height: 1,
      fg: tuiTheme[vm.createPrompt.statusIntent],
    })
    const createHint = new TextRenderable(options.renderer, {
      id: "bluenote-manager-create-hints",
      content: renderShortcutHints([{ key: "Enter", action: "Create" }, { key: "Esc", action: "Cancel" }]),
      height: 1,
      fg: tuiTheme.mutedText,
    })
    createInput.on(InputRenderableEvents.INPUT, () => {
      options.controller.updateManagerCreateTitle(createInput.value)
      options.onInvalidate?.()
    })
    createInput.on(InputRenderableEvents.CHANGE, () => {
      options.controller.updateManagerCreateTitle(createInput.value)
      options.onInvalidate?.()
    })
    createBar.add(createInput)
    createBar.add(createStatus)
    createBar.add(createHint)
    root.add(createBar)
    createInput.focus()
  }
  if (vm.actionPrompt) {
    const actionBar = new BoxRenderable(options.renderer, {
      id: "bluenote-manager-action-bar",
      flexDirection: "column",
      width: "100%",
      height: 6,
      border: true,
      borderColor: tuiTheme[vm.actionPrompt.styleIntent],
      title: vm.actionPrompt.sheetTitle,
    })
    actionBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-action-copy",
      content: vm.actionPrompt.description,
      height: 1,
      fg: tuiTheme.textSecondary,
    }))
    actionBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-action-input-label",
      content: vm.actionPrompt.inputLabel,
      height: 1,
      fg: tuiTheme.textPrimary,
    }))
    const actionInput = new InputRenderable(options.renderer, {
      id: vm.actionPrompt.inputId,
      value: vm.actionPrompt.title,
      placeholder: vm.actionPrompt.placeholder,
      width: "70%",
    })
    const actionStatus = new TextRenderable(options.renderer, {
      id: "bluenote-manager-action-status",
      content: vm.actionPrompt.status ?? " ",
      height: 1,
      fg: tuiTheme[vm.actionPrompt.statusIntent],
    })
    const actionHint = new TextRenderable(options.renderer, {
      id: "bluenote-manager-action-hints",
      content: vm.actionPrompt.actions.join("  "),
      height: 1,
      fg: tuiTheme.mutedText,
    })
    actionInput.on(InputRenderableEvents.INPUT, () => {
      options.controller.updateManagerActionInput(actionInput.value)
      options.onInvalidate?.()
    })
    actionInput.on(InputRenderableEvents.CHANGE, () => {
      options.controller.updateManagerActionInput(actionInput.value)
      options.onInvalidate?.()
    })
    actionBar.add(actionInput)
    actionBar.add(actionStatus)
    actionBar.add(actionHint)
    root.add(actionBar)
    actionInput.focus()
  }
  if (vm.deletePrompt) {
    const deleteBar = new BoxRenderable(options.renderer, {
      id: "bluenote-manager-delete-confirm",
      flexDirection: "column",
      width: "100%",
      height: 7,
      border: true,
      borderColor: tuiTheme[vm.deletePrompt.styleIntent],
      title: vm.deletePrompt.sheetTitle,
    })
    deleteBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-delete-target-title",
      content: vm.deletePrompt.title,
      height: 1,
      fg: tuiTheme.textPrimary,
    }))
    deleteBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-delete-target-path",
      content: vm.deletePrompt.relativePath,
      height: 1,
      fg: tuiTheme.mutedText,
    }))
    for (const [index, line] of vm.deletePrompt.consequenceLines.entries()) {
      deleteBar.add(new TextRenderable(options.renderer, {
        id: `bluenote-manager-delete-consequence-${index + 1}`,
        content: line,
        height: 1,
        fg: index === vm.deletePrompt.consequenceLines.length - 1 ? tuiTheme.danger : tuiTheme.textSecondary,
      }))
    }
    deleteBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-delete-hints",
      content: renderShortcutHints(promptHints(vm.deletePrompt.status, [{ key: "y", action: "Delete", priority: "danger" }, { key: "Esc", action: "Cancel" }])),
      height: 1,
      fg: tuiTheme.mutedText,
    }))
    root.add(deleteBar)
  }
  const footerStatusRow = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-footer-status-row",
    flexDirection: "row",
    width: "100%",
    height: 1,
    overflow: "hidden",
  })
  footerStatusRow.add(new TextRenderable(options.renderer, {
    id: "bluenote-manager-current-open",
    content: vm.topbar.bottomPath,
    height: 1,
    flexGrow: 1,
    flexShrink: 1,
    fg: tuiTheme.mutedText,
  }))
  footerStatusRow.add(new TextRenderable(options.renderer, {
    id: "bluenote-manager-ai-status",
    content: vm.aiStatus.renderedText,
    height: 1,
    flexShrink: 1,
    fg: tuiTheme[vm.aiStatus.styleIntent],
  }))
  root.add(footerStatusRow)
  root.add(new TextRenderable(options.renderer, { id: "bluenote-manager-footer-hints", content: renderShortcutHints(vm.shortcutHints), height: 1, fg: tuiTheme.textMuted }))

  return root
}

export function routeManagerKey(sequence: string, controller: WorkspaceController, onExit?: () => void): boolean {
  if (controller.getState().mode === "manager.deleteConfirm") {
    if (sequence === "\u001b" || sequence === "\u001b[" || sequence === "n") {
      controller.cancelManagerDelete()
      return true
    }
    if (sequence === "y") {
      void controller.confirmManagerDelete()
      return true
    }
    if (sequence === "\r" || sequence === "\n") {
      return true
    }
    return true
  }

  if (controller.getState().mode === "manager.create") {
    const currentTitle = controller.getState().manager.createDraft?.title ?? ""
    if (sequence === "\u001b" || sequence === "\u001b[") {
      controller.cancelManagerCreate()
      return true
    }
    if (sequence === "\t" || sequence === "\u001b[Z") {
      controller.toggleManagerCreateKind()
      return true
    }
    if (sequence === "\r" || sequence === "\n") {
      void controller.submitManagerCreate()
      return true
    }
    if (sequence === "\u007f" || sequence === "\b") {
      controller.updateManagerCreateTitle(currentTitle.slice(0, -1))
      return true
    }
    if (sequence.length === 1 && sequence >= " " && sequence !== "\u007f") {
      controller.updateManagerCreateTitle(`${currentTitle}${sequence}`)
      return true
    }
  }

  if (controller.getState().mode === "manager.rename" || controller.getState().mode === "manager.move" || controller.getState().mode === "manager.saveDraftAs") {
    const mode = controller.getState().mode
    const currentInput = controller.getState().manager.actionDraft?.input ?? ""
    if (sequence === "\u001b" || sequence === "\u001b[") {
      controller.cancelManagerAction()
      return true
    }
    if ((mode === "manager.move" || mode === "manager.saveDraftAs") && (sequence === "\u001b[A" || sequence === "k")) {
      controller.moveManagerSelection("up")
      return true
    }
    if ((mode === "manager.move" || mode === "manager.saveDraftAs") && (sequence === "\u001b[B" || sequence === "j")) {
      controller.moveManagerSelection("down")
      return true
    }
    if ((mode === "manager.move" || mode === "manager.saveDraftAs") && sequence === "\u001b[C") {
      controller.openFocusedManagerFolder()
      return true
    }
    if ((mode === "manager.move" || mode === "manager.saveDraftAs") && sequence === "\u001b[D") {
      controller.goToManagerParent({ preserveActionMode: true })
      return true
    }
    if (sequence === "\r" || sequence === "\n") {
      controller.submitManagerAction()
      return true
    }
    if (mode === "manager.move") {
      return true
    }
    if (sequence === "\u007f" || sequence === "\b") {
      controller.updateManagerActionInput(currentInput.slice(0, -1))
      return true
    }
    if (sequence.length === 1 && sequence >= " " && sequence !== "\u007f") {
      controller.updateManagerActionInput(`${currentInput}${sequence}`)
      return true
    }
  }

  if (controller.getState().mode === "manager.filter") {
    const currentQuery = controller.getState().manager.filterQuery ?? ""
    if (sequence === "\u001b[A") {
      controller.moveManagerSelection("up")
      return true
    }
    if (sequence === "\u001b[B") {
      controller.moveManagerSelection("down")
      return true
    }
    if (sequence === "\r" || sequence === "\n" || sequence === "\u001b[C") {
      controller.openFocusedManagerItem()
      return true
    }
    if (sequence === "\u001b[D") {
      controller.clearManagerFilter()
      return true
    }
    if (sequence === "\u001b" || sequence === "\u001b[") {
      controller.goBack()
      return true
    }
    if (sequence === "\u007f" || sequence === "\b") {
      controller.updateManagerFilter(currentQuery.slice(0, -1))
      return true
    }
    if (sequence.length === 1 && sequence >= " " && sequence !== "\u007f") {
      controller.updateManagerFilter(`${currentQuery}${sequence}`)
      return true
    }
  }

  switch (sequence) {
    case "\u001b[A":
    case "k":
      controller.moveManagerSelection("up")
      return true
    case "\u001b[B":
    case "j":
      controller.moveManagerSelection("down")
      return true
    case "\u001b[C":
    case "\r":
    case "\n":
    case "o":
      controller.openFocusedManagerItem()
      return true
    case "\u001b[D":
    case "\u001b":
    case "\u001b[":
      controller.goBack()
      return true
    case "/":
    case "\u0006":
      controller.openManagerFilter()
      return true
    case "n":
      controller.openManagerCreate()
      return true
    case "N":
      controller.quickNewDraft()
      return true
    case "r":
      controller.openManagerRename()
      return true
    case "m":
      controller.openManagerMove()
      return true
    case "d":
      controller.openManagerDeleteConfirmation()
      return true
    case "p":
      controller.toggleManagerPreview()
      return true
    case "s":
      controller.openSearch()
      return true
    case "e":
      controller.showEditor()
      return true
    case "q": {
      const quit = controller.requestQuit()
      if (!quit.blocked) {
        onExit?.()
      }
      return true
    }
    default:
      return false
  }
}
