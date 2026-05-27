import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextareaRenderable,
  TextRenderable,
  type CliRenderer,
  type KeyBinding as TextareaKeyBinding,
} from "@opentui/core"

import type { TuiState } from "./state"
import { tuiTheme, type TuiColorIntent } from "./theme"
import type { WorkspaceController } from "./workspace-controller"

type EditorAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error"
type EditorBufferWithAutosave = NonNullable<TuiState["editor"]> & { autosaveStatus?: EditorAutosaveStatus }

const editorBodyKeyBindings: TextareaKeyBinding[] = [
  { name: "f", ctrl: true, action: "submit" },
]

export interface EditorTopbarViewModel {
  title: string
  path: string
  filename: string
  key: string
  dirty: boolean
  status: "dirty" | "saved"
  statusIntent: TuiColorIntent
}

export interface EditorBodyViewModel {
  value: string
  lineCount: number
  characterCount: number
  placeholder: string
  focused: boolean
}

export interface EditorFindViewModel {
  visible: true
  query: string
  matchCount: number
  activeIndex: number | null
  countLabel: string
  placeholder: string
  focused: boolean
  styleIntent: TuiColorIntent
}

export interface EditorBottombarViewModel {
  status: string
  statusIntent: TuiColorIntent
  hints: string[]
}

