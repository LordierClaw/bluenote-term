import type { SearchNoteMatch } from "../../core/search-notes"
import { collectContainsFieldMatches, scoreContainsMatch } from "../../search/contains-match"
import { buildManagerBrowserItems, buildManagerFolderPreviewLinesFromItems, type NoteManagerSummary } from "./note-manager-adapter"
import type { ManagerItem } from "../state"
import type { SearchEverythingState, TuiScreen } from "../state"

export type SearchEverythingResultKind = "note" | "content" | "folder" | "command"
export type SearchEverythingMatchedField = "filename" | "key" | "title" | "description" | "path"
export type SearchEverythingTypeIcon = SearchEverythingResultKind

export interface TuiCommandDefinition {
  name: `/${string}`
  description: string
  usage: string
  shortcut?: string
}

export interface SearchEverythingDependencies {
  noteSummaries: readonly NoteManagerSummary[]
  searchNotes: (query: string) => readonly SearchNoteMatch[]
}

export interface SearchEverythingBaseResult {
  kind: SearchEverythingResultKind
  typeLabel?: SearchEverythingResultKind
  typeIcon?: SearchEverythingTypeIcon
  id: string
  label: string
  detail: string
  score: number
}

export interface SearchEverythingNoteResult extends SearchEverythingBaseResult {
  kind: "note"
  key: string
  filename: string
  title: string
  description: string
  relativePath: string
  matchedFields: SearchEverythingMatchedField[]
}

export interface SearchEverythingContentResult extends SearchEverythingBaseResult {
  kind: "content"
  key: string
  title: string
  relativePath: string
  matchIndex: number
  lineNumber?: number
  offset?: number
  matchStart?: number
  matchEnd?: number
  matchLabel: string
  excerpt: string
}

export interface SearchEverythingFolderResult extends SearchEverythingBaseResult {
  kind: "folder"
  path: string
  name: string
  noteCount: number
  previewLines?: string[]
}

export interface SearchEverythingCommandResult extends SearchEverythingBaseResult, TuiCommandDefinition {
  kind: "command"
}

export type SearchEverythingResult =
  | SearchEverythingNoteResult
  | SearchEverythingContentResult
  | SearchEverythingFolderResult
  | SearchEverythingCommandResult

export interface SearchEverythingHighlightRange {
  start: number
  end: number
}

export interface SearchEverythingPreviewText {
  text: string
  highlights?: SearchEverythingHighlightRange[]
}

export interface SearchEverythingPreview {
  title: string
  subtitle: string
  lines: string[]
  sections: Array<{ label: string; lines: string[] }>
  titleText?: SearchEverythingPreviewText
  subtitleText?: SearchEverythingPreviewText
  linesText?: SearchEverythingPreviewText[]
  sectionsText?: Array<{ label: string; lines: SearchEverythingPreviewText[] }>
}

export const TUI_COMMANDS: readonly TuiCommandDefinition[] = [
  {
    name: "/new",
    description: "Create a new note and open it in the editor",
    usage: "/new [title]",
    shortcut: "N",
  },
  {
    name: "/archive",
    description: "Archive the selected or active note",
    usage: "/archive [note-key]",
    shortcut: "A",
  },
  {
    name: "/delete",
    description: "Delete the selected or active note after confirmation",
    usage: "/delete [note-key]",
    shortcut: "D",
  },
  {
    name: "/rebuild",
    description: "Rebuild BlueNote search indexes",
    usage: "/rebuild",
    shortcut: "R",
  },
  {
    name: "/migrate",
    description: "Migrate legacy BlueNote storage into the current layout",
    usage: "/migrate",
  },
  {
    name: "/find",
    description: "Find text in the active editor buffer",
    usage: "/find <query>",
    shortcut: "Ctrl+F",
  },
  {
    name: "/replace",
    description: "Find and replace text in the active editor buffer",
    usage: "/replace <query> <replacement>",
    shortcut: "Ctrl+H",
  },
  {
    name: "/save",
    description: "Save the active editor buffer",
    usage: "/save",
    shortcut: "Ctrl+S",
  },
]

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/gu, "/")
}

