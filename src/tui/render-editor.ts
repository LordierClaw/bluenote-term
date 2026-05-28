import {
  BoxRenderable,
  InputRenderable,
  InputRenderableEvents,
  StyledText,
  TextRenderable,
  bg,
  fg,
  type CliRenderer,
  type TextChunk,
} from "@opentui/core"

import { editorCursorOffset, editorCursorPosition } from "./adapters/editor-buffer-adapter"
import { renderShortcutHints, shortcutHintLabel, type ShortcutHint, type ShortcutRenderableHint } from "./render-chrome"

import type { TuiState } from "./state"
import { tuiTheme, type TuiColorIntent } from "./theme"
import type { WorkspaceController } from "./workspace-controller"

type EditorAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error"
type EditorBufferWithAutosave = NonNullable<TuiState["editor"]> & { autosaveStatus?: EditorAutosaveStatus }
type NoteWithEditorMetadata = NonNullable<TuiState["editor"]>["note"] & {
  updatedAt?: string
  modifiedAt?: string
}

export type EditorShortcutViewModel = ShortcutHint & { order: number }

export interface EditorTopbarViewModel {
  noteName: string
  directoryPath: string
  filename: string
  fullPath: string
  pathSeparator: "|"
  updatedSeparator: "|"
  fullPathIntent: TuiColorIntent
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
  overflow: EditorOverflowViewModel
}

export interface EditorOverflowViewModel {
  above: boolean
  below: boolean
  indicator: "" | "↑" | "↓" | "↕"
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
  shortcutHints: ShortcutRenderableHint[]
}

export interface EditorBottombarViewModel {
  row1: {
    leftLabel: string
    centerPrefixLabel: string
    centerStatusLabel: "Enabled" | "Disabled"
    centerStatusIntent: TuiColorIntent
    rightLabel: string
    rightIntent: TuiColorIntent
    errorLabel: string | null
  }
  row2: {
    shortcuts: string[]
    visibleShortcuts: string[]
    visibleShortcutHints: ShortcutHint[]
    hiddenShortcutCount: number
  }
}

export interface EditorViewModel {
  topbar: EditorTopbarViewModel
  find: EditorFindViewModel | null
  body: EditorBodyViewModel
  bottombar: EditorBottombarViewModel
}