export interface EditorViewModel {
  topbar: EditorTopbarViewModel
  find: EditorFindViewModel | null
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

function statusIntentForEditor(editor: EditorBufferWithAutosave | null): TuiColorIntent {
  switch (editor?.autosaveStatus) {
    case "pending":
    case "saving":
      return "warning"
    case "saved":
      return "success"
    case "error":
      return "danger"
    default:
      return editor?.dirty ? "warning" : "success"
  }
}

function bottomBarAutosaveLabel(editor: EditorBufferWithAutosave | null, fallbackStatus: "dirty" | "saved"): string {
  switch (editor?.autosaveStatus) {
    case "pending":
      return "Unsaved"
    case "saving":
      return "Autosaving…"
    case "saved":
      return "Saved"
    case "error":
      return "Autosave failed"
    default:
      return fallbackStatus
  }
}

export function buildEditorViewModel(state: TuiState): EditorViewModel {
  const editor = state.editor as EditorBufferWithAutosave | null
  const note = editor?.note
  const body = editor?.body ?? ""
  const dirty = editor?.dirty ?? false
  const status = dirty ? "dirty" : "saved"
  const statusIntent = statusIntentForEditor(editor)
  const bottomBarStatus = bottomBarAutosaveLabel(editor, status)
  const relativePath = note?.relativePath ?? ""
  const findMode = state.mode === "editor.find"
  const findMatchCount = editor?.findMatchCount ?? 0
  const activeFindIndex = editor?.activeFindIndex ?? null

  return {
    topbar: {
      title: note?.title ?? "No note open",
      path: relativePath,
      filename: filenameFor(relativePath),
      key: note?.key ?? "",
      dirty,
      status,
      statusIntent,
    },
    find: findMode
      ? {
          visible: true,
          query: editor?.findQuery ?? "",
          matchCount: findMatchCount,
          activeIndex: activeFindIndex,
          countLabel: findMatchCount > 0 && activeFindIndex !== null ? `${activeFindIndex + 1}/${findMatchCount}` : `0/${findMatchCount}`,
          placeholder: "Find in note…",
          focused: true,
          styleIntent: "secondaryAccent",
        }
      : null,
    body: {
      value: body,
      lineCount: countLines(body),
      characterCount: Array.from(body).length,
      placeholder: "Write your note…",
      focused: !findMode,
    },
    bottombar: {
      status: `Line 1, Col 1 · ${bottomBarStatus}`,
      statusIntent,
      hints: ["Ctrl+S save", "Ctrl+F find", "Ctrl+P search", "Esc manager", "Ctrl+C quit"],
    },
  }
}

export interface RenderEditorScreenOptions {
  renderer: CliRenderer
  controller: WorkspaceController
  onExit?: () => void
  onInvalidate?: () => void
}

export function renderEditorScreen(options: RenderEditorScreenOptions): BoxRenderable {
  const vm = buildEditorViewModel(options.controller.getState())
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: true,
    borderColor: tuiTheme.primaryAccent,
    backgroundColor: tuiTheme.background,
    title: vm.topbar.title,
  })

  const topbar = new TextRenderable(options.renderer, {
    content: `${vm.topbar.title}  ${vm.topbar.path}  ${vm.topbar.key}  ${vm.topbar.status}`,
    height: 1,
    fg: tuiTheme[vm.topbar.statusIntent],
    bg: tuiTheme.panel,
  })
  const bottombarStatus = new TextRenderable(options.renderer, {
    content: vm.bottombar.status,
    height: 1,
    fg: tuiTheme[vm.bottombar.statusIntent],
    bg: tuiTheme.panel,
  })
  let findInput: InputRenderable | null = null
  const textarea = new TextareaRenderable(options.renderer, {
    id: "bluenote-editor-body",
    initialValue: vm.body.value,
    placeholder: vm.body.placeholder,
    height: 20,
    width: "100%",
    wrapMode: "word",
    keyBindings: editorBodyKeyBindings,
    onSubmit() {
      options.controller.openEditorFind()
      options.onInvalidate?.()
    },
    onContentChange() {
      const rawBody = textarea.plainText
      const nextBody = rawBody.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      if (rawBody.includes("\u0006")) {
        if (nextBody !== rawBody) {
          textarea.initialValue = nextBody
        }
        options.controller.openEditorFind()
        options.onInvalidate?.()
        return
      }
      if (rawBody.includes("\u0013")) {
        if (nextBody !== rawBody) {
          textarea.initialValue = nextBody
        }
        void options.controller.saveEditor().then(() => options.onInvalidate?.()).catch(() => options.onInvalidate?.())
        return
      }
      options.controller.updateEditorBody(nextBody)
      if (nextBody !== rawBody) {
        textarea.initialValue = nextBody
        options.onInvalidate?.()
      }
    },
  })
  const defaultTextareaHandleKeyPress = textarea.handleKeyPress.bind(textarea)
  textarea.handleKeyPress = (key: Parameters<TextareaRenderable["handleKeyPress"]>[0]): boolean => {
    if ((key.ctrl === true && key.name === "f") || key.sequence === "\u0006" || key.sequence === "\u001b[27;5;102~") {
      options.controller.openEditorFind()
      options.onInvalidate?.()
      return true
    }
    if ((key.ctrl === true && key.name === "s") || key.sequence === "\u0013") {
      void options.controller.saveEditor().then(() => options.onInvalidate?.()).catch(() => options.onInvalidate?.())
      return true
    }
    if ((key.ctrl === true && key.name === "c") || key.sequence === "\u0003") {
      const quit = options.controller.requestQuit()
      if (!quit.blocked) {
        options.onExit?.()
      }
      return true
    }
    return defaultTextareaHandleKeyPress(key)
  }

  root.add(topbar)
  if (vm.find) {
    const findBar = new BoxRenderable(options.renderer, {
      id: "bluenote-editor-find-bar",
      flexDirection: "row",
      width: "100%",
      height: 3,
      border: true,
      borderColor: tuiTheme[vm.find.styleIntent],
      backgroundColor: tuiTheme.panel,
      title: "Find in note",
    })
    findInput = new InputRenderable(options.renderer, {
      id: "bluenote-editor-find-query",
      value: vm.find.query,
      placeholder: vm.find.placeholder,
      width: "70%",
    })
    const matchCount = new TextRenderable(options.renderer, {
      content: ` ${vm.find.countLabel}  Enter next  Shift+Enter previous  Esc close`,
      height: 1,
      fg: tuiTheme.mutedText,
      bg: tuiTheme.panel,
    })
    findInput.on(InputRenderableEvents.INPUT, () => {
      options.controller.updateEditorFindQuery(findInput?.value ?? "")
      options.onInvalidate?.()
    })
    findInput.on(InputRenderableEvents.CHANGE, () => {
      options.controller.updateEditorFindQuery(findInput?.value ?? "")
      options.onInvalidate?.()
    })
    findInput.on(InputRenderableEvents.ENTER, () => {
      options.controller.advanceEditorFind()
      options.onInvalidate?.()
    })
    findBar.add(findInput)
    findBar.add(matchCount)
    root.add(findBar)
  }
  root.add(textarea)
  root.add(bottombarStatus)
  root.add(new TextRenderable(options.renderer, {
    content: vm.bottombar.hints.join("  "),
    height: 1,
    fg: tuiTheme.secondaryAccent,
    bg: tuiTheme.panel,
  }))
  if (findInput) {
    findInput.focus()
  } else {
    textarea.focus()
  }

  return root
}

export function routeEditorKey(sequence: string, controller: WorkspaceController, onExit?: () => void, onInvalidate?: () => void): boolean {
  const state = controller.getState()
  if (state.mode === "editor.find") {
    if (sequence === "\u001b" || sequence === "\u001b[") {
      controller.goBack()
      return true
    }
    if (sequence === "\u001b[13;2u" || sequence === "\u001b\r") {
      controller.advanceEditorFind("previous")
      return true
    }
    if (sequence === "\r" || sequence === "\n") {
      controller.advanceEditorFind()
      return true
    }
  }

  switch (sequence) {
    case "\u0013":
      void controller.saveEditor().then(() => onInvalidate?.()).catch(() => onInvalidate?.())
      return true
    case "\u0006":
    case "\u001b[27;5;102~":
      controller.openEditorFind()
      return true
    case "\u001b":
    case "\u001b[":
      controller.goBack()
      return true
    default:
      return false
  }
}
