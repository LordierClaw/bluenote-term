import type { SearchNoteMatch } from "../../core/search-notes"
import type { NoteManagerSummary } from "./note-manager-adapter"
import type { SearchEverythingState, TuiScreen } from "../state"

export type SearchEverythingResultKind = "note" | "content" | "folder" | "command"
export type SearchEverythingMatchedField = "filename" | "key" | "title" | "description" | "path"

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
  matchLabel: string
  excerpt: string
}

export interface SearchEverythingFolderResult extends SearchEverythingBaseResult {
  kind: "folder"
  path: string
  name: string
  noteCount: number
}

export interface SearchEverythingCommandResult extends SearchEverythingBaseResult, TuiCommandDefinition {
  kind: "command"
}

export type SearchEverythingResult =
  | SearchEverythingNoteResult
  | SearchEverythingContentResult
  | SearchEverythingFolderResult
  | SearchEverythingCommandResult

export interface SearchEverythingPreview {
  title: string
  subtitle: string
  lines: string[]
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

function queryTokens(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (needle.length === 0) {
    return true
  }

  let needleIndex = 0
  for (const char of haystack) {
    if (char === needle[needleIndex]) {
      needleIndex += 1
      if (needleIndex === needle.length) {
        return true
      }
    }
  }

  return false
}

function fuzzyScore(query: string, value: string): number {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const normalizedValue = value.toLocaleLowerCase()

  if (normalizedQuery.length === 0 || normalizedValue.length === 0) {
    return 0
  }

  const tokens = queryTokens(query)
  if (tokens.length > 1 && tokens.every((token) => normalizedValue.includes(token))) {
    return 90 + normalizedQuery.length / Math.max(normalizedValue.length, 1)
  }

  if (normalizedValue === normalizedQuery) {
    return 120
  }

  if (normalizedValue.startsWith(normalizedQuery)) {
    return 105
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 80 + normalizedQuery.length / Math.max(normalizedValue.length, 1)
  }

  if (tokens.length > 1) {
    return 0
  }

  if (isSubsequence(normalizedQuery, normalizedValue)) {
    return 30 + normalizedQuery.length / Math.max(normalizedValue.length, 1)
  }

  return 0
}

function foldersFor(relativePath: string): string[] {
  const parts = normalizePath(relativePath).split("/").filter(Boolean)

  if (parts.length <= 2 || parts[0] !== "notes") {
    return []
  }

  return parts.slice(1, -1).map((_, index) => ["notes", ...parts.slice(1, index + 2)].join("/"))
}

function collectFolders(noteSummaries: readonly NoteManagerSummary[]): SearchEverythingFolderResult[] {
  const folderCounts = new Map<string, number>()

  for (const summary of noteSummaries) {
    for (const folder of foldersFor(summary.relativePath)) {
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
    }
  }

  return Array.from(folderCounts.entries()).map(([path, noteCount]) => {
    const name = folderNameFor(path)

    return {
      kind: "folder",
      id: `folder:${path}`,
      path,
      name,
      label: `${name}/`,
      detail: `${noteCount} ${noteCount === 1 ? "note" : "notes"} in ${path}`,
      score: 0,
      noteCount,
    }
  })
}

function buildNoteResult(query: string, summary: NoteManagerSummary): SearchEverythingNoteResult | null {
  const relativePath = normalizePath(summary.relativePath)
  const filename = filenameFor(relativePath)
  const filenameStem = filename.replace(/\.[^.]*$/u, "")
  const queryStem = query.replace(/\.[^.\s/\\]*$/u, "")
  const candidates: Array<{ field: SearchEverythingMatchedField; score: number }> = [
    { field: "filename", score: fuzzyScore(query, filename) },
    { field: "key", score: Math.max(fuzzyScore(query, summary.key), fuzzyScore(queryStem, summary.key), fuzzyScore(query, filenameStem)) },
    { field: "title", score: fuzzyScore(query, summary.title) },
    { field: "description", score: fuzzyScore(query, summary.description) },
    { field: "path", score: fuzzyScore(query, relativePath) },
  ]
  const fields = candidates.filter((field) => field.score > 0)

  if (fields.length === 0) {
    return null
  }

  const score = Math.max(...fields.map((field) => field.score))

  return {
    kind: "note",
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

function buildContentResults(query: string, deps: SearchEverythingDependencies): SearchEverythingContentResult[] {
  if (query.trim().length === 0) {
    return []
  }

  return deps
    .searchNotes(query)
    .filter((match) => match.match.source === "content")
    .map((match) => ({
      kind: "content",
      id: `content:${match.key}:${match.match.label}`,
      key: match.key,
      title: match.title,
      relativePath: normalizePath(match.relativePath),
      label: match.title,
      detail: `${match.match.label} — ${normalizePath(match.relativePath)}`,
      score: 100,
      matchLabel: match.match.label,
      excerpt: match.match.excerpt ?? match.match.label,
    }))
}

function buildFolderResults(query: string, noteSummaries: readonly NoteManagerSummary[]): SearchEverythingFolderResult[] {
  return collectFolders(noteSummaries)
    .map((folder) => ({
      ...folder,
      score: Math.max(fuzzyScore(query, folder.path), fuzzyScore(query, folder.name)),
    }))
    .filter((folder) => folder.score > 0)
}

function strictCommandScore(query: string, commandName: string): number {
  const normalizedQuery = query.toLocaleLowerCase()
  const normalizedName = commandName.toLocaleLowerCase()

  if (normalizedName === normalizedQuery) {
    return 120
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 105
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 80
  }

  return 0
}

function buildCommandResults(query: string): SearchEverythingCommandResult[] {
  const trimmedQuery = query.trim()
  const commandQuery = trimmedQuery.split(/\s+/u)[0] ?? ""

  if (!trimmedQuery.startsWith("/")) {
    return []
  }

  return TUI_COMMANDS.map<SearchEverythingCommandResult>((command) => ({
    kind: "command",
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

export function buildSearchEverythingPreview(result: SearchEverythingResult | null | undefined): SearchEverythingPreview | null {
  if (!result) {
    return null
  }

  if (result.kind === "command") {
    return {
      title: result.name,
      subtitle: result.description,
      lines: [`Usage: ${result.usage}`, ...(result.shortcut ? [`Shortcut: ${result.shortcut}`] : [])],
    }
  }

  if (result.kind === "content") {
    return {
      title: result.title,
      subtitle: `${result.matchLabel} — ${result.relativePath}`,
      lines: [result.excerpt],
    }
  }

  if (result.kind === "folder") {
    return {
      title: result.label,
      subtitle: result.path,
      lines: [result.detail],
    }
  }

  return {
    title: result.title,
    subtitle: `${result.filename} — ${result.relativePath}`,
    lines: [result.description],
  }
}

export function buildHighlightedSearchEverythingPreview(
  results: readonly SearchEverythingResult[],
  selectedIndex: number,
): SearchEverythingPreview | null {
  const index = Math.max(0, Math.min(Math.trunc(selectedIndex), results.length - 1))
  return buildSearchEverythingPreview(results[index])
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
