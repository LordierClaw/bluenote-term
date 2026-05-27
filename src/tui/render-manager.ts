import { BoxRenderable, InputRenderable, InputRenderableEvents, TextRenderable, type CliRenderer } from "@opentui/core"

import type { ManagerBrowserModel, ManagerBrowserRow, ManagerPreviewModel } from "./adapters/note-manager-adapter"
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
  focusMarker: "›" | " "
  openMarker: "●" | " "
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
  title: string
  currentPath: string
  hoveredPath: string | null
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
  shortcuts: string[]
}

type BrowserishRow = ManagerBrowserRow | ManagerItem

function currentPathLabel(path: string | null | undefined): string {
  const normalized = (path ?? "").replace(/^\/+|\/+$/gu, "")
  return normalized ? normalized : "notes/"
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

function toRowViewModel(row: BrowserishRow, index: number, focused: boolean, openNoteKey: string | null): ManagerRowViewModel {
  const open = row.type === "note" && row.key === openNoteKey

  return {
    key: row.key,
    filename: row.filename,
    title: row.title,
    description: row.description,
    relativePath: row.relativePath,
    type: row.type,
    focused,
    focusMarker: focused ? "›" : " ",
    openMarker: open ? "●" : " ",
    icon: row.type === "folder" ? "📁" : "📄",
    columns: columnsFor(row),
    styleIntent: focused ? "focusedRow" : "panel",
    itemStyleIntent: row.type === "folder" ? "secondaryAccent" : "primaryAccent",
    openStyleIntent: open ? "activeItem" : null,
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

function previewViewModelFor(preview: ManagerPreviewModel | null | undefined, openNoteKey: string | null): ManagerPreviewViewModel {
  if (!preview || preview.type === "empty") {
    return emptyPreview()
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

export function buildManagerViewModel(state: TuiState, browserModel?: ManagerBrowserModel): ManagerViewModel {
  const openNoteKey = state.editor?.note.key ?? null
  const hoveredPath = browserModel?.hoveredPath ?? state.manager.hoveredPath ?? null
  const currentFolderPath = browserModel?.currentFolderPath ?? state.manager.currentFolderPath ?? ""
  const layout1SourceRows = browserModel?.layout1Rows ?? state.manager.items
  const rows = layout1SourceRows.map((item, index) => {
    const focused = browserModel ? item.relativePath === hoveredPath : index === state.manager.focusedIndex
    return toRowViewModel(item, index, focused, openNoteKey)
  })
  const preview = previewViewModelFor(browserModel?.preview, openNoteKey)
  const statusParts = [`${rows.length} ${rows.length === 1 ? "item" : "items"}`]
  if (state.manager.filterQuery) {
    statusParts.push(`filter “${state.manager.filterQuery}”`)
  }
  if (openNoteKey) {
    statusParts.push(`selected ${openNoteKey}`)
  }

  return {
    title: "BlueNote Manager",
    topbar: {
      title: "BlueNote Manager",
      currentPath: currentPathLabel(currentFolderPath),
      hoveredPath,
      styleIntent: "primaryAccent",
    },
    panels: {
      layout1: { title: "Layout 1: current folder", styleIntent: "panel" },
      layout2: { title: "Layout 2: preview", styleIntent: "panel" },
    },
    layout1: {
      rows,
      empty: rows.length === 0,
    },
    layout2: {
      preview,
    },
    rows,
    status: statusParts.join(" · "),
    shortcuts: ["↑/↓ move", "→/Enter open", "←/Esc back", "/ filter", "Ctrl+P search", "q quit"],
  }
}

export interface RenderManagerScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onExit?: () => void
  onInvalidate?: () => void
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
  const itemColor = tuiTheme[row.openStyleIntent ?? row.itemStyleIntent]
  const metadataColor = tuiTheme[row.metadataStyleIntent]
  const open = row.openMarker === "●" ? `${row.openMarker} ` : "  "
  const box = new BoxRenderable(options.renderer, {
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: bg,
  })

  box.add(rowSegment(options, `${row.focusMarker} ${open}${row.icon} `, itemColor, bg, 6))
  box.add(rowSegment(options, row.columns.filename.padEnd(22), itemColor, bg, 22))
  box.add(rowSegment(options, ` ${row.columns.title.padEnd(18)}`, metadataColor, bg, 19))
  box.add(rowSegment(options, ` ${row.columns.description}`, metadataColor, bg))

  return box
}

export function renderManagerScreen(options: RenderManagerScreenOptions): BoxRenderable {
  const vm = buildManagerViewModel(options.controller.getState(), options.controller.getManagerBrowserModel())
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: true,
    borderColor: tuiTheme.primaryAccent,
    backgroundColor: tuiTheme.background,
    title: vm.title,
  })

  root.add(new TextRenderable(options.renderer, {
    content: `${vm.topbar.title}  ${vm.topbar.currentPath} → ${vm.topbar.hoveredPath ?? ""}`,
    height: 1,
    fg: tuiTheme.primaryAccent,
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
    width: "50%",
    height: "100%",
    border: true,
    borderColor: tuiTheme.primaryAccent,
    backgroundColor: tuiTheme.panel,
    title: vm.panels.layout1.title,
  })
  const layout2 = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-layout-2",
    flexDirection: "column",
    width: "50%",
    height: "100%",
    border: true,
    borderColor: tuiTheme.secondaryAccent,
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
  if (preview.type === "folder") {
    for (const row of preview.rows) {
      layout2.add(rowRenderable(options, row))
    }
  } else if (preview.type === "note-content") {
    layout2.add(new TextRenderable(options.renderer, { content: preview.title, height: 1, fg: tuiTheme.primaryAccent, bg: tuiTheme.panel }))
    layout2.add(new TextRenderable(options.renderer, { content: preview.path, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
    for (const line of preview.contentLines.slice(0, 20)) {
      layout2.add(new TextRenderable(options.renderer, { content: line, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
    }
  } else {
    layout2.add(new TextRenderable(options.renderer, { content: "No preview", height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
  }

  panels.add(layout1)
  panels.add(layout2)
  root.add(panels)
  if (options.controller.getState().mode === "manager.filter") {
    const filterBar = new BoxRenderable(options.renderer, {
      id: "bluenote-manager-filter-bar",
      flexDirection: "row",
      width: "100%",
      height: 3,
      border: true,
      borderColor: tuiTheme.secondaryAccent,
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
      content: "  Esc close  Enter apply",
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
  root.add(new TextRenderable(options.renderer, { content: vm.status, height: 1, fg: tuiTheme.mutedText, bg: tuiTheme.panel }))
  root.add(new TextRenderable(options.renderer, { content: vm.shortcuts.join("  "), height: 1, fg: tuiTheme.secondaryAccent, bg: tuiTheme.panel }))

  return root
}

export function routeManagerKey(sequence: string, controller: WorkspaceController, onExit?: () => void): boolean {
  if (controller.getState().mode === "manager.filter") {
    const currentQuery = controller.getState().manager.filterQuery ?? ""
    if (sequence === "\u001b" || sequence === "\u001b[" || sequence === "\r" || sequence === "\n") {
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
