import { BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable, type CliRenderer } from "@opentui/core"

import type { ManagerBrowserModel, ManagerBrowserRow, ManagerPreviewModel } from "./adapters/note-manager-adapter"
import { renderShortcutHints, shortcutHintLabels, topbarTextIntent, type ShortcutHint, type ShortcutRenderableHint } from "./render-chrome"
import type { ManagerItem, TuiState } from "./state"
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

export type ManagerPreviewViewModel =
  | {
      type: "empty"
      path: null
      rows?: undefined
      noteKey?: undefined
      title?: undefined
      description?: undefined
      contentLines?: undefined
      styleIntent: TuiColorIntent
    }
  | {
      type: "hidden"
      path: string | null
      reason: "manual" | "responsive"
      rows?: undefined
      noteKey?: undefined
      title?: undefined
      description?: undefined
      contentLines?: undefined
      styleIntent: TuiColorIntent
    }
  | {
      type: "folder"
      path: string
      rows: ManagerRowViewModel[]
      noteKey?: undefined
      title?: undefined
      description?: undefined
      contentLines?: undefined
      styleIntent: TuiColorIntent
    }
  | {
      type: "note-content"
      path: string
      noteKey: string
      title: string
      description: string
      contentLines: string[]
      rows?: undefined
      styleIntent: TuiColorIntent
    }

export interface BuildManagerViewModelOptions {
  width?: number
}

export const MANAGER_PREVIEW_NARROW_WIDTH = 72

export interface ManagerViewModel {
  title: string
  topbar: ManagerTopbarViewModel
  panels: {
    layout1: ManagerPanelViewModel
    layout2: ManagerPanelViewModel
  }
  layout1: {
    rows: ManagerRowViewModel[]
    empty: boolean
  }
  layout2: {
    preview: ManagerPreviewViewModel
  }
  rows: ManagerRowViewModel[]
  status: string
  shortcutHints: ShortcutHint[]
  shortcuts: string[]
  createPrompt?: {
    visible: true
    inputId: string
    title: string
    placeholder: string
    status: string | null
    focused: true
    styleIntent: TuiColorIntent
    statusIntent: TuiColorIntent
  }
  deletePrompt?: {
    visible: true
    key: string
    title: string
    relativePath: string
    status: string | null
    styleIntent: TuiColorIntent
  }
}

type BrowserishRow = ManagerBrowserRow | ManagerItem

function currentPathLabel(path: string | null | undefined): string {
  const normalized = (path ?? "").replace(/^\/+|\/+$/gu, "")
  return normalized ? normalized : "notes/"
}

function basenameLabel(path: string | null | undefined): string {
  const normalized = (path ?? "").replace(/^\/+|\/+$/gu, "")
  return normalized.split("/").filter(Boolean).at(-1) ?? ""
}

