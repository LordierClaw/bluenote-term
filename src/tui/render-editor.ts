import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  TextRenderable,
  type CliRenderer,
} from "@opentui/core"

import { editorCursorOffset, editorCursorPosition } from "./adapters/editor-buffer-adapter"

import type { TuiState } from "./state"
import { tuiTheme, type TuiColorIntent } from "./theme"
import type { WorkspaceController } from "./workspace-controller"

type EditorAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error"
type EditorBufferWithAutosave = NonNullable<TuiState["editor"]> & { autosaveStatus?: EditorAutosaveStatus }
type NoteWithEditorMetadata = NonNullable<TuiState["editor"]>["note"] & {
  updatedAt?: string
  modifiedAt?: string
}

export interface EditorShortcutViewModel {
  label: string
  priority: number
}

export interface EditorTopbarViewModel {
  noteName: string
  directoryPath: string
  filename: string
  relativePath: string
  key: string
  dirty: boolean
  saveStatusLabel: string
  statusIntent: TuiColorIntent
  updatedLabel: string
  updatedIntent: TuiColorIntent
}

export interface EditorBodyViewModel {
  inputId: string
  value: string
  lineCount: number
  characterCount: number
  placeholder: string
  focused: boolean
  cursor: { line: number; column: number }
  wrapMode: "word" | "none"
  overflow: boolean
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
  cursorLabel: string
  saveStatusLabel: string
  updatedLabel: string
  wrapLabel: string
  shortcuts: EditorShortcutViewModel[]
}

export interface EditorViewModel {
  topbar: EditorTopbarViewModel
  find: EditorFindViewModel | null
  body: EditorBodyViewModel
  bottombar: EditorBottombarViewModel
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/\/+/gu, "/")
}

function filenameFor(relativePath: string): string {
  const normalizedPath = normalizeRelativePath(relativePath)
  return normalizedPath.split("/").filter(Boolean).at(-1) ?? normalizedPath
}

function directoryPathFor(relativePath: string): string {
  const parts = normalizeRelativePath(relativePath).split("/").filter(Boolean)
  if (parts.length <= 1) {
    return ""
  }

  return parts.slice(0, -1).join("/")
}

function countLines(value: string): number {
  if (value.length === 0) {
    return 1
  }

  return value.split("\n").length
}

function renderControlledBodyValue(value: string, cursorOffset: number, focused: boolean): string {
  const chars = Array.from(value)
  if (!focused) return value.length > 0 ? value : "Write your note…"
  chars.splice(Math.max(0, Math.min(cursorOffset, chars.length)), 0, "▌")
  const rendered = chars.join("")
  return rendered.length > 0 ? rendered : "▌"
}

function statusIntentForEditor(editor: EditorBufferWithAutosave | null): TuiColorIntent {
  switch (editor?.autosaveStatus) {
    case "pending":
      return "primaryAccent"
    case "saving":
      return "secondaryAccent"
    case "saved":
      return "mutedText"
    case "error":
      return "danger"
    default:
      return editor?.dirty ? "primaryAccent" : "mutedText"
  }
}

function editorSaveStatusLabel(editor: EditorBufferWithAutosave | null, dirty: boolean): string {
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
      return dirty ? "Unsaved" : "Saved"
  }
}

function noteTimestampCandidates(note: NoteWithEditorMetadata | null | undefined): Array<{ label: "Updated" | "Modified"; value: string; time: number }> {
  return [
    note?.updatedAt ? { label: "Updated" as const, value: note.updatedAt, time: Date.parse(note.updatedAt) } : null,
    note?.modifiedAt ? { label: "Modified" as const, value: note.modifiedAt, time: Date.parse(note.modifiedAt) } : null,
  ].filter((candidate): candidate is { label: "Updated" | "Modified"; value: string; time: number } => candidate !== null)
}

function updatedLabelFor(note: NoteWithEditorMetadata | null | undefined): string {
  const candidates = noteTimestampCandidates(note)
  if (candidates.length === 0) {
    return "Updated unknown"
  }

  const latest = candidates.reduce((currentLatest, candidate) => {
    const currentTime = Number.isNaN(currentLatest.time) ? Number.NEGATIVE_INFINITY : currentLatest.time
    const candidateTime = Number.isNaN(candidate.time) ? Number.NEGATIVE_INFINITY : candidate.time
    return candidateTime > currentTime ? candidate : currentLatest
  })

  return `${latest.label} ${latest.value}`
}

