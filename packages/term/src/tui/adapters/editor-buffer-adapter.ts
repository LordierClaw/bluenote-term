import type { EditorBufferState, TuiNote } from "../state"
import { displayCellWidth } from "../display-width"

/**
 * EditorSelection offsets are Unicode code-point offsets, not UTF-16 code-unit
 * offsets or terminal display columns. Runtime renderables must translate their
 * cursor model to this adapter contract before invoking command helpers.
 */
export interface EditorSelection {
  start: number
  end: number
  text: string
  collapsed: boolean
}

export type ClipboardCapabilityCategory = "desktop" | "terminal" | "internal" | "unavailable"

export interface ClipboardOperationResult {
  ok: boolean
  text?: string
  providerName: string
  category: ClipboardCapabilityCategory
  message?: string
}

export interface ClipboardStatus {
  name: string
  desktopWriteAvailable: boolean
  desktopReadAvailable: boolean
  terminalWriteAvailable: boolean
  copyCategory: ClipboardCapabilityCategory
  pasteCategory: ClipboardCapabilityCategory
}

export interface ClipboardModel {
  /** Human-readable clipboard backend for visible editor status. */
  name?: string
  /** True when paste can query a desktop/system clipboard source or internal fallback. */
  canRead?: boolean
  /** True when copy/cut can reach a desktop/system clipboard, terminal fallback, or internal fallback. */
  canWrite?: boolean
  clipboardStatus?: () => ClipboardStatus
  lastWriteResult?: () => ClipboardOperationResult
  readTextWithResult?: () => ClipboardOperationResult
  readText: () => string
  writeText: (text: string) => void | ClipboardOperationResult
}

export interface EditorMatch {
  start: number
  end: number
  text: string
}

export interface EditorFindState {
  query: string
  matches: EditorMatch[]
  currentIndex: number
  currentMatch: EditorMatch | null
}

export interface FindInEditorBodyOptions {
  fromIndex?: number
}

export interface EditorEditResult {
  editor: EditorBufferState
  selection: EditorSelection
  clipboardResult?: void | ClipboardOperationResult
}

export type EditorCursorDirection = "left" | "right" | "up" | "down" | "home" | "end"

export interface EditorCursorMoveOptions {
  viewportColumns?: number
}

export interface ReplaceCurrentMatchResult {
  editor: EditorBufferState
  findState: EditorFindState
}

export interface ReplaceAllMatchesResult {
  editor: EditorBufferState
  replacementCount: number
  findState: EditorFindState
}

export interface SaveEditorBufferDependencies {
  persist: (note: TuiNote, body: string, warn?: (message: string) => void) => TuiNote | Promise<TuiNote>
}

function cloneNote(note: TuiNote): TuiNote {
  return { ...note }
}

function codePoints(text: string): string[] {
  return Array.from(text)
}

function codePointLength(text: string): number {
  return codePoints(text).length
}

function normalizeOffset(offset: number, bodyLength: number): number {
  const finiteOffset = Number.isFinite(offset) ? offset : 0
  return Math.max(0, Math.min(Math.trunc(finiteOffset), bodyLength))
}

function normalizeRange(selection: Pick<EditorSelection, "start" | "end">, bodyLength: number): { start: number; end: number } {
  const first = normalizeOffset(selection.start, bodyLength)
  const second = normalizeOffset(selection.end, bodyLength)

  return {
    start: Math.min(first, second),
    end: Math.max(first, second),
  }
}

function sliceByCodePoint(text: string, start: number, end: number): string {
  return codePoints(text).slice(start, end).join("")
}

function replaceRangeByCodePoint(text: string, start: number, end: number, replacement: string): string {
  const chars = codePoints(text)
  return `${chars.slice(0, start).join("")}${replacement}${chars.slice(end).join("")}`
}

function selectionFor(body: string, start: number, end: number): EditorSelection {
  const range = normalizeRange({ start, end }, codePointLength(body))

  return {
    ...range,
    text: sliceByCodePoint(body, range.start, range.end),
    collapsed: range.start === range.end,
  }
}

function cloneEditor(editor: EditorBufferState, body = editor.body): EditorBufferState {
  const note = cloneNote(editor.note)
  note.body = body

  return {
    ...editor,
    note,
    body,
    dirty: body !== editor.savedBody,
  }
}

function withCursor(editor: EditorBufferState, cursorOffset: number, preferredColumn: number | null = null): EditorBufferState {
  const offset = normalizeOffset(cursorOffset, codePointLength(editor.body))
  return {
    ...editor,
    cursorOffset: offset,
    selectionStart: offset,
    selectionEnd: offset,
    preferredColumn,
    wrapMode: editor.wrapMode ?? "word",
  }
}

