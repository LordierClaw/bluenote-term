import {
  buildManagerItems,
  moveManagerSelection,
  openManagerSelection,
  type MoveManagerSelectionDirection,
  type NoteManagerSummary,
} from "./adapters/note-manager-adapter"
import {
  buildSearchEverythingResults,
  type SearchEverythingResult,
} from "./adapters/search-everything-adapter"
import {
  closeSearchEverything,
  createInitialTuiState,
  markEditorBodyChanged,
  openEditorForNote,
  openSearchEverything,
  type ManagerItem,
  type TuiNote,
  type TuiState,
} from "./state"
import type { SearchNoteMatch } from "../core/search-notes"

export type WorkspaceActionBlockedReason = "dirty-editor"

export interface WorkspaceActionOptions {
  confirmed?: boolean
}

export interface WorkspaceActionResult {
  blocked: boolean
  reason?: WorkspaceActionBlockedReason
}

export interface WorkspaceCommandContext {
  state: TuiState
  command: string
}

export type WorkspaceCommandHandler = (context: WorkspaceCommandContext) => void

export interface WorkspaceControllerDependencies {
  listNotes: () => readonly NoteManagerSummary[]
  showNote: (selector: string) => TuiNote
  searchNotes: (query: string) => readonly SearchNoteMatch[]
  commandHandlers?: Partial<Record<string, WorkspaceCommandHandler>>
}

export interface WorkspaceController {
  getState: () => TuiState
  getSearchResults: () => readonly SearchEverythingResult[]
  refreshManager: () => void
  focusManagerItem: (index: number) => void
  moveManagerSelection: (direction: MoveManagerSelectionDirection, options?: { wrap?: boolean }) => void
  openFocusedManagerItem: (options?: WorkspaceActionOptions) => WorkspaceActionResult
  showManager: () => WorkspaceActionResult
  showEditor: () => WorkspaceActionResult
  updateEditorBody: (body: string) => void
  openSearch: (query?: string) => void
  updateSearchQuery: (query: string) => void
  cancelSearch: () => void
  selectSearchResult: (result?: SearchEverythingResult, options?: WorkspaceActionOptions) => WorkspaceActionResult
  runCommand: (command: string, options?: WorkspaceActionOptions) => WorkspaceActionResult
}

const ok = (): WorkspaceActionResult => ({ blocked: false })
const dirtyBlocked = (): WorkspaceActionResult => ({ blocked: true, reason: "dirty-editor" })

const destructiveCommands = new Set(["/archive", "/delete", "/migrate"])

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0
  }

  const finiteIndex = Number.isFinite(index) ? Math.trunc(index) : 0
  return Math.max(0, Math.min(finiteIndex, length - 1))
}

function selectedNoteKeyFor(item: ManagerItem | undefined): string | null {
  return item?.type === "note" ? item.key : null
}

function toTuiNote(note: TuiNote): TuiNote {
  return { ...note }
}

function cloneManagerItem(item: ManagerItem): ManagerItem {
  return { ...item }
}

function cloneSearchResult(result: SearchEverythingResult): SearchEverythingResult {
  if (result.kind === "note") {
    return {
      ...result,
      matchedFields: [...result.matchedFields],
    }
  }

  return { ...result }
}

function cloneStateSnapshot(source: TuiState): TuiState {
  return {
    ...source,
    manager: {
      ...source.manager,
      items: source.manager.items.map(cloneManagerItem),
    },
    editor: source.editor
      ? {
          ...source.editor,
          note: toTuiNote(source.editor.note),
        }
      : null,
    search: source.search ? { ...source.search } : null,
  }
}

function commandNameFor(command: string): string {
  return command.trim().split(/\s+/u)[0] ?? ""
}

function wouldReplaceDirtyEditor(state: TuiState, nextNoteKey: string): boolean {
  return Boolean(state.editor?.dirty && state.editor.note.key !== nextNoteKey)
}

function mustConfirmDirtyReplacement(state: TuiState, nextNoteKey: string, options: WorkspaceActionOptions): boolean {
  return wouldReplaceDirtyEditor(state, nextNoteKey) && options.confirmed !== true
}

function mustConfirmDirtyDestructiveAction(state: TuiState, command: string, options: WorkspaceActionOptions): boolean {
  return Boolean(state.editor?.dirty && destructiveCommands.has(commandNameFor(command)) && options.confirmed !== true)
}