export interface EditorResponsiveOptions {
  width?: number
  bodyViewportLines?: number
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

function renderControlledBodyValue(value: string, cursorOffset = Array.from(value).length, focused = true): string | StyledText {
  const displayValue = value.length > 0 ? value : "Write your note…"
  if (!focused) {
    return displayValue
  }

  const bodyChars = Array.from(value)
  const displayChars = Array.from(displayValue)
  const normalizedCursorOffset = Math.max(0, Math.min(Math.trunc(Number.isFinite(cursorOffset) ? cursorOffset : bodyChars.length), bodyChars.length))
  const cursorDisplayOffset = value.length > 0 ? normalizedCursorOffset : 0
  const before = displayChars.slice(0, cursorDisplayOffset).join("")
  const cursorCharacter = value.length > 0 && cursorDisplayOffset < displayChars.length ? displayChars[cursorDisplayOffset]! : " "
  const cursorIsOnNewline = cursorCharacter === "\n"
  const cursorText = cursorIsOnNewline ? " " : cursorCharacter
  const afterStart = value.length > 0 && cursorDisplayOffset < displayChars.length && !cursorIsOnNewline ? cursorDisplayOffset + 1 : cursorDisplayOffset
  const after = displayChars.slice(afterStart).join("")
  const cursorChunk = bg(tuiTheme.primaryAccent)(fg(tuiTheme.background)(cursorText)) as TextChunk
  const chunks: TextChunk[] = []

  if (before.length > 0) {
    chunks.push(fg(value.length > 0 ? "#ffffff" : tuiTheme.mutedText)(before) as TextChunk)
  }
  chunks.push(cursorChunk)
  if (after.length > 0) {
    chunks.push(fg(value.length > 0 ? "#ffffff" : tuiTheme.mutedText)(after) as TextChunk)
  }

  return new StyledText(chunks)
}

function statusIntentForEditor(editor: EditorBufferWithAutosave | null): TuiColorIntent {
  switch (editor?.autosaveStatus) {
    case "pending":
      return "warning"
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

function editorSaveStatusLabel(editor: EditorBufferWithAutosave | null, dirty: boolean): string {
  switch (editor?.autosaveStatus) {
    case "pending":
      return "Unsaved"
    case "saving":
      return "Saving"
    case "saved":
      return "Saved"
    case "error":
      return "Unsaved"
    default:
      return dirty ? "Unsaved" : "Saved"
  }
}

function editorStatusErrorLabel(editor: EditorBufferWithAutosave | null): string | null {
  return editor?.autosaveStatus === "error" ? "Autosave failed" : null
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
    { key: "Ctrl+S", action: "Save", order: 1 },
    { key: "Ctrl+F", action: "Find", order: 2 },
    { key: "Alt+Z", action: "Wrap", order: 3 },
    { key: "Ctrl+P", action: "Search", order: 4 },
    { key: "Esc", action: "Manager", order: 5 },
  ]
}

function toShortcutHint(shortcut: EditorShortcutViewModel): ShortcutHint {
  return shortcut.priority === undefined
    ? { key: shortcut.key, action: shortcut.action }
    : { key: shortcut.key, action: shortcut.action, priority: shortcut.priority }
}

function visibleShortcutLabels(shortcuts: EditorShortcutViewModel[], width: number): { visibleShortcuts: string[]; visibleShortcutHints: ShortcutHint[]; hiddenShortcutCount: number } {
  const sortedShortcuts = [...shortcuts].sort((left, right) => left.order - right.order)
  if (width <= 0) {
    const visibleShortcutHints = sortedShortcuts.map(toShortcutHint)
    return { visibleShortcuts: visibleShortcutHints.map(shortcutHintLabel), visibleShortcutHints, hiddenShortcutCount: 0 }
  }

  const separatorWidth = 2
  const hiddenIndicatorWidth = 3
  const visibleShortcutHints: ShortcutHint[] = []
  let usedWidth = 0

  for (const shortcut of sortedShortcuts) {
    const hint = toShortcutHint(shortcut)
    const label = shortcutHintLabel(hint)
    const hiddenAfterThis = sortedShortcuts.length - visibleShortcutHints.length - 1
    const nextWidth = label.length + (visibleShortcutHints.length > 0 ? separatorWidth : 0)
    const reservedWidth = hiddenAfterThis > 0 ? hiddenIndicatorWidth + separatorWidth : 0
    if (visibleShortcutHints.length > 0 && usedWidth + nextWidth + reservedWidth > width) {
      break
    }
    if (visibleShortcutHints.length === 0 && label.length + reservedWidth > width && width < label.length) {
      break
    }
    visibleShortcutHints.push(hint)
    usedWidth += nextWidth
  }

  return { visibleShortcuts: visibleShortcutHints.map(shortcutHintLabel), visibleShortcutHints, hiddenShortcutCount: Math.max(0, sortedShortcuts.length - visibleShortcutHints.length) }
}

function editorScrollTopFor(lineCount: number, cursorLine: number, bodyViewportLines: number): number {
  if (!Number.isFinite(bodyViewportLines) || bodyViewportLines <= 0 || lineCount <= bodyViewportLines) {
    return 0
  }

  return Math.max(0, Math.min(cursorLine - bodyViewportLines, lineCount - bodyViewportLines))
}

function editorOverflowFor(lineCount: number, cursorLine: number, bodyViewportLines: number): EditorOverflowViewModel {
  if (!Number.isFinite(bodyViewportLines) || bodyViewportLines <= 0 || lineCount <= bodyViewportLines) {
    return { above: false, below: false, indicator: "" }
  }

  const scrollTop = editorScrollTopFor(lineCount, cursorLine, bodyViewportLines)
  const above = scrollTop > 0
  const below = scrollTop + bodyViewportLines < lineCount
  const indicator = above && below ? "↕" : above ? "↑" : below ? "↓" : ""
  return { above, below, indicator }
}

export function buildEditorViewModel(state: TuiState, responsive: EditorResponsiveOptions = {}): EditorViewModel {
  const editor = state.editor as EditorBufferWithAutosave | null
  const note = editor?.note
  const body = editor?.body ?? ""
  const dirty = editor?.dirty ?? false
  const statusIntent = statusIntentForEditor(editor)
  const saveStatusLabel = editorSaveStatusLabel(editor, dirty)
  const saveStatusIntent = statusIntent
  const errorLabel = editorStatusErrorLabel(editor)
  const relativePath = normalizeRelativePath(note?.relativePath ?? "")
  const updatedLabel = updatedLabelFor(note as NoteWithEditorMetadata | null | undefined)
  const findMode = state.mode === "editor.find"
  const findMatchCount = editor?.findMatchCount ?? 0
  const activeFindIndex = editor?.activeFindIndex ?? null

  const cursor = editor ? editorCursorPosition(editor, editorCursorOffset(editor)) : { line: 1, column: 1 }
  const cursorLabel = `Line ${cursor.line}, Col ${cursor.column}`
  const wrapStatusLabel = (editor?.wrapMode ?? "word") === "word" ? "Enabled" : "Disabled"
  const wrapStatusIntent: TuiColorIntent = wrapStatusLabel === "Enabled" ? "success" : "danger"
  const wrapPrefixLabel = "Wrap word: "
  const shortcuts = editorShortcuts()
  const lineCount = countLines(body)
  const overflow = editorOverflowFor(lineCount, cursor.line, responsive.bodyViewportLines ?? Number.POSITIVE_INFINITY)
  const { visibleShortcuts, visibleShortcutHints, hiddenShortcutCount } = visibleShortcutLabels(shortcuts, responsive.width ?? 0)

  return {
    topbar: {
      noteName: note?.title ?? "No note open",
      directoryPath: directoryPathFor(relativePath),
      filename: filenameFor(relativePath),
      fullPath: relativePath,
      pathSeparator: "|",
      updatedSeparator: "|",
      fullPathIntent: "mutedText",
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
          shortcutHints: [
            { text: findMatchCount > 0 && activeFindIndex !== null ? `${activeFindIndex + 1}/${findMatchCount}` : `0/${findMatchCount}` },
            { key: "Enter", action: "Next" },
            { key: "Shift+Enter", action: "Previous" },
            { key: "Esc", action: "Close" },
          ],
        }
      : null,
    body: {
      inputId: "bluenote-editor-body-input",
      value: body,
      lineCount,
      characterCount: Array.from(body).length,
      placeholder: "Write your note…",
      focused: !findMode,
      cursor,
      wrapMode: editor?.wrapMode ?? "word",
      overflow,
    },
    bottombar: {
      row1: {
        leftLabel: cursorLabel,
        centerPrefixLabel: wrapPrefixLabel,
        centerStatusLabel: wrapStatusLabel,
        centerStatusIntent: wrapStatusIntent,
        rightLabel: saveStatusLabel,
        rightIntent: saveStatusIntent,
        errorLabel,
      },
      row2: {
        shortcuts: shortcuts.map(toShortcutHint).map(shortcutHintLabel),
        visibleShortcuts,
        visibleShortcutHints,
        hiddenShortcutCount,
      },
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
  const rendererSize = options.renderer as CliRenderer & { width?: number; height?: number; terminalWidth?: number; terminalHeight?: number }
  const screenWidth = rendererSize.width ?? rendererSize.terminalWidth ?? 80
  const screenHeight = rendererSize.height ?? rendererSize.terminalHeight ?? 24
  const state = options.controller.getState()
  const findBarRows = state.mode === "editor.find" ? 3 : 0
  const bodyViewportLines = Math.max(1, screenHeight - 1 - findBarRows - 2 - 4)
  const vm = buildEditorViewModel(state, { width: Math.max(0, screenWidth - 4), bodyViewportLines })
  const editorState = state.editor
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: false,
    backgroundColor: tuiTheme.background,
  })

  const topbar = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-topbar",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: tuiTheme.panel,
  })
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-title",
    content: ` ${vm.topbar.noteName} `,
    width: vm.topbar.noteName.length + 2,
    height: 1,
    fg: tuiTheme.textPrimary,
    bg: tuiTheme.panel,
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-separator-path",
    content: `${vm.topbar.pathSeparator} `,
    width: 2,
    height: 1,
    fg: tuiTheme.mutedText,
    bg: tuiTheme.panel,
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-path",
    content: vm.topbar.fullPath,
    width: Math.max(1, vm.topbar.fullPath.length),
    height: 1,
    fg: tuiTheme[vm.topbar.fullPathIntent],
    bg: tuiTheme.panel,
  }))
  topbar.add(new BoxRenderable(options.renderer, {
    id: "bluenote-editor-topbar-spacer",
    flexGrow: 1,
    height: 1,
    backgroundColor: tuiTheme.panel,
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-separator-updated",
    content: ` ${vm.topbar.updatedSeparator} `,
    width: 3,
    height: 1,
    fg: tuiTheme.mutedText,
    bg: tuiTheme.panel,
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-updated",
    content: vm.topbar.updatedLabel,
    width: Math.max(1, vm.topbar.updatedLabel.length),
    height: 1,
    fg: tuiTheme[vm.topbar.updatedIntent],
    bg: tuiTheme.panel,
  }))

  const bottombarStatus = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-status-row",
    flexDirection: "row",
    width: "100%",
    height: 1,
    backgroundColor: tuiTheme.panel,
  })
  bottombarStatus.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-cursor",
    content: ` ${vm.bottombar.row1.leftLabel}`,
    width: vm.bottombar.row1.leftLabel.length + 1,
    height: 1,
    fg: tuiTheme.mutedText,
    bg: tuiTheme.panel,
  }))
  bottombarStatus.add(new BoxRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-left-spacer",
    flexGrow: 1,
    height: 1,
    backgroundColor: tuiTheme.panel,
  }))
  bottombarStatus.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-wrap-prefix",
    content: vm.bottombar.row1.centerPrefixLabel,
    width: vm.bottombar.row1.centerPrefixLabel.length,
    height: 1,
    fg: tuiTheme.mutedText,
    bg: tuiTheme.panel,
  }))
  bottombarStatus.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-wrap-status",
    content: vm.bottombar.row1.centerStatusLabel,
    width: vm.bottombar.row1.centerStatusLabel.length,
    height: 1,
    fg: tuiTheme[vm.bottombar.row1.centerStatusIntent],
    bg: tuiTheme.panel,
  }))
  bottombarStatus.add(new BoxRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-right-spacer",
    flexGrow: 1,
    height: 1,
    backgroundColor: tuiTheme.panel,
  }))
  if (vm.bottombar.row1.errorLabel) {
    bottombarStatus.add(new TextRenderable(options.renderer, {
      id: "bluenote-editor-bottombar-error-status",
      content: `${vm.bottombar.row1.errorLabel} `,
      width: vm.bottombar.row1.errorLabel.length + 1,
      height: 1,
      fg: tuiTheme.danger,
      bg: tuiTheme.panel,
    }))
  }
  bottombarStatus.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-save-status",
    content: vm.bottombar.row1.rightLabel,
    width: vm.bottombar.row1.rightLabel.length,
    height: 1,
    fg: tuiTheme[vm.bottombar.row1.rightIntent],
    bg: tuiTheme.panel,
  }))
  let findInput: InputRenderable | null = null
  const bodyPanel = new BoxRenderable(options.renderer, {
    id: vm.body.inputId,
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 1,
    overflow: "hidden",
    border: false,
    backgroundColor: tuiTheme.panel,
  })
  const bodyDisplay = new TextRenderable(options.renderer, {
    id: "bluenote-editor-body",
    content: renderControlledBodyValue(vm.body.value, editorState ? editorCursorOffset(editorState) : 0, vm.body.focused),
    height: "100%",
    flexGrow: 1,
    flexShrink: 1,
    wrapMode: vm.body.wrapMode,
    fg: vm.body.value.length > 0 ? undefined : tuiTheme.mutedText,
    bg: tuiTheme.panel,
  })
  bodyPanel.add(bodyDisplay)
  bodyDisplay.scrollY = editorScrollTopFor(vm.body.lineCount, vm.body.cursor.line, bodyViewportLines)

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
      id: "bluenote-editor-find-hints",
      content: renderShortcutHints(vm.find.shortcutHints),
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
  const shortcutHints: ShortcutRenderableHint[] = [...vm.bottombar.row2.visibleShortcutHints, ...(vm.bottombar.row2.hiddenShortcutCount > 0 ? [{ text: `+${vm.bottombar.row2.hiddenShortcutCount}` }] : [])]
  root.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-shortcuts",
    content: renderShortcutHints(shortcutHints),
    height: 1,
    fg: tuiTheme.textMuted,
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