function editorShortcuts(): EditorShortcutViewModel[] {
  return [
    { label: "Ctrl+S save", priority: 1 },
    { label: "Ctrl+F find", priority: 2 },
    { label: "Alt+Z wrap", priority: 3 },
    { label: "Ctrl+P search", priority: 4 },
    { label: "Esc manager", priority: 5 },
    { label: "Ctrl+C quit", priority: 6 },
  ]
}

export function buildEditorViewModel(state: TuiState): EditorViewModel {
  const editor = state.editor as EditorBufferWithAutosave | null
  const note = editor?.note
  const body = editor?.body ?? ""
  const dirty = editor?.dirty ?? false
  const statusIntent = statusIntentForEditor(editor)
  const saveStatusLabel = editorSaveStatusLabel(editor, dirty)
  const relativePath = normalizeRelativePath(note?.relativePath ?? "")
  const updatedLabel = updatedLabelFor(note as NoteWithEditorMetadata | null | undefined)
  const findMode = state.mode === "editor.find"
  const findMatchCount = editor?.findMatchCount ?? 0
  const activeFindIndex = editor?.activeFindIndex ?? null

  const cursor = editor ? editorCursorPosition(editor, editorCursorOffset(editor)) : { line: 1, column: 1 }
  const cursorLabel = `Line ${cursor.line}, Col ${cursor.column}`
  const wrapLabel = `Wrap ${editor?.wrapMode ?? "word"}`
  const shortcuts = editorShortcuts()

  return {
    topbar: {
      noteName: note?.title ?? "No note open",
      directoryPath: directoryPathFor(relativePath),
      filename: filenameFor(relativePath),
      relativePath,
      key: note?.key ?? "",
      dirty,
      saveStatusLabel,
      statusIntent,
      updatedLabel,
      updatedIntent: "mutedText",
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
      inputId: "bluenote-editor-body-input",
      value: body,
      lineCount: countLines(body),
      characterCount: Array.from(body).length,
      placeholder: "Write your note…",
      focused: !findMode,
      cursor,
      wrapMode: editor?.wrapMode ?? "word",
      overflow: false,
    },
    bottombar: {
      status: `${cursorLabel} · ${wrapLabel} · ${saveStatusLabel} · ${updatedLabel}`,
      statusIntent,
      hints: shortcuts.map((shortcut) => shortcut.label),
      cursorLabel,
      saveStatusLabel,
      updatedLabel,
      wrapLabel,
      shortcuts,
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
  })

  const topbar = new TextRenderable(options.renderer, {
    content: `${vm.topbar.noteName}  ${vm.topbar.directoryPath}  ${vm.topbar.filename}  ${vm.topbar.key}  ${vm.topbar.updatedLabel}  ${vm.topbar.saveStatusLabel}`,
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
  const bodyPanel = new BoxRenderable(options.renderer, {
    id: vm.body.inputId,
    width: "100%",
    height: 20,
    border: true,
    borderColor: vm.body.focused ? tuiTheme.primaryAccent : tuiTheme.mutedText,
    backgroundColor: tuiTheme.panel,
    title: `Editor body · Line ${vm.body.cursor.line}, Col ${vm.body.cursor.column}`,
  })
  const state = options.controller.getState()
  const editor = state.editor
  const bodyDisplay = new TextRenderable(options.renderer, {
    id: "bluenote-editor-body",
    content: renderControlledBodyValue(vm.body.value, editor ? editorCursorOffset(editor) : 0, vm.body.focused),
    height: 18,
    fg: vm.body.value.length > 0 ? tuiTheme.primaryAccent : tuiTheme.mutedText,
    bg: tuiTheme.panel,
  })
  bodyPanel.add(bodyDisplay)

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
  root.add(bodyPanel)
  root.add(bottombarStatus)
  root.add(new TextRenderable(options.renderer, {
    content: vm.bottombar.hints.join("  "),
    height: 1,
    fg: tuiTheme.secondaryAccent,
    bg: tuiTheme.panel,
  }))
  if (findInput) {
    findInput.focus()
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
    case "\u001bz":
      controller.toggleEditorWrapMode()
      return true
    case "\u001b":
    case "\u001b[":
      controller.goBack()
      return true
    default:
      return false
  }
}