function currentSelection(editor: EditorBufferState): EditorSelection {
  const bodyLength = codePointLength(editor.body)
  const fallback = normalizeOffset(editor.cursorOffset ?? bodyLength, bodyLength)
  return selectionFor(editor.body, editor.selectionStart ?? fallback, editor.selectionEnd ?? fallback)
}

export function editorCursorOffset(editor: EditorBufferState): number {
  return currentSelection(editor).end
}

export function editorCursorPosition(editor: EditorBufferState, offset = editorCursorOffset(editor)): { line: number; column: number } {
  const chars = codePoints(editor.body)
  const normalized = normalizeOffset(offset, chars.length)
  let line = 1
  let column = 1
  for (let index = 0; index < normalized; index += 1) {
    if (chars[index] === "\n") {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }
  return { line, column }
}

function lineRanges(body: string): Array<{ start: number; end: number }> {
  const chars = codePoints(body)
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index] === "\n") {
      ranges.push({ start, end: index })
      start = index + 1
    }
  }
  ranges.push({ start, end: chars.length })
  return ranges
}

function lineIndexForOffset(ranges: Array<{ start: number; end: number }>, offset: number): number {
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]!
    const inclusiveEnd = range.end
    if (offset >= range.start && offset <= inclusiveEnd) return index
  }
  return Math.max(0, ranges.length - 1)
}

function wrappedLineRowsAndOffsets(lineChars: string[], viewportColumns: number): Array<{ row: number; offset: number }> {
  const columns = Math.max(1, Math.trunc(viewportColumns))
  const rows: Array<{ row: number; offset: number }> = [{ row: 0, offset: 0 }]
  let rowStart = 0

  while (rowStart < lineChars.length) {
    let width = 0
    let index = rowStart
    let lastBreakOffset: number | null = null

    while (index < lineChars.length) {
      const char = lineChars[index] ?? ""
      const charWidth = Math.max(0, displayCellWidth(char))
      if (width > 0 && width + charWidth > columns) break
      width += charWidth
      index += 1
      if (/\s/u.test(char)) {
        lastBreakOffset = index
      }
    }

    if (index >= lineChars.length) break

    let nextRowStart = lastBreakOffset !== null && lastBreakOffset > rowStart
      ? lastBreakOffset
      : Math.max(index, rowStart + 1)
    while (nextRowStart < lineChars.length && /\s/u.test(lineChars[nextRowStart] ?? "")) {
      nextRowStart += 1
    }
    if (nextRowStart >= lineChars.length) break
    rows.push({ row: rows.length, offset: nextRowStart })
    rowStart = nextRowStart
  }
  return rows
}

function displayColumnForOffset(chars: string[], start: number, offset: number): number {
  return displayCellWidth(chars.slice(start, Math.max(start, Math.min(offset, chars.length))).join(""))
}

function offsetForDisplayColumn(chars: string[], start: number, end: number, targetColumn: number): number {
  const normalizedStart = Math.max(0, Math.min(start, chars.length))
  const normalizedEnd = Math.max(normalizedStart, Math.min(end, chars.length))
  let width = 0
  for (let index = normalizedStart; index < normalizedEnd; index += 1) {
    const nextWidth = width + Math.max(0, displayCellWidth(chars[index] ?? ""))
    if (nextWidth > targetColumn) return index
    width = nextWidth
  }
  return normalizedEnd
}

function moveWrappedEditorCursor(editor: EditorBufferState, direction: "up" | "down", viewportColumns: number): EditorBufferState {
  const chars = codePoints(editor.body)
  const cursor = normalizeOffset(editorCursorOffset(editor), chars.length)
  const ranges = lineRanges(editor.body)
  const visualRows: Array<{ start: number; end: number; lineEnd: boolean }> = []

  for (const range of ranges) {
    const lineChars = chars.slice(range.start, range.end)
    const cursorWithinLine = cursor - range.start
    const measuredLineChars = cursor >= range.start && cursor <= range.end && cursorWithinLine >= lineChars.length
      ? [...lineChars, "█"]
      : lineChars
    const rows = wrappedLineRowsAndOffsets(measuredLineChars, viewportColumns)
    for (let index = 0; index < rows.length; index += 1) {
      const rowStart = range.start + Math.min(rows[index]?.offset ?? 0, lineChars.length)
      const rowEnd = index + 1 < rows.length
        ? range.start + Math.min(rows[index + 1]?.offset ?? lineChars.length, lineChars.length)
        : range.end
      visualRows.push({ start: rowStart, end: rowEnd, lineEnd: rowEnd === range.end && index + 1 >= rows.length })
    }
  }

  const foundRowIndex = visualRows.findIndex((row) => cursor >= row.start && (cursor < row.end || (row.lineEnd && cursor === row.end)))
  const rowIndex = foundRowIndex >= 0 ? foundRowIndex : Math.max(0, visualRows.length - 1)
  const currentRow = visualRows[rowIndex] ?? { start: 0, end: chars.length }
  const preferredColumn = editor.preferredColumn ?? displayColumnForOffset(chars, currentRow.start, cursor)
  const targetIndex = direction === "up" ? Math.max(0, rowIndex - 1) : Math.min(visualRows.length - 1, rowIndex + 1)
  const targetRow = visualRows[targetIndex] ?? currentRow
  const targetOffset = offsetForDisplayColumn(chars, targetRow.start, targetRow.end, preferredColumn)
  return withCursor(editor, targetOffset, preferredColumn)
}

