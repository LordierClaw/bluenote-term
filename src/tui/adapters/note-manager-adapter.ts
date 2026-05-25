import type { NoteSummary } from "../../core/list-notes"
import type { ShowNoteSummary } from "../../core/show-note"
import type { ManagerItem, ManagerState, TuiNote } from "../state"

export type NoteManagerSummary = NoteSummary

export type MoveManagerSelectionDirection = "up" | "down" | "first" | "last"

export interface MoveManagerSelectionOptions {
  wrap?: boolean
}

export interface OpenManagerSelectionDependencies {
  showNote: (selector: string) => ShowNoteSummary | TuiNote
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

function selectedNoteKeyFor(items: ManagerItem[], focusedIndex: number): string | null {
  const focused = items[focusedIndex]
  return focused?.type === "note" ? focused.key : null
}

function clampIndex(index: number, max: number): number {
  return Math.min(Math.max(index, 0), max)
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

  return {
    key: note.key,
    title: note.title,
    description: note.description,
    relativePath: note.relativePath,
    body: note.body,
  }
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
