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
import { displayCellWidth } from "./display-width"
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
  titleIntent: TuiColorIntent
  directoryPath: string
  filename: string
  fullPath: string
  pathSeparator: "|"
  updatedSeparator: "|"
  metadataIntent: TuiColorIntent
  fullPathIntent: TuiColorIntent
  relativePath: string
  key: string
  dirty: boolean
  saveStatusLabel: string
  statusLabel: string
  statusIntent: TuiColorIntent
  updatedLabel: string
  updatedIntent: TuiColorIntent
  wrapLabel: string
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
  margin: { top: number; x: number }
  textIntent: TuiColorIntent
  placeholderIntent: TuiColorIntent
  cursorIntent: TuiColorIntent
}

export interface EditorOverflowViewModel {
  above: boolean
  below: boolean
  indicator: "" | "↑" | "↓" | "↕"
  horizontal?: EditorHorizontalOverflowViewModel
}

export interface EditorHorizontalOverflowViewModel {
  left: boolean
  right: boolean
  indicator: "" | "‹" | "›" | "↔"
  indicatorIntent: TuiColorIntent
  scrollLeft: number
}

export interface EditorFindViewModel {
  visible: true
  sheetTitle: string
  description: string
  inputLabel: string
  query: string
  matchCount: number
  activeIndex: number | null
  countLabel: string
  placeholder: string
  focused: boolean
  styleIntent: TuiColorIntent
  surfaceIntent: TuiColorIntent
  statusIntent: TuiColorIntent
  shortcutHints: ShortcutRenderableHint[]
}

export interface EditorBottombarViewModel {
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
  bodyViewportColumns?: number
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
      return "Saving…"
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

  return `${latest.label} ${humanizeTimestamp(latest.value)}`
}

function humanizeTimestamp(value: string): string {
  const time = Date.parse(value)
  if (Number.isNaN(time)) {
    return value
  }

  const date = new Date(time)
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date)
  const day = date.getUTCDate()
  const year = date.getUTCFullYear()
  const hour = date.getUTCHours().toString().padStart(2, "0")
  const minute = date.getUTCMinutes().toString().padStart(2, "0")
  return `${month} ${day}, ${year}, ${hour}:${minute} UTC`
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

function lineRangeForCursor(body: string, cursorOffset: number): { start: number; end: number } {
  const chars = Array.from(body)
  const cursor = Math.max(0, Math.min(Math.trunc(Number.isFinite(cursorOffset) ? cursorOffset : chars.length), chars.length))
  let start = cursor
  while (start > 0 && chars[start - 1] !== "\n") start -= 1
  let end = cursor
  while (end < chars.length && chars[end] !== "\n") end += 1
  return { start, end }
}