export function insertTextAtEditorCursor(editor: EditorBufferState, text: string): EditorBufferState {
  const result = pasteText(editor, currentSelection(editor), text)
  return withCursor(result.editor, result.selection.end)
}

export function backspaceAtEditorCursor(editor: EditorBufferState): EditorBufferState {
  const selection = currentSelection(editor)
  if (!selection.collapsed) {
    const result = cutSelection(editor, selection, { readText: () => "", writeText: () => {} })
    return withCursor(result.editor, result.selection.end)
  }
  if (selection.start <= 0) return withCursor(editor, 0)
  const body = replaceRangeByCodePoint(editor.body, selection.start - 1, selection.start, "")
  return withCursor(replaceEditorBody(editor, body), selection.start - 1)
}

export function deleteAtEditorCursor(editor: EditorBufferState): EditorBufferState {
  const selection = currentSelection(editor)
  if (!selection.collapsed) {
    const result = cutSelection(editor, selection, { readText: () => "", writeText: () => {} })
    return withCursor(result.editor, result.selection.end)
  }
  const length = codePointLength(editor.body)
  if (selection.start >= length) return withCursor(editor, length)
  const body = replaceRangeByCodePoint(editor.body, selection.start, selection.start + 1, "")
  return withCursor(replaceEditorBody(editor, body), selection.start)
}

export function moveEditorCursor(editor: EditorBufferState, direction: EditorCursorDirection, options: EditorCursorMoveOptions = {}): EditorBufferState {
  const length = codePointLength(editor.body)
  const cursor = normalizeOffset(editorCursorOffset(editor), length)
  if (direction === "left") return withCursor(editor, cursor - 1)
  if (direction === "right") return withCursor(editor, cursor + 1)
  if ((direction === "up" || direction === "down") && (editor.wrapMode ?? "word") === "word" && Number.isFinite(options.viewportColumns) && (options.viewportColumns ?? 0) > 0) {
    return moveWrappedEditorCursor(editor, direction, options.viewportColumns!)
  }
  const ranges = lineRanges(editor.body)
  const lineIndex = lineIndexForOffset(ranges, cursor)
  const range = ranges[lineIndex]!
  const currentColumn = Math.max(0, Math.min(cursor, range.end) - range.start)
  const preferredColumn = editor.preferredColumn ?? currentColumn
  if (direction === "home") return withCursor(editor, range.start, 0)
  if (direction === "end") return withCursor(editor, range.end, range.end - range.start)
  const targetIndex = direction === "up" ? Math.max(0, lineIndex - 1) : Math.min(ranges.length - 1, lineIndex + 1)
  const target = ranges[targetIndex]!
  return withCursor(editor, target.start + Math.min(preferredColumn, target.end - target.start), preferredColumn)
}

function emptyFindState(query: string): EditorFindState {
  return {
    query,
    matches: [],
    currentIndex: -1,
    currentMatch: null,
  }
}

function textForPaste(textOrClipboard: string | ClipboardModel): string {
  return typeof textOrClipboard === "string" ? textOrClipboard : textOrClipboard.readText()
}

function currentMatchIsValid(editor: EditorBufferState, findState: EditorFindState): boolean {
  const match = findState.currentMatch

  if (!match || findState.query.length === 0) {
    return false
  }

  return sliceByCodePoint(editor.body, match.start, match.end) === match.text && match.text === findState.query
}

export function replaceEditorBody(editor: EditorBufferState, body: string): EditorBufferState {
  const next = cloneEditor(editor, body)
  return withCursor(next, editor.cursorOffset ?? codePointLength(body))
}

export function copySelection(editor: EditorBufferState, selection: EditorSelection, clipboard: ClipboardModel): string {
  const selected = selectionFor(editor.body, selection.start, selection.end).text
  clipboard.writeText(selected)

  return selected
}

export function cutSelection(
  editor: EditorBufferState,
  selection: EditorSelection,
  clipboard: ClipboardModel,
): EditorEditResult {
  const range = selectionFor(editor.body, selection.start, selection.end)
  const clipboardResult = clipboard.writeText(range.text)

  const body = replaceRangeByCodePoint(editor.body, range.start, range.end, "")
  const nextEditor = replaceEditorBody(editor, body)
  const nextSelection = selectionFor(nextEditor.body, range.start, range.start)

  return {
    editor: nextEditor,
    selection: nextSelection,
    clipboardResult,
  }
}

