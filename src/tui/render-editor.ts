import { BoxRenderable, TextareaRenderable, TextRenderable, type CliRenderer } from "@opentui/core"

import type { TuiState } from "./state"
import type { WorkspaceController } from "./workspace-controller"

export interface EditorTopbarViewModel {
  title: string
  path: string
  filename: string
  key: string
  dirty: boolean
  status: "dirty" | "saved"
}

export interface EditorBodyViewModel {
  value: string
  lineCount: number
  characterCount: number
  placeholder: string
}

export interface EditorBottombarViewModel {
  status: string
  hints: string[]
}

export interface EditorViewModel {
  topbar: EditorTopbarViewModel
  body: EditorBodyViewModel
  bottombar: EditorBottombarViewModel
}

function filenameFor(relativePath: string): string {
  return relativePath.split(/[\\/]/u).filter(Boolean).at(-1) ?? relativePath
}

function countLines(value: string): number {
  if (value.length === 0) {
    return 1
  }

  return value.split("\n").length
}

export function buildEditorViewModel(state: TuiState): EditorViewModel {
  const editor = state.editor
  const note = editor?.note
  const body = editor?.body ?? ""
  const dirty = editor?.dirty ?? false
  const status = dirty ? "dirty" : "saved"
  const relativePath = note?.relativePath ?? ""

  return {
    topbar: {
      title: note?.title ?? "No note open",
      path: relativePath,
      filename: filenameFor(relativePath),
      key: note?.key ?? "",
      dirty,
      status,
    },
    body: {
      value: body,
      lineCount: countLines(body),
      characterCount: Array.from(body).length,
      placeholder: "Write your note…",
    },
    bottombar: {
      status: `Line 1, Col 1 · ${status}`,
      hints: ["Ctrl+S save", "Ctrl+F find", "Ctrl+P search", "Esc manager", "Ctrl+C quit"],
    },
  }
}

export interface RenderEditorScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onExit?: () => void
}

export function renderEditorScreen(options: RenderEditorScreenOptions): BoxRenderable {
  const vm = buildEditorViewModel(options.controller.getState())
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: true,
    title: vm.topbar.title,
  })

  const topbar = new TextRenderable(options.renderer, {
    content: `${vm.topbar.title}  ${vm.topbar.path}  ${vm.topbar.key}  ${vm.topbar.status}`,
    height: 1,
  })
  const bottombarStatus = new TextRenderable(options.renderer, { content: vm.bottombar.status, height: 1 })
  const textarea = new TextareaRenderable(options.renderer, {
    id: "bluenote-editor-body",
    initialValue: vm.body.value,
    placeholder: vm.body.placeholder,
    flexGrow: 1,
    width: "100%",
    wrapMode: "word",
    onContentChange() {
      options.controller.updateEditorBody(textarea.plainText)
      const nextVm = buildEditorViewModel(options.controller.getState())
      topbar.content = `${nextVm.topbar.title}  ${nextVm.topbar.path}  ${nextVm.topbar.key}  ${nextVm.topbar.status}`
      bottombarStatus.content = nextVm.bottombar.status
    },
  })

  root.add(topbar)
  root.add(textarea)
  root.add(bottombarStatus)
  root.add(new TextRenderable(options.renderer, { content: vm.bottombar.hints.join("  "), height: 1 }))
  textarea.focus()

  return root
}

export function routeEditorKey(sequence: string, controller: WorkspaceController, onExit?: () => void): boolean {
  switch (sequence) {
    case "\u0013":
      controller.runCommand("/save")
      return true
    case "\u0006":
      controller.runCommand("/find")
      return true
    case "\u001b":
      controller.showManager()
      return true
    default:
      return false
  }
}
