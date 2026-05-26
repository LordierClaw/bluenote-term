import type { EditorBufferState, TuiNote } from "../state"

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

export interface ClipboardModel {
  readText: () => string
  writeText: (text: string) => void
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
  persist: (note: TuiNote, body: string) => TuiNote | Promise<TuiNote>
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
  return cloneEditor(editor, body)
}

export function selectAllEditorBody(editor: EditorBufferState): EditorSelection {
  return selectionFor(editor.body, 0, codePointLength(editor.body))
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
  clipboard.writeText(range.text)

  const body = replaceRangeByCodePoint(editor.body, range.start, range.end, "")
  const nextEditor = replaceEditorBody(editor, body)
  const nextSelection = selectionFor(nextEditor.body, range.start, range.start)

  return {
    editor: nextEditor,
    selection: nextSelection,
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

  return {
    note: cloneNote(persistedNote),
    body: persistedNote.body,
    savedBody: persistedNote.body,
    dirty: false,
  }
}