export function pasteText(
  editor: EditorBufferState,
  selection: EditorSelection,
  textOrClipboard: string | ClipboardModel,
): EditorEditResult {
  const range = selectionFor(editor.body, selection.start, selection.end)
  const text = textForPaste(textOrClipboard)
  const body = replaceRangeByCodePoint(editor.body, range.start, range.end, text)
  const nextEditor = replaceEditorBody(editor, body)
  const cursor = range.start + codePointLength(text)

  return {
    editor: nextEditor,
    selection: selectionFor(nextEditor.body, cursor, cursor),
  }
}

export function findInEditorBody(
  editor: EditorBufferState,
  query: string,
  options: FindInEditorBodyOptions = {},
): EditorFindState {
  const queryChars = codePoints(query)

  if (queryChars.length === 0) {
    return emptyFindState(query)
  }

  const bodyChars = codePoints(editor.body)
  const matches: EditorMatch[] = []

  for (let start = 0; start <= bodyChars.length - queryChars.length; start += 1) {
    const candidate = bodyChars.slice(start, start + queryChars.length).join("")

    if (candidate === query) {
      matches.push({
        start,
        end: start + queryChars.length,
        text: candidate,
      })
      start += queryChars.length - 1
    }
  }

  if (matches.length === 0) {
    return emptyFindState(query)
  }

  const fromIndex = normalizeOffset(options.fromIndex ?? 0, bodyChars.length)
  const currentIndex = matches.findIndex((match) => match.start >= fromIndex)
  const wrappedIndex = currentIndex === -1 ? 0 : currentIndex

  return {
    query,
    matches,
    currentIndex: wrappedIndex,
    currentMatch: matches[wrappedIndex] ?? null,
  }
}

export function advanceEditorFindState(editor: EditorBufferState, findState: EditorFindState): EditorFindState {
  if (findState.query.length === 0) {
    return emptyFindState(findState.query)
  }

  const refreshed = findInEditorBody(editor, findState.query)
  if (refreshed.matches.length === 0) {
    return refreshed
  }

  const currentIndex = findState.currentIndex >= 0 ? findState.currentIndex : refreshed.currentIndex
  const nextIndex = (currentIndex + 1) % refreshed.matches.length

  return {
    ...refreshed,
    currentIndex: nextIndex,
    currentMatch: refreshed.matches[nextIndex] ?? null,
  }
}

export function replaceCurrentMatch(
  editor: EditorBufferState,
  findState: EditorFindState,
  replacement: string,
): ReplaceCurrentMatchResult {
  const match = findState.currentMatch

  if (!match || !currentMatchIsValid(editor, findState)) {
    return {
      editor: replaceEditorBody(editor, editor.body),
      findState: findInEditorBody(editor, findState.query),
    }
  }

  const body = replaceRangeByCodePoint(editor.body, match.start, match.end, replacement)
  const nextEditor = replaceEditorBody(editor, body)
  const nextFindState = findInEditorBody(nextEditor, findState.query, {
    fromIndex: match.start + codePointLength(replacement),
  })

  return {
    editor: nextEditor,
    findState: nextFindState,
  }
}

export function replaceAllMatches(
  editor: EditorBufferState,
  query: string,
  replacement: string,
): ReplaceAllMatchesResult {
  const findState = findInEditorBody(editor, query)

  if (findState.matches.length === 0) {
    return {
      editor: replaceEditorBody(editor, editor.body),
      replacementCount: 0,
      findState,
    }
  }

  let cursor = 0
  let body = ""

  for (const match of findState.matches) {
    body += sliceByCodePoint(editor.body, cursor, match.start)
    body += replacement
    cursor = match.end
  }
  body += sliceByCodePoint(editor.body, cursor, codePointLength(editor.body))

  const nextEditor = replaceEditorBody(editor, body)
  const nextFindState = findInEditorBody(nextEditor, query)

  return {
    editor: nextEditor,
    replacementCount: findState.matches.length,
    findState: nextFindState,
  }
}

export async function saveEditorBuffer(
  editor: EditorBufferState,
  deps: SaveEditorBufferDependencies,
): Promise<EditorBufferState> {
  const persistedNote = await deps.persist(cloneNote(editor.note), editor.body)

  const cursorOffset = normalizeOffset(editor.cursorOffset ?? codePointLength(persistedNote.body), codePointLength(persistedNote.body))
  return {
    note: cloneNote(persistedNote),
    body: persistedNote.body,
    savedBody: persistedNote.body,
    dirty: false,
    cursorOffset,
    selectionStart: cursorOffset,
    selectionEnd: cursorOffset,
    preferredColumn: null,
    wrapMode: editor.wrapMode ?? "word",
  }
}
