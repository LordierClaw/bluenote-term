import type { SearchNoteMatch } from "../../core/search-notes"
import { collectContainsFieldMatches, scoreContainsMatch } from "../../search/contains-match"
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

function containsScore(query: string, value: string): number {
  return scoreContainsMatch(value, query)
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
      score: Math.max(containsScore(query, folder.path), containsScore(query, folder.name)),
    }))
    .filter((folder) => folder.score > 0)
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
