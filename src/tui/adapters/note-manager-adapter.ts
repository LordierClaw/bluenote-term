import type { NoteSummary } from "../../core/list-notes"
import type { ShowNoteSummary } from "../../core/show-note"
import { collectContainsFieldMatches } from "../../search/contains-match"
import type { ManagerItem, ManagerState, TuiNote } from "../state"

export interface NoteManagerSummary extends NoteSummary {
  body?: string
}

export type MoveManagerSelectionDirection = "up" | "down" | "first" | "last"

export interface MoveManagerSelectionOptions {
  wrap?: boolean
}

export interface OpenManagerSelectionDependencies {
  showNote: (selector: string) => ShowNoteSummary | TuiNote
}

export interface OpenManagerBrowserItemDependencies {
  showNote: (selector: string) => ShowNoteSummary | TuiNote
}

export interface ManagerBrowserRow extends ManagerItem {
  index: number
  focused: boolean
  selected: boolean
  columns: {
    filename: string
    title: string
    description: string
  }
  rowStyleIntent: "folder" | "note"
}

export interface BuildManagerBrowserModelOptions {
  previewVisible?: boolean
  hiddenReason?: "manual" | "responsive"
  getPreviewBody?: (item: ManagerItem) => string | undefined
}

export type ManagerPreviewModel =
  | {
      type: "empty"
      path: null
      rows?: undefined
      noteKey?: undefined
      title?: undefined
      description?: undefined
      contentLines?: undefined
    }
  | {
      type: "hidden"
      path: string | null
      reason: "manual" | "responsive"
      rows?: undefined
      noteKey?: undefined
      title?: undefined
      description?: undefined
      contentLines?: undefined
    }
  | {
      type: "folder"
      path: string
      rows: ManagerBrowserRow[]
      noteKey?: undefined
      title?: undefined
      description?: undefined
      contentLines?: undefined
    }
  | {
      type: "note-content"
      path: string
      noteKey: string
      title: string
      description: string
      contentLines: string[]
      rows?: undefined
    }

export interface ManagerBrowserModel {
  layout1Rows: ManagerBrowserRow[]
  preview: ManagerPreviewModel
  currentFolderPath: string
  hoveredPath: string | null
  focusedIndex: number
  empty: boolean
  state: ManagerState
}

export type OpenManagerBrowserItemResult =
  | { type: "folder"; state: ManagerState }
  | { type: "note"; note: TuiNote }
  | { type: "none"; state: ManagerState }

export interface FocusedManagerBrowserItemResult {
  item: ManagerItem | null
  focusedIndex: number
}

export interface ManagerRowViewModel extends ManagerItem {
  index: number
  focused: boolean
  selected: boolean
  displayName: string
  detail: string
}

export interface ManagerViewModel {
  rows: ManagerRowViewModel[]
  focusedIndex: number
  selectedNoteKey: string | null
  empty: boolean
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replaceAll("\\", "/").replace(/\/+/gu, "/")
}

function normalizeManagerFolderPath(path: string | null | undefined): string {
  const normalizedPath = normalizeRelativePath(path ?? "").replace(/^\/+|\/+$/gu, "")

  return normalizedPath === "notes" ? "" : normalizedPath
}

function filenameFor(relativePath: string): string {
  const normalizedPath = normalizeRelativePath(relativePath)
  return normalizedPath.split("/").filter(Boolean).at(-1) ?? normalizedPath
}

function foldersFor(relativePath: string): string[] {
  const normalizedPath = normalizeRelativePath(relativePath)
  const parts = normalizedPath.split("/").filter(Boolean)

  if (parts.length <= 2 || parts[0] !== "notes") {
    return []
  }

  return parts.slice(1, -1).map((_, index) => ["notes", ...parts.slice(1, index + 2)].join("/"))
}