function filenameFor(path: string): string {
  const normalized = normalizePath(path)
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized
}

function folderNameFor(path: string): string {
  return filenameFor(path)
}

function containsScore(query: string, value: string): number {
  return scoreContainsMatch(value, query)
}

const caseInsensitiveCollator = new Intl.Collator(undefined, { sensitivity: "base", usage: "search" })
const combiningMarkPattern = /\p{Mark}/u
const variationSelectorPattern = /[\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]/u
const zeroWidthJoiner = "\u200d"

type GraphemeSegmenter = {
  segment(value: string): Iterable<{ index: number; segment: string }>
}

function getIntlSegmenter(): GraphemeSegmenter | undefined {
  const segmenterConstructor = (
    Intl as typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity?: "grapheme" }) => GraphemeSegmenter }
  ).Segmenter
  return segmenterConstructor ? new segmenterConstructor(undefined, { granularity: "grapheme" }) : undefined
}

const graphemeSegmenter = getIntlSegmenter()

function isGraphemeExtender(character: string): boolean {
  return combiningMarkPattern.test(character) || variationSelectorPattern.test(character)
}

function graphemeBoundaryOffsets(text: string): number[] {
  if (text.length === 0) {
    return [0]
  }

  if (graphemeSegmenter) {
    const boundaries = [0]
    for (const segment of graphemeSegmenter.segment(text)) {
      const end = segment.index + segment.segment.length
      if (end > boundaries.at(-1)!) {
        boundaries.push(end)
      }
    }
    return boundaries.at(-1) === text.length ? boundaries : [...boundaries, text.length]
  }

  const boundaries = [0]
  let previousCharacter = ""
  for (let offset = 0; offset < text.length;) {
    const character = text.slice(offset, offset + 2).codePointAt(0)!
    const current = String.fromCodePoint(character)
    if (offset > 0 && !isGraphemeExtender(current) && previousCharacter !== zeroWidthJoiner) {
      boundaries.push(offset)
    }
    offset += current.length
    previousCharacter = current
  }
  boundaries.push(text.length)
  return boundaries
}

function findCaseInsensitiveRanges(text: string, needle: string): SearchEverythingHighlightRange[] {
  if (needle.length === 0 || text.length === 0) {
    return []
  }

  const boundaries = graphemeBoundaryOffsets(text)
  const ranges: SearchEverythingHighlightRange[] = []
  let startIndex = 0
  while (startIndex < boundaries.length - 1) {
    const start = boundaries[startIndex]!
    let matchedEndIndex: number | undefined

    for (let endIndex = startIndex + 1; endIndex < boundaries.length; endIndex += 1) {
      const end = boundaries[endIndex]!
      const candidate = text.slice(start, end)
      if (caseInsensitiveCollator.compare(candidate, needle) === 0) {
        matchedEndIndex = endIndex
        ranges.push({ start, end })
        break
      }
    }

    startIndex = matchedEndIndex ?? startIndex + 1
  }

  return ranges
}

function normalizeNonOverlappingRanges(ranges: SearchEverythingHighlightRange[], textLength: number): SearchEverythingHighlightRange[] {
  const normalized = ranges
    .map((range) => {
      const rawStart = Number.isFinite(range.start) ? Math.trunc(range.start) : 0
      const rawEnd = Number.isFinite(range.end) ? Math.trunc(range.end) : 0
      const start = Math.max(0, Math.min(rawStart, textLength))
      const end = Math.max(0, Math.min(rawEnd, textLength))
      return { start, end }
    })
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || (right.end - right.start) - (left.end - left.start) || left.end - right.end)

  const nonOverlapping: SearchEverythingHighlightRange[] = []
  for (const range of normalized) {
    const previous = nonOverlapping.at(-1)
    if (!previous || range.start >= previous.end) {
      nonOverlapping.push(range)
    }
  }

  return nonOverlapping
}