function editorHorizontalOverflowFor(editor: EditorBufferWithAutosave | null, bodyViewportColumns: number): EditorHorizontalOverflowViewModel | undefined {
  if (!editor || (editor.wrapMode ?? "word") !== "none" || !Number.isFinite(bodyViewportColumns) || bodyViewportColumns <= 0) {
    return undefined
  }

  const cursorOffset = editorCursorOffset(editor)
  const range = lineRangeForCursor(editor.body, cursorOffset)
  const lineChars = Array.from(editor.body).slice(range.start, range.end)
  const line = lineChars.join("")
  const lineWidth = displayCellWidth(line)
  const viewportColumns = Math.max(1, Math.trunc(bodyViewportColumns))
  if (lineWidth <= viewportColumns) {
    return undefined
  }

  const cursorColumn = Math.max(0, Math.min(cursorOffset, range.end) - range.start)
  const cursorColumnWidth = displayCellWidth(lineChars.slice(0, cursorColumn).join(""))
  const displayLineWidth = lineWidth + (cursorColumn === lineChars.length ? 1 : 0)
  const maxScrollLeft = Math.max(0, displayLineWidth - viewportColumns)
  const scrollLeft = Math.max(0, Math.min(cursorColumnWidth >= viewportColumns ? cursorColumnWidth - viewportColumns + 1 : 0, maxScrollLeft))
  const left = scrollLeft > 0
  const right = scrollLeft + viewportColumns < lineWidth
  const indicator = left && right ? "↔" : left ? "‹" : right ? "›" : ""
  return { left, right, indicator, indicatorIntent: "info", scrollLeft }
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
  const findCountLabel = findMatchCount > 0 && activeFindIndex !== null ? `${activeFindIndex + 1}/${findMatchCount} matches` : `0/${findMatchCount} matches`

  const cursor = editor ? editorCursorPosition(editor, editorCursorOffset(editor)) : { line: 1, column: 1 }
  const baseWrapLabel = (editor?.wrapMode ?? "word") === "word" ? "Wrap word" : "Wrap off"
  const shortcuts = editorShortcuts()
  const lineCount = countLines(body)
  const overflow = editorOverflowFor(lineCount, cursor.line, responsive.bodyViewportLines ?? Number.POSITIVE_INFINITY)
  const horizontalOverflow = editorHorizontalOverflowFor(editor, responsive.bodyViewportColumns ?? Number.POSITIVE_INFINITY)
  if (horizontalOverflow) {
    overflow.horizontal = horizontalOverflow
  }
  const wrapLabel = (editor?.wrapMode ?? "word") === "none" ? `${baseWrapLabel} · more →` : baseWrapLabel
  const { visibleShortcuts, visibleShortcutHints, hiddenShortcutCount } = visibleShortcutLabels(shortcuts, responsive.width ?? 0)

  return {
    topbar: {
      noteName: note?.title ?? "No note open",
      titleIntent: "textPrimary",
      directoryPath: directoryPathFor(relativePath),
      filename: filenameFor(relativePath),
      fullPath: relativePath,
      pathSeparator: "|",
      updatedSeparator: "|",
      metadataIntent: "mutedText",
      fullPathIntent: "mutedText",
      relativePath,
      key: note?.key ?? "",
      dirty,
      saveStatusLabel,
      statusLabel: errorLabel ?? saveStatusLabel,
      statusIntent,
      updatedLabel,
      updatedIntent: "mutedText",
      wrapLabel,
    },
    find: findMode
      ? {
          visible: true,
          sheetTitle: "Find in note",
          description: `Search within ${note?.title ?? "current note"}.`,
          inputLabel: "Query:",
          query: editor?.findQuery ?? "",
          matchCount: findMatchCount,
          activeIndex: activeFindIndex,
          countLabel: findCountLabel,
          placeholder: "Find in note…",
          focused: true,
          styleIntent: "borderFocus",
          surfaceIntent: "surfacePanelRaised",
          statusIntent: "info",
          shortcutHints: [
            { text: findCountLabel },
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
      margin: { top: 1, x: 0 },
      textIntent: "textPrimary",
      placeholderIntent: "mutedText",
      cursorIntent: "borderFocus",
    },
    bottombar: {
      row2: {
        shortcuts: shortcuts.map(toShortcutHint).map(shortcutHintLabel),
        visibleShortcuts: findMode ? [] : visibleShortcuts,
        visibleShortcutHints: findMode ? [] : visibleShortcutHints,
        hiddenShortcutCount: findMode ? 0 : hiddenShortcutCount,
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
  const findBarRows = state.mode === "editor.find" ? 5 : 0
  const topbarRows = 1
  const shortcutRows = 1
  const bodyTopMarginRows = 1
  const bodyViewportLines = Math.max(1, screenHeight - topbarRows - findBarRows - shortcutRows - bodyTopMarginRows)
  const bodyViewportColumns = Math.max(1, screenWidth - 1)
  const vm = buildEditorViewModel(state, { width: Math.max(0, screenWidth - 4), bodyViewportLines, bodyViewportColumns })
  const editorState = state.editor
  const root = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-screen",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    border: false,
  })

  const topbar = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-topbar",
    flexDirection: "row",
    width: "100%",
    height: 1,
  })
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-title",
    content: ` ${vm.topbar.noteName} `,
    width: vm.topbar.noteName.length + 2,
    height: 1,
    fg: tuiTheme[vm.topbar.titleIntent],
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-separator-path",
    content: `${vm.topbar.pathSeparator} `,
    width: 2,
    height: 1,
    fg: tuiTheme[vm.topbar.metadataIntent],
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-path",
    content: vm.topbar.fullPath,
    width: Math.max(1, vm.topbar.fullPath.length),
    height: 1,
    fg: tuiTheme[vm.topbar.fullPathIntent],
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-separator-wrap",
    content: " | ",
    width: 3,
    height: 1,
    fg: tuiTheme[vm.topbar.metadataIntent],
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-wrap",
    content: vm.topbar.wrapLabel,
    width: Math.max(1, vm.topbar.wrapLabel.length),
    height: 1,
    fg: tuiTheme[vm.topbar.metadataIntent],
  }))
  topbar.add(new BoxRenderable(options.renderer, {
    id: "bluenote-editor-topbar-spacer",
    flexGrow: 1,
    height: 1,
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-separator-updated",
    content: ` ${vm.topbar.updatedSeparator} `,
    width: 3,
    height: 1,
    fg: tuiTheme[vm.topbar.metadataIntent],
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-updated",
    content: vm.topbar.updatedLabel,
    width: Math.max(1, vm.topbar.updatedLabel.length),
    height: 1,
    fg: tuiTheme[vm.topbar.updatedIntent],
  }))
  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-separator-status",
    content: " | ",
    width: 3,
    height: 1,
    fg: tuiTheme[vm.topbar.metadataIntent],
  }))

  topbar.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-topbar-save-status",
    content: vm.topbar.statusLabel,
    width: Math.max(1, vm.topbar.statusLabel.length),
    height: 1,
    fg: tuiTheme[vm.topbar.statusIntent],
  }))

  let findInput: InputRenderable | null = null
  const bodyPanel = new BoxRenderable(options.renderer, {
    id: vm.body.inputId,
    flexDirection: "column",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 1,
    overflow: "hidden",
    border: false,
  })
  const bodyTopMargin = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-body-margin-top",
    width: "100%",
    height: vm.body.margin.top,
  })
  const bodyContentRow = new BoxRenderable(options.renderer, {
    id: "bluenote-editor-body-content-row",
    flexDirection: "row",
    width: "100%",
    height: "100%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 1,
    overflow: "hidden",
  })
  const bodyLeftMargin = new TextRenderable(options.renderer, {
    id: "bluenote-editor-body-margin-left",
    content: " ".repeat(vm.body.margin.x),
    width: vm.body.margin.x,
    height: "100%",
    fg: tuiTheme[vm.body.placeholderIntent],
  })
  const bodyDisplay = new TextRenderable(options.renderer, {
    id: "bluenote-editor-body",
    content: renderControlledBodyValue(vm.body.value, editorState ? editorCursorOffset(editorState) : 0, vm.body.focused),
    height: "100%",
    flexGrow: 1,
    flexShrink: 1,
    wrapMode: vm.body.wrapMode,
    fg: vm.body.value.length > 0 ? undefined : tuiTheme[vm.body.placeholderIntent],
  })
  bodyContentRow.add(bodyLeftMargin)
  bodyContentRow.add(bodyDisplay)
  if (vm.body.overflow.horizontal) {
    bodyContentRow.add(new TextRenderable(options.renderer, {
      id: "bluenote-editor-body-horizontal-overflow",
      content: vm.body.overflow.horizontal.indicator,
      width: 1,
      height: "100%",
      fg: tuiTheme[vm.body.overflow.horizontal.indicatorIntent],
    }))
  }
  bodyPanel.add(bodyTopMargin)
  bodyPanel.add(bodyContentRow)
  bodyDisplay.scrollY = editorScrollTopFor(vm.body.lineCount, vm.body.cursor.line, bodyViewportLines)
  bodyDisplay.scrollX = vm.body.overflow.horizontal?.scrollLeft ?? 0

  root.add(topbar)
  if (vm.find) {
    const findBar = new BoxRenderable(options.renderer, {
      id: "bluenote-editor-find-bar",
      flexDirection: "column",
      width: "100%",
      height: 5,
      border: true,
      borderColor: tuiTheme[vm.find.styleIntent],
      title: vm.find.sheetTitle,
    })
    findBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-editor-find-copy",
      content: vm.find.description,
      height: 1,
      fg: tuiTheme.textSecondary,
    }))
    findBar.add(new TextRenderable(options.renderer, {
      id: "bluenote-editor-find-input-label",
      content: vm.find.inputLabel,
      height: 1,
      fg: tuiTheme.textPrimary,
    }))
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
      fg: tuiTheme[vm.find.statusIntent],
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
  const shortcutHints: ShortcutRenderableHint[] = [...vm.bottombar.row2.visibleShortcutHints, ...(vm.bottombar.row2.hiddenShortcutCount > 0 ? [{ text: `+${vm.bottombar.row2.hiddenShortcutCount}` }] : [])]
  root.add(new TextRenderable(options.renderer, {
    id: "bluenote-editor-bottombar-shortcuts",
    content: renderShortcutHints(shortcutHints),
    height: 1,
    fg: tuiTheme.textMuted,
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