function titleizeFolderName(folderPath: string): string {
  const name = filenameFor(folderPath)

  return name
    .split(/[-_\s]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function noteCountDescription(count: number): string {
  return `${count} ${count === 1 ? "note" : "notes"}`
}

function cloneItem(item: ManagerItem): ManagerItem {
  return { ...item }
}

function isBlueNoteNotePath(relativePath: string): boolean {
  const normalizedPath = normalizeRelativePath(relativePath)
  const parts = normalizedPath.split("/").filter(Boolean)

  return parts.length >= 2 && parts[0] === "notes" && parts.every((part) => !part.startsWith(".")) && normalizedPath.endsWith(".md")
}

function noteItemForSummary(summary: NoteManagerSummary): ManagerItem | null {
  const relativePath = normalizeRelativePath(summary.relativePath)

  if (!isBlueNoteNotePath(relativePath)) {
    return null
  }

  return {
    type: "note",
    key: summary.key,
    filename: filenameFor(relativePath) || summary.key,
    title: summary.title,
    description: summary.description,
    relativePath,
  }
}

function allBrowserItems(noteSummaries: readonly NoteManagerSummary[]): ManagerItem[] {
  const folderPaths = new Set<string>()
  const noteItems: ManagerItem[] = []

  for (const summary of noteSummaries) {
    const noteItem = noteItemForSummary(summary)

    if (!noteItem) {
      continue
    }

    noteItems.push(noteItem)

    const parts = noteItem.relativePath.split("/").filter(Boolean)
    for (let index = 1; index < parts.length - 1; index += 1) {
      folderPaths.add(parts.slice(0, index + 1).join("/"))
    }
  }

  const folderItems = Array.from(folderPaths).map<ManagerItem>((folderPath) => ({
    type: "folder",
    key: folderPath,
    filename: filenameFor(folderPath),
    title: "",
    description: "",
    relativePath: folderPath,
  }))

  return [...folderItems, ...noteItems].sort(compareBrowserItems)
}

function compareBrowserItems(left: ManagerItem, right: ManagerItem): number {
  if (left.type !== right.type) {
    return left.type === "folder" ? -1 : 1
  }

  const nameComparison = left.filename.localeCompare(right.filename)
  return nameComparison !== 0 ? nameComparison : left.relativePath.localeCompare(right.relativePath)
}

function immediateRowsForFolder(items: readonly ManagerItem[], currentFolderPath: string): ManagerItem[] {
  const folderPath = normalizeManagerFolderPath(currentFolderPath)
  const parentParts = folderPath ? folderPath.split("/").filter(Boolean) : ["notes"]

  return items
    .filter((item) => {
      const itemParts = item.relativePath.split("/").filter(Boolean)

      if (item.type === "folder") {
        return itemParts.length === parentParts.length + 1 && parentParts.every((part, index) => itemParts[index] === part)
      }

      return itemParts.length === parentParts.length + 1 && parentParts.every((part, index) => itemParts[index] === part)
    })
    .sort(compareBrowserItems)
}

function filterRows(rows: readonly ManagerItem[], query: string): ManagerItem[] {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) {
    return [...rows]
  }

  return rows.filter(
    (row) =>
      collectContainsFieldMatches(normalizedQuery, [
        { field: "filename", value: row.filename },
        { field: "key", value: row.key },
        { field: "title", value: row.title },
        { field: "description", value: row.description },
        { field: "path", value: row.relativePath },
      ]).length > 0,
  )
}

function browserRowFor(item: ManagerItem, index: number, focused: boolean, selectedNoteKey: string | null): ManagerBrowserRow {
  return {
    ...item,
    index,
    focused,
    selected: item.type === "note" && item.key === selectedNoteKey,
    columns: {
      filename: item.filename,
      title: item.type === "folder" ? "" : item.title,
      description: item.type === "folder" ? "" : item.description,
    },
    rowStyleIntent: item.type,
  }
}

function browserRowsFor(items: readonly ManagerItem[], focusedPath: string | null, selectedNoteKey: string | null): ManagerBrowserRow[] {
  return items.map((item, index) => browserRowFor(item, index, item.relativePath === focusedPath, selectedNoteKey))
}

function noteContentPreview(
  item: ManagerItem,
  noteSummaries: readonly NoteManagerSummary[],
  options: BuildManagerBrowserModelOptions,
): ManagerPreviewModel {
  const summary = noteSummaries.find((candidate) => normalizeRelativePath(candidate.relativePath) === item.relativePath)
  const body = summary?.body ?? options.getPreviewBody?.(item) ?? ""
  const bodyLines = body.split(/\r?\n/u)
  if (bodyLines.at(-1) === "") {
    bodyLines.pop()
  }

  return {
    type: "note-content",
    path: item.relativePath,
    noteKey: item.key,
    title: item.title,
    description: item.description,
    contentLines: bodyLines,
  }
}

function folderPreview(items: readonly ManagerItem[], folderPath: string, selectedNoteKey: string | null): ManagerPreviewModel {
  const previewItems = immediateRowsForFolder(items, folderPath)

  return {
    type: "folder",
    path: folderPath,
    rows: browserRowsFor(previewItems, null, selectedNoteKey),
  }
}

function selectedNoteKeyFor(items: ManagerItem[], focusedIndex: number): string | null {
  const focused = items[focusedIndex]
  return focused?.type === "note" ? focused.key : null
}

function clampIndex(index: number, max: number): number {
  return Math.min(Math.max(index, 0), max)
}

export function buildManagerBrowserModel(
  noteSummaries: readonly NoteManagerSummary[],
  state: ManagerState,
  options: BuildManagerBrowserModelOptions = {},
): ManagerBrowserModel {
  const items = allBrowserItems(noteSummaries)
  const currentFolderPath = normalizeManagerFolderPath(state.currentFolderPath)
  const filterQuery = state.filterQuery ?? ""
  const visibleItems = filterRows(immediateRowsForFolder(items, currentFolderPath), filterQuery)
  const focusedIndex = visibleItems.length === 0 ? 0 : clampIndex(state.focusedIndex, visibleItems.length - 1)
  const requestedHoveredPath = state.hoveredPath ?? null
  const hoveredItem = visibleItems.find((item) => item.relativePath === requestedHoveredPath) ?? visibleItems[focusedIndex] ?? null
  const hoveredPath = hoveredItem?.relativePath ?? null
  const layout1Rows = browserRowsFor(visibleItems, hoveredPath, state.selectedNoteKey)

  const preview: ManagerPreviewModel = options.previewVisible === false
    ? { type: "hidden", path: hoveredPath, reason: options.hiddenReason ?? "manual" }
    : !hoveredItem
      ? { type: "empty", path: null }
      : hoveredItem.type === "folder"
        ? folderPreview(items, hoveredItem.relativePath, state.selectedNoteKey)
        : noteContentPreview(hoveredItem, noteSummaries, options)

  return {
    layout1Rows,
    preview,
    currentFolderPath,
    hoveredPath,
    focusedIndex,
    empty: layout1Rows.length === 0,
    state: {
      ...state,
      items: items.map(cloneItem),
      focusedIndex,
      currentFolderPath,
      hoveredPath,
      filterQuery,
    },
  }
}

export function focusedManagerBrowserItem(state: ManagerState): FocusedManagerBrowserItemResult {
  const currentFolderPath = normalizeManagerFolderPath(state.currentFolderPath)
  const visibleItems = filterRows(immediateRowsForFolder(state.items, currentFolderPath), state.filterQuery ?? "")
  const focusedIndex = visibleItems.length === 0 ? 0 : clampIndex(state.focusedIndex, visibleItems.length - 1)
  const requestedHoveredPath = state.hoveredPath ?? null
  const hoveredItem = visibleItems.find((item) => item.relativePath === requestedHoveredPath) ?? null

  return {
    item: hoveredItem ?? visibleItems[focusedIndex] ?? null,
    focusedIndex,
  }
}

export function openManagerBrowserItem(
  state: ManagerState,
  deps: OpenManagerBrowserItemDependencies,
): OpenManagerBrowserItemResult {
  const { item: focused } = focusedManagerBrowserItem(state)

  if (!focused) {
    return {
      type: "none",
      state: {
        ...state,
        items: state.items.map(cloneItem),
      },
    }
  }

  if (focused.type === "folder") {
    return {
      type: "folder",
      state: {
        ...state,
        items: state.items.map(cloneItem),
        focusedIndex: 0,
        currentFolderPath: normalizeManagerFolderPath(focused.relativePath),
        hoveredPath: null,
        filterQuery: state.filterQuery ?? "",
      },
    }
  }

  const note = deps.showNote(focused.key)

  return {
    type: "note",
    note: { ...note },
  }
}

export function goToManagerParent(state: ManagerState): ManagerState {
  const currentFolderPath = normalizeManagerFolderPath(state.currentFolderPath)

  if (!currentFolderPath) {
    return state
  }

  const parentPath = currentFolderPath.includes("/") ? currentFolderPath.split("/").slice(0, -1).join("/") : ""

  return {
    ...state,
    items: state.items.map(cloneItem),
    focusedIndex: 0,
    currentFolderPath: parentPath,
    hoveredPath: null,
    filterQuery: state.filterQuery ?? "",
  }
}

export function buildManagerItems(noteSummaries: readonly NoteManagerSummary[]): ManagerItem[] {
  const folderCounts = new Map<string, number>()
  const noteItems = noteSummaries.map<ManagerItem>((summary) => {
    const relativePath = normalizeRelativePath(summary.relativePath)

    for (const folder of foldersFor(relativePath)) {
      folderCounts.set(folder, (folderCounts.get(folder) ?? 0) + 1)
    }

    return {
      type: "note",
      key: summary.key,
      filename: filenameFor(relativePath) || summary.key,
      title: summary.title,
      description: summary.description,
      relativePath,
    }
  })

  const folderItems = Array.from(folderCounts.entries()).map<ManagerItem>(([folder, count]) => ({
    type: "folder",
    key: folder,
    filename: filenameFor(folder),
    title: titleizeFolderName(folder),
    description: noteCountDescription(count),
    relativePath: folder,
  }))

  return [...folderItems, ...noteItems].sort((left, right) => {
    const pathComparison = left.relativePath.localeCompare(right.relativePath)

    if (pathComparison !== 0) {
      return pathComparison
    }

    if (left.type === right.type) {
      return left.key.localeCompare(right.key)
    }

    return left.type === "folder" ? -1 : 1
  })
}

export function moveManagerSelection(
  state: ManagerState,
  direction: MoveManagerSelectionDirection,
  options: MoveManagerSelectionOptions = {},
): ManagerState {
  const items = state.items.map(cloneItem)

  if (items.length === 0) {
    return {
      items,
      focusedIndex: 0,
      selectedNoteKey: null,
    }
  }

  const maxIndex = items.length - 1
  const currentIndex = clampIndex(state.focusedIndex, maxIndex)
  let nextIndex = currentIndex

  if (direction === "first") {
    nextIndex = 0
  } else if (direction === "last") {
    nextIndex = maxIndex
  } else if (direction === "up") {
    nextIndex = currentIndex - 1
  } else {
    nextIndex = currentIndex + 1
  }

  if (options.wrap && direction === "up" && currentIndex === 0) {
    nextIndex = maxIndex
  } else if (options.wrap && direction === "down" && currentIndex === maxIndex) {
    nextIndex = 0
  } else {
    nextIndex = clampIndex(nextIndex, maxIndex)
  }

  return {
    items,
    focusedIndex: nextIndex,
    selectedNoteKey: selectedNoteKeyFor(items, nextIndex),
  }
}

export function openManagerSelection(
  state: ManagerState,
  deps: OpenManagerSelectionDependencies,
): TuiNote | null {
  const focused = state.items[state.focusedIndex]

  if (!focused || focused.type !== "note") {
    return null
  }

  const note = deps.showNote(focused.key)

  return { ...note }
}

export function buildManagerViewModel(state: ManagerState): ManagerViewModel {
  const focusedIndex = state.items.length === 0 ? 0 : clampIndex(state.focusedIndex, state.items.length - 1)

  return {
    rows: state.items.map((item, index) => ({
      ...item,
      index,
      focused: index === focusedIndex,
      selected: item.type === "note" && item.key === state.selectedNoteKey,
      displayName: item.type === "folder" ? `${item.filename}/` : item.filename,
      detail: `${item.title} — ${item.description}`,
    })),
    focusedIndex,
    selectedNoteKey: state.selectedNoteKey,
    empty: state.items.length === 0,
  }
}