export function collectCaseInsensitiveContainsRanges(text: string, query: string): SearchEverythingHighlightRange[] {
  const normalizedQuery = query.trim().replace(/\s+/gu, " ")
  const needles = normalizedQuery.length > 0
    ? findCaseInsensitiveRanges(text, normalizedQuery).length > 0
      ? [normalizedQuery]
      : normalizedQuery.split(/\s+/gu).filter((token) => token.length > 0)
    : []
  const ranges: SearchEverythingHighlightRange[] = []

  for (const needle of needles) {
    ranges.push(...findCaseInsensitiveRanges(text, needle))
  }

  return normalizeNonOverlappingRanges(ranges, text.length)
}

function previewText(text: string, query?: string): SearchEverythingPreviewText {
  const highlights = query ? collectCaseInsensitiveContainsRanges(text, query) : []
  return highlights.length > 0 ? { text, highlights } : { text }
}

function withHighlightedPreviewText(
  preview: Omit<SearchEverythingPreview, "titleText" | "subtitleText" | "linesText" | "sectionsText">,
  query?: string,
): SearchEverythingPreview {
  if (!query || query.trim().length === 0) {
    return preview
  }

  return {
    ...preview,
    titleText: previewText(preview.title, query),
    subtitleText: previewText(preview.subtitle, query),
    linesText: preview.lines.map((line) => previewText(line, query)),
    sectionsText: preview.sections.map((section) => ({
      label: section.label,
      lines: section.lines.map((line) => previewText(line, query)),
    })),
  }
}

function foldersFor(relativePath: string): string[] {
  const parts = normalizePath(relativePath).split("/").filter(Boolean)

  if (parts.length <= 2 || parts[0] !== "notes") {
    return []
  }

  return parts.slice(1, -1).map((_, index) => ["notes", ...parts.slice(1, index + 2)].join("/"))
}

interface SearchEverythingFolderCandidate {
  path: string
  noteCount: number
}

function collectFolderCandidates(managerItems: readonly ManagerItem[]): SearchEverythingFolderCandidate[] {
  const folderCounts = new Map<string, number>()

  for (const item of managerItems) {
    if (item.type !== "note") {
      continue
    }

    for (const folder of foldersFor(item.relativePath)) {
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
    }
  }

  return Array.from(folderCounts.entries()).map(([path, noteCount]) => ({ path, noteCount }))
}

function buildFolderResult(path: string, noteCount: number, managerItems: readonly ManagerItem[]): SearchEverythingFolderResult {
  const name = folderNameFor(path)

  return {
    kind: "folder",
    typeLabel: "folder",
    typeIcon: "folder",
    id: `folder:${path}`,
    path,
    name,
    label: `${name}/`,
    detail: `${noteCount} ${noteCount === 1 ? "note" : "notes"} in ${path}`,
    score: 0,
    noteCount,
    previewLines: buildManagerFolderPreviewLinesFromItems(managerItems, path),
  }
}

function buildNoteResult(query: string, summary: NoteManagerSummary): SearchEverythingNoteResult | null {
  const relativePath = normalizePath(summary.relativePath)
  const filename = filenameFor(relativePath)
  const filenameStem = filename.replace(/\.[^.]*$/u, "")
  const queryStem = query.replace(/\.[^.\s/\\]*$/u, "")
  const fieldScores = new Map<SearchEverythingMatchedField, number>()

  for (const match of [
    ...collectContainsFieldMatches(query, [
      { field: "filename", value: filename },
      { field: "key", value: summary.key },
      { field: "key", value: filenameStem },
      { field: "title", value: summary.title },
      { field: "description", value: summary.description },
      { field: "path", value: relativePath },
    ]),
    ...collectContainsFieldMatches(queryStem, [{ field: "key", value: summary.key }]),
  ]) {
    const field = match.field as SearchEverythingMatchedField
    fieldScores.set(field, Math.max(fieldScores.get(field) ?? 0, match.score))
  }

  const orderedFields: readonly SearchEverythingMatchedField[] = ["filename", "key", "title", "description", "path"]
  const fields: Array<{ field: SearchEverythingMatchedField; score: number }> = orderedFields.flatMap((field) => {
    const score = fieldScores.get(field)
    return score ? [{ field, score }] : []
  })

  if (fields.length === 0) {
    return null
  }

  const score = Math.max(...fields.map((field) => field.score))

  return {
    kind: "note",
    typeLabel: "note",
    typeIcon: "note",
    id: `note:${summary.key}`,
    key: summary.key,
    filename,
    title: summary.title,
    description: summary.description,
    relativePath,
    label: summary.title,
    detail: `${filename} — ${relativePath}`,
    score,
    matchedFields: fields.map((field) => field.field),
  }
}