function focusedItemLabel(rows: ManagerRowViewModel[], preview: ManagerPreviewViewModel): string {
  if (preview.type === "hidden") {
    return "Preview hidden"
  }

  if (preview.type !== "empty") {
    return basenameLabel(preview.path) || "Preview"
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

  if (state.mode === "manager.deleteConfirm") {
    return [
      { key: "y", action: "Delete", priority: "primary" },
      { key: "Esc", action: "Cancel", priority: "primary" },
    ]
  }

  const primary: ShortcutHint[] = [
    { key: "Enter", action: "Open", priority: "primary" },
    { key: "n", action: "New", priority: "primary" },
  ]
  if (typeof width === "number" && width < MANAGER_PREVIEW_NARROW_WIDTH) {
    return primary
  }

  return [...primary, { key: "s", action: "Search", priority: "secondary" }]
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

function toRowViewModel(row: BrowserishRow, _index: number, focused: boolean, _openNoteKey: string | null): ManagerRowViewModel {
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
    styleIntent: focused ? "focusedRow" : "panel",
    itemStyleIntent: "mutedText",
    openStyleIntent: null,
    metadataStyleIntent: "mutedText",
  }
}

function emptyPreview(): ManagerPreviewViewModel {
  return {
    type: "empty",
    path: null,
    styleIntent: "panel",
  }
}

function hiddenPreview(path: string | null, reason: "manual" | "responsive"): ManagerPreviewViewModel {
  return {
    type: "hidden",
    path,
    reason,
    styleIntent: "panel",
  }
}

function previewViewModelFor(preview: ManagerPreviewModel | null | undefined, openNoteKey: string | null): ManagerPreviewViewModel {
  if (!preview || preview.type === "empty") {
    return emptyPreview()
  }

  if (preview.type === "hidden") {
    return {
      type: "hidden",
      path: preview.path,
      reason: preview.reason,
      styleIntent: "panel",
    }
  }

  if (preview.type === "folder") {
    return {
      type: "folder",
      path: preview.path,
      rows: preview.rows.map((row, index) => toRowViewModel(row, index, false, openNoteKey)),
      styleIntent: "panel",
    }
  }

  return {
    type: "note-content",
    path: preview.path,
    noteKey: preview.noteKey,
    title: preview.title,
    description: preview.description,
    contentLines: [...preview.contentLines],
    styleIntent: "panel",
  }
}

export function buildManagerViewModel(state: TuiState, browserModel?: ManagerBrowserModel, options: BuildManagerViewModelOptions = {}): ManagerViewModel {
  const openNoteKey = state.editor?.note.key ?? null
  const hoveredPath = browserModel?.hoveredPath ?? state.manager.hoveredPath ?? null
  const currentFolderPath = browserModel?.currentFolderPath ?? state.manager.currentFolderPath ?? ""
  const responsivePreviewHidden = typeof options.width === "number" && options.width < MANAGER_PREVIEW_NARROW_WIDTH
  const layout1SourceRows = browserModel?.layout1Rows ?? state.manager.items
  const rows = layout1SourceRows.map((item, index) => {
    const focused = browserModel ? item.relativePath === hoveredPath : index === state.manager.focusedIndex
    return toRowViewModel(item, index, focused, openNoteKey)
  })
  const preview = responsivePreviewHidden
    ? hiddenPreview(hoveredPath, "responsive")
    : browserModel
      ? previewViewModelFor(browserModel.preview, openNoteKey)
      : state.manager.previewVisible === false
        ? hiddenPreview(hoveredPath, "manual")
        : previewViewModelFor(undefined, openNoteKey)
  const itemCountLabel = `${rows.length} items${state.manager.filterQuery ? " (filtered)" : ""}`
  const appStatusLabel = state.manager.status?.trim() || "Ready"
  const rightLabel = `${itemCountLabel} | ${appStatusLabel}`
  const bottomPath = state.editor?.note.relativePath ?? ""

  const currentPath = currentPathLabel(currentFolderPath)
  const createPrompt = state.mode === "manager.create"
    ? {
        visible: true as const,
        inputId: "bluenote-manager-create-title",
        title: state.manager.createDraft?.title ?? "",
        placeholder: "Note title…",
        status: state.manager.createDraft?.status ?? null,
        focused: true as const,
        styleIntent: "secondaryAccent" as const,
        statusIntent: "mutedText" as const,
      }
    : undefined
  const deletePrompt = state.mode === "manager.deleteConfirm" && state.manager.deleteDraft
    ? {
        visible: true as const,
        key: state.manager.deleteDraft.key,
        title: state.manager.deleteDraft.title,
        relativePath: state.manager.deleteDraft.relativePath,
        status: state.manager.deleteDraft.status,
        styleIntent: "danger" as const,
      }
    : undefined

  const previewHidden = preview.type === "hidden" || state.manager.previewVisible === false
  const shortcutHints = managerShortcutHints(state, previewHidden, options.width)

  return {
    title: "",
    topbar: {
      leftTitle: "BlueNote",
      itemCountLabel,
      appStatusLabel,
      rightLabel,
      bottomPath,
      styleIntent: topbarTextIntent(),
    },
    panels: {
      layout1: { title: currentPath, styleIntent: "panel" },
      layout2: { title: focusedItemLabel(rows, preview), styleIntent: "panel" },
    },
    layout1: {
      rows,
      empty: rows.length === 0,
    },
    layout2: {
      preview,
    },
    rows,
    status: appStatusLabel,
    shortcutHints,
    shortcuts: shortcutHintLabels(shortcutHints),
    createPrompt,
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

function rowSegment(options: RenderManagerScreenOptions, content: string, fg: string, bg: string, width?: number): TextRenderable {
  return new TextRenderable(options.renderer, {
    content,
    height: 1,
    width,
    fg,
    bg,
  })
}

function rowRenderable(options: RenderManagerScreenOptions, row: ManagerRowViewModel): BoxRenderable {
  const bg = tuiTheme[row.styleIntent]
  const itemColor = tuiTheme[row.itemStyleIntent]
  const metadataColor = tuiTheme[row.metadataStyleIntent]
  const box = new BoxRenderable(options.renderer, {
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: bg,
  })

  box.add(rowSegment(options, row.columns.filename.padEnd(22), itemColor, bg, 22))
  box.add(rowSegment(options, ` ${row.columns.title.padEnd(18)}`, metadataColor, bg, 19))
  box.add(rowSegment(options, ` ${row.columns.description}`, metadataColor, bg))

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
    content: `${vm.topbar.leftTitle}  ${vm.topbar.rightLabel}`,
    height: 1,
    fg: tuiTheme[vm.topbar.styleIntent],
    bg: tuiTheme.panel,
  }))

  const panels = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-panels",
    flexDirection: "row",
    width: "100%",
    flexGrow: 1,
    backgroundColor: tuiTheme.background,
    columnGap: 1,
  })
  const layout1 = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-layout-1",
    flexDirection: "column",
    width: previewHidden ? "100%" : "50%",
    height: "100%",
    border: true,
    borderColor: tuiTheme.borderSubtle,
    backgroundColor: tuiTheme.panel,
    title: vm.panels.layout1.title,
  })
  const layout2 = previewHidden ? null : new BoxRenderable(options.renderer, {
    id: "bluenote-manager-layout-2",
    flexDirection: "column",
    width: "50%",
    height: "100%",
    border: true,
    borderColor: tuiTheme.borderSubtle,
    backgroundColor: tuiTheme.panel,
    title: vm.panels.layout2.title,
  })

  for (const row of vm.layout1.rows) {
    layout1.add(rowRenderable(options, row))
  }
  if (vm.layout1.empty) {
    layout1.add(new TextRenderable(options.renderer, { content: "No notes or folders", height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
  }

  const preview = vm.layout2.preview
  if (layout2 && preview.type === "folder") {
    for (const row of preview.rows) {
      layout2.add(rowRenderable(options, row))
    }
  } else if (layout2 && preview.type === "note-content") {
    layout2.add(new TextRenderable(options.renderer, { content: preview.title, height: 1, fg: tuiTheme.textPrimary, bg: tuiTheme.panel }))
    layout2.add(new TextRenderable(options.renderer, { content: preview.path, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
    for (const line of preview.contentLines.slice(0, 20)) {
      layout2.add(new TextRenderable(options.renderer, { content: line, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
    }
  } else if (layout2) {
    layout2.add(new TextRenderable(options.renderer, { content: "No preview", height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
  }

  panels.add(layout1)
  if (layout2) {
    panels.add(layout2)
  }
  root.add(panels)
  if (options.controller.getState().mode === "manager.filter") {
    const filterBar = new BoxRenderable(options.renderer, {
      id: "bluenote-manager-filter-bar",
      flexDirection: "row",
      width: "100%",
      height: 3,
      border: true,
      borderColor: tuiTheme.borderFocus,
      backgroundColor: tuiTheme.panel,
      title: "Filter current folder",
    })
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
      bg: tuiTheme.panel,
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
      flexDirection: "row",
      width: "100%",
      height: 3,
      border: true,
      borderColor: tuiTheme[vm.createPrompt.styleIntent],
      backgroundColor: tuiTheme.panel,
      title: "New note",
    })
    const createInput = new InputRenderable(options.renderer, {
      id: vm.createPrompt.inputId,
      value: vm.createPrompt.title,
      placeholder: vm.createPrompt.placeholder,
      width: "60%",
    })
    const createHint = new TextRenderable(options.renderer, {
      id: "bluenote-manager-create-hints",
      content: renderShortcutHints(promptHints(vm.createPrompt.status, [{ key: "Enter", action: "Create" }, { key: "Esc", action: "Cancel" }])),
      height: 1,
      fg: tuiTheme[vm.createPrompt.statusIntent],
      bg: tuiTheme.panel,
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
    createBar.add(createHint)
    root.add(createBar)
    createInput.focus()
  }
  if (vm.deletePrompt) {
    const deleteBar = new BoxRenderable(options.renderer, {
      id: "bluenote-manager-delete-confirm",
      flexDirection: "column",
      width: "100%",
      height: 4,
      border: true,
      borderColor: tuiTheme[vm.deletePrompt.styleIntent],
      backgroundColor: tuiTheme.panel,
      title: "Confirm delete",
    })
    deleteBar.add(new TextRenderable(options.renderer, {
      content: `Delete ${vm.deletePrompt.title} — ${vm.deletePrompt.relativePath} (${vm.deletePrompt.key})?`,
      height: 1,
      fg: tuiTheme.danger,
      bg: tuiTheme.panel,
    }))
    deleteBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-manager-delete-hints",
      content: renderShortcutHints(promptHints(vm.deletePrompt.status, [{ key: "Enter/y", action: "Confirm" }, { key: "Esc/n", action: "Cancel" }])),
      height: 1,
      fg: tuiTheme.mutedText,
      bg: tuiTheme.panel,
    }))
    root.add(deleteBar)
  }
  root.add(new TextRenderable(options.renderer, { content: vm.topbar.bottomPath, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
  root.add(new TextRenderable(options.renderer, { id: "bluenote-manager-footer-hints", content: renderShortcutHints(vm.shortcutHints), height: 1, fg: tuiTheme.textMuted, bg: tuiTheme.panel }))

  return root
}

export function routeManagerKey(sequence: string, controller: WorkspaceController, onExit?: () => void): boolean {
  if (controller.getState().mode === "manager.deleteConfirm") {
    if (sequence === "\u001b" || sequence === "\u001b[" || sequence === "n") {
      controller.cancelManagerDelete()
      return true
    }
    if (sequence === "y" || sequence === "\r" || sequence === "\n") {
      void controller.confirmManagerDelete()
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