export function createWorkspaceController(deps: WorkspaceControllerDependencies): WorkspaceController {
  let noteSummaries: readonly NoteManagerSummary[] = []
  let state = createInitialTuiState()
  let searchResults: SearchEverythingResult[] = []

  function refreshManager(): void {
    noteSummaries = deps.listNotes()
    const items = buildManagerItems(noteSummaries)
    const focusedIndex = clampIndex(state.manager.focusedIndex, items.length)
    const focusedItem = items[focusedIndex]

    state = {
      ...state,
      manager: {
        items,
        focusedIndex,
        selectedNoteKey: selectedNoteKeyFor(focusedItem),
      },
    }
  }

  function setEditorNote(note: TuiNote): void {
    state = openEditorForNote(state, toTuiNote(note))
  }

  function openNoteByKey(key: string, options: WorkspaceActionOptions = {}): WorkspaceActionResult {
    if (state.editor?.dirty && state.editor.note.key === key) {
      state = {
        ...state,
        screen: "editor",
        search: null,
      }
      return ok()
    }

    if (mustConfirmDirtyReplacement(state, key, options)) {
      return dirtyBlocked()
    }

    setEditorNote(deps.showNote(key))
    return ok()
  }

  function rebuildSearchResults(query: string): void {
    searchResults = buildSearchEverythingResults(query, {
      noteSummaries,
      searchNotes: deps.searchNotes,
    })
  }

  function focusFolder(path: string): void {
    const focusedIndex = state.manager.items.findIndex((item) => item.type === "folder" && item.relativePath === path)
    const nextFocusedIndex = focusedIndex === -1 ? state.manager.focusedIndex : focusedIndex

    state = {
      ...state,
      screen: "manager",
      search: null,
      manager: {
        ...state.manager,
        focusedIndex: nextFocusedIndex,
        selectedNoteKey: focusedIndex === -1 ? state.manager.selectedNoteKey : selectedNoteKeyFor(state.manager.items[nextFocusedIndex]),
      },
    }
  }

  const controller: WorkspaceController = {
    getState: () => cloneStateSnapshot(state),

    getSearchResults: () => searchResults.map(cloneSearchResult),

    refreshManager,

    focusManagerItem: (index) => {
      const focusedIndex = clampIndex(index, state.manager.items.length)
      state = {
        ...state,
        manager: {
          ...state.manager,
          focusedIndex,
          selectedNoteKey: selectedNoteKeyFor(state.manager.items[focusedIndex]),
        },
      }
    },

    moveManagerSelection: (direction, options = {}) => {
      state = {
        ...state,
        manager: moveManagerSelection(state.manager, direction, options),
      }
    },

    openFocusedManagerItem: (options = {}) => {
      const focused = state.manager.items[state.manager.focusedIndex]
      if (!focused || focused.type !== "note") {
        return ok()
      }

      if (state.editor?.dirty && state.editor.note.key === focused.key) {
        state = {
          ...state,
          screen: "editor",
          search: null,
        }
        return ok()
      }

      if (mustConfirmDirtyReplacement(state, focused.key, options)) {
        return dirtyBlocked()
      }

      const note = openManagerSelection(state.manager, { showNote: deps.showNote })
      if (!note) {
        return ok()
      }

      setEditorNote(note)
      return ok()
    },

    showManager: () => {
      state = {
        ...state,
        screen: "manager",
        search: null,
      }
      return ok()
    },

    showEditor: () => {
      if (state.editor) {
        state = {
          ...state,
          screen: "editor",
          search: null,
        }
      }
      return ok()
    },

    updateEditorBody: (body) => {
      state = markEditorBodyChanged(state, body)
    },

    openSearch: (query = "") => {
      state = openSearchEverything(state, { query })
      rebuildSearchResults(query)
    },

    updateSearchQuery: (query) => {
      if (!state.search) {
        return
      }

      state = {
        ...state,
        search: {
          ...state.search,
          query,
          selectedIndex: 0,
        },
      }
      rebuildSearchResults(query)
    },

    cancelSearch: () => {
      state = closeSearchEverything(state)
      searchResults = []
    },

    selectSearchResult: (result, options = {}) => {
      const selected = result ?? searchResults[state.search?.selectedIndex ?? 0]
      if (!selected) {
        return ok()
      }

      if (selected.kind === "note" || selected.kind === "content") {
        const actionResult = openNoteByKey(selected.key, options)
        if (actionResult.blocked) {
          return actionResult
        }
        searchResults = []
        return ok()
      }

      if (selected.kind === "folder") {
        focusFolder(selected.path)
        searchResults = []
        return ok()
      }

      if (mustConfirmDirtyDestructiveAction(state, selected.name, options)) {
        return dirtyBlocked()
      }
      const command = state.search?.query.trim().startsWith(selected.name) ? state.search.query : selected.name
      state = closeSearchEverything(state)
      const actionResult = controller.runCommand(command, options)
      if (actionResult.blocked) {
        return actionResult
      }
      searchResults = []
      return ok()
    },

    runCommand: (command, options = {}) => {
      if (mustConfirmDirtyDestructiveAction(state, command, options)) {
        return dirtyBlocked()
      }

      const commandName = commandNameFor(command)
      deps.commandHandlers?.[commandName]?.({ state: cloneStateSnapshot(state), command })
      return ok()
    },
  }

  refreshManager()

  return controller
}