type ContentMatchContext = {
  matchIndex?: number
  lineNumber?: number
  line?: number
  offset?: number
  start?: number
  end?: number
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function contentResultId(match: SearchNoteMatch, occurrenceIndex: number, context: ContentMatchContext): string {
  const idParts = [
    "content",
    match.key,
    encodeURIComponent(match.match.label),
    finiteInteger(context.matchIndex) ?? occurrenceIndex,
  ]

  const lineNumber = finiteInteger(context.lineNumber) ?? finiteInteger(context.line)
  const offset = finiteInteger(context.offset) ?? finiteInteger(context.start)
  if (lineNumber !== undefined) {
    idParts.push(`line${lineNumber}`)
  }
  if (offset !== undefined) {
    idParts.push(`offset${offset}`)
  }

  return idParts.join(":")
}

function buildContentResults(query: string, deps: SearchEverythingDependencies): SearchEverythingContentResult[] {
  if (query.trim().length === 0) {
    return []
  }

  return deps
    .searchNotes(query)
    .filter((match) => match.match.source === "content")
    .map((match, occurrenceIndex) => {
      const context = match.match as typeof match.match & ContentMatchContext
      const lineNumber = finiteInteger(context.lineNumber) ?? finiteInteger(context.line)
      const offset = finiteInteger(context.offset) ?? finiteInteger(context.start)
      const matchStart = finiteInteger(context.start)
      const matchEnd = finiteInteger(context.end)

      return {
        kind: "content",
        typeLabel: "content",
        typeIcon: "content",
        id: contentResultId(match, occurrenceIndex, context),
        key: match.key,
        title: match.title,
        relativePath: normalizePath(match.relativePath),
        label: match.title,
        detail: `${match.match.label} — ${normalizePath(match.relativePath)}`,
        score: 100,
        matchIndex: finiteInteger(context.matchIndex) ?? occurrenceIndex,
        ...(lineNumber !== undefined ? { lineNumber } : {}),
        ...(offset !== undefined ? { offset } : {}),
        ...(matchStart !== undefined ? { matchStart } : {}),
        ...(matchEnd !== undefined ? { matchEnd } : {}),
        matchLabel: match.match.label,
        excerpt: match.match.excerpt ?? match.match.label,
      }
    })
}

function buildFolderResults(query: string, noteSummaries: readonly NoteManagerSummary[]): SearchEverythingFolderResult[] {
  const managerItems = buildManagerBrowserItems(noteSummaries)
  return collectFolderCandidates(managerItems)
    .map((folder) => {
      const name = folderNameFor(folder.path)
      return {
        ...folder,
        name,
        score: Math.max(containsScore(query, folder.path), containsScore(query, name)),
      }
    })
    .filter((folder) => folder.score > 0)
    .map((folder) => ({
      ...buildFolderResult(folder.path, folder.noteCount, managerItems),
      score: folder.score,
    }))
}

function strictCommandScore(query: string, commandName: string): number {
  return scoreContainsMatch(commandName, query)
}

function buildCommandResults(query: string): SearchEverythingCommandResult[] {
  const trimmedQuery = query.trim()
  const commandQuery = trimmedQuery.split(/\s+/u)[0] ?? ""

  if (!trimmedQuery.startsWith("/")) {
    return []
  }

  return TUI_COMMANDS.map<SearchEverythingCommandResult>((command) => ({
    kind: "command",
    typeLabel: "command",
    typeIcon: "command",
    id: `command:${command.name}`,
    label: command.name,
    detail: command.description,
    score: strictCommandScore(commandQuery, command.name),
    ...command,
  })).filter((command) => command.score > 0)
}

function kindPriority(kind: SearchEverythingResultKind): number {
  switch (kind) {
    case "folder":
      return 0
    case "note":
      return 1
    case "content":
      return 2
    case "command":
      return 3
  }
}

export function buildSearchEverythingResults(
  query: string,
  deps: SearchEverythingDependencies,
): SearchEverythingResult[] {
  const trimmedQuery = query.trim()

  if (trimmedQuery.length === 0) {
    return []
  }

  const results: SearchEverythingResult[] = [
    ...buildFolderResults(trimmedQuery, deps.noteSummaries),
    ...deps.noteSummaries.flatMap((summary) => {
      const result = buildNoteResult(trimmedQuery, summary)
      return result ? [result] : []
    }),
    ...buildContentResults(trimmedQuery, deps),
    ...buildCommandResults(trimmedQuery),
  ]

  return results.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    const priorityDifference = kindPriority(left.kind) - kindPriority(right.kind)
    if (priorityDifference !== 0) {
      return priorityDifference
    }

    return left.label.localeCompare(right.label)
  })
}

