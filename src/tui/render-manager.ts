import { BoxRenderable, TextRenderable, type CliRenderer } from "@opentui/core"

import type { TuiState } from "./state"
import type { TuiColorIntent } from "./theme"
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
  styleIntent: TuiColorIntent
  itemStyleIntent: TuiColorIntent
  openStyleIntent: TuiColorIntent | null
  metadataStyleIntent: TuiColorIntent
}

export interface ManagerViewModel {
  title: string
  rows: ManagerRowViewModel[]
  status: string
  shortcuts: string[]
}

export function buildManagerViewModel(state: TuiState): ManagerViewModel {
  const openNoteKey = state.editor?.note.key ?? null

  return {
    title: "BlueNote Manager",
    rows: state.manager.items.map((item, index) => {
      const focused = index === state.manager.focusedIndex
      const open = item.type === "note" && item.key === openNoteKey
      return {
        key: item.key,
        filename: item.filename,
        title: item.title,
        description: item.description,
        relativePath: item.relativePath,
        type: item.type,
        focused,
        focusMarker: focused ? "›" : " ",
        styleIntent: focused ? "focusedRow" : "panel",
        itemStyleIntent: item.type === "folder" ? "secondaryAccent" : "primaryAccent",
        openStyleIntent: open ? "selectedOpenNote" : null,
        metadataStyleIntent: "mutedText",
      }
    }),
    status: `${state.manager.items.length} ${state.manager.items.length === 1 ? "item" : "items"}${openNoteKey ? ` · selected ${openNoteKey}` : ""}`,
    shortcuts: ["↑/↓ move", "Enter/o open", "s search", "e editor", "q quit"],
  }
}

export interface RenderManagerScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onExit?: () => void
}

export function renderManagerScreen(options: RenderManagerScreenOptions): BoxRenderable {
  const vm = buildManagerViewModel(options.controller.getState())
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-manager-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: true,
    title: vm.title,
  })

  root.add(new TextRenderable(options.renderer, { content: vm.title, height: 1 }))
  for (const row of vm.rows) {
    root.add(
      new TextRenderable(options.renderer, {
        content: `${row.focusMarker} ${row.filename}  ${row.title} — ${row.description}`,
        height: 1,
      }),
    )
  }
  root.add(new TextRenderable(options.renderer, { content: vm.status, height: 1 }))
  root.add(new TextRenderable(options.renderer, { content: vm.shortcuts.join("  "), height: 1 }))

  return root
}

export function routeManagerKey(sequence: string, controller: WorkspaceController, onExit?: () => void): boolean {
  switch (sequence) {
    case "\u001b[A":
    case "k":
      controller.moveManagerSelection("up")
      return true
    case "\u001b[B":
    case "j":
      controller.moveManagerSelection("down")
      return true
    case "\r":
    case "\n":
    case "o":
      controller.openFocusedManagerItem()
      return true
    case "s":
    case "/":
      controller.openSearch()
      return true
    case "e":
      controller.showEditor()
      return true
    case "q":
      onExit?.()
      return true
    default:
      return false
  }
}