export function buildSearchEverythingPreview(result: SearchEverythingResult | null | undefined, query?: string): SearchEverythingPreview | null {
  if (!result) {
    return null
  }

  if (result.kind === "command") {
    const risk = result.name === "/delete" ? "destructive" : result.name === "/migrate" || result.name === "/rebuild" ? "maintenance" : null
    const availability = result.name === "/save" ? "available" : "unavailable"
    const sections = [
      { label: "Usage", lines: [result.usage] },
      ...(result.shortcut ? [{ label: "Shortcut", lines: [result.shortcut] }] : []),
      ...(risk ? [{ label: "Risk", lines: [risk] }] : []),
      { label: "Availability", lines: [availability] },
    ]

    return {
      title: result.name,
      subtitle: result.description,
      lines: [`Usage: ${result.usage}`, ...(result.shortcut ? [`Shortcut: ${result.shortcut}`] : []), ...(risk ? [`Risk: ${risk}`] : []), `Availability: ${availability}`],
      sections,
    }
  }

  if (result.kind === "content") {
    return withHighlightedPreviewText({
      title: result.title,
      subtitle: `${result.matchLabel} — ${result.relativePath}`,
      lines: [result.excerpt],
      sections: [
        { label: "Match", lines: [result.matchLabel] },
        { label: "Excerpt", lines: [result.excerpt] },
      ],
    }, query)
  }

  if (result.kind === "folder") {
    const lines = result.previewLines && result.previewLines.length > 0 ? result.previewLines : []
    return withHighlightedPreviewText({
      title: result.path,
      subtitle: "Folder contents",
      lines,
      sections: [
        { label: "Items", lines },
      ],
    }, query)
  }

  return withHighlightedPreviewText({
    title: `${result.title} · ${result.filename}`,
    subtitle: result.relativePath,
    lines: [result.description],
    sections: [
      { label: "Summary", lines: [result.description] },
    ],
  }, query)
}

export function buildHighlightedSearchEverythingPreview(
  results: readonly SearchEverythingResult[],
  selectedIndex: number,
  query?: string,
): SearchEverythingPreview | null {
  const index = Math.max(0, Math.min(Math.trunc(selectedIndex), results.length - 1))
  return buildSearchEverythingPreview(results[index], query)
}

export function createSearchEverythingSession(
  invokingScreen: Exclude<TuiScreen, "search">,
  query = "",
  selectedIndex = 0,
): SearchEverythingState {
  return {
    query,
    selectedIndex,
    previousScreen: invokingScreen,
  }
}
