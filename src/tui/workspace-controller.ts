import type { SaveEditorBufferDependencies } from "./adapters/editor-buffer-adapter"
import {
  buildManagerBrowserModel,
  goToManagerParent,
  moveManagerSelection,
  openManagerBrowserItem,
  type MoveManagerSelectionDirection,
  type NoteManagerSummary,
} from "./adapters/note-manager-adapter"
import {
  buildSearchEverythingResults,
  type SearchEverythingResult,
} from "./adapters/search-everything-adapter"
import {
  clearManagerFilter as clearManagerFilterState,
  closeSearchEverything,
  closeTransientMode,
  createInitialTuiState,
  openEditorFind as openEditorFindState,
  markEditorBodyChanged,
  openEditorForNote,
  openSearchEverything,
  setManagerFilter as setManagerFilterState,
  type EditorBufferState,
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
  persistEditorBody?: SaveEditorBufferDependencies["persist"]
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
  saveEditor: () => Promise<WorkspaceActionResult>
  openSearch: (query?: string) => void
  updateSearchQuery: (query: string) => void
  focusSearchResult: (index: number) => void
  cancelSearch: () => void
  goBack: () => WorkspaceActionResult
  openManagerFilter: () => void
  setManagerFilter: (query: string) => void
  updateManagerFilter: (query: string) => void
  clearManagerFilter: () => void
  toggleSearch: (query?: string) => void
  openEditorFind: (query?: string) => void
  selectSearchResult: (result?: SearchEverythingResult, options?: WorkspaceActionOptions) => WorkspaceActionResult
  runCommand: (command: string, options?: WorkspaceActionOptions) => WorkspaceActionResult
}

const ok = (): WorkspaceActionResult => ({ blocked: false })
const dirtyBlocked = (): WorkspaceActionResult => ({ blocked: true, reason: "dirty-editor" })

const destructiveCommands = new Set(["/archive", "/delete", "/migrate", "/quit"])

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

export function editorRequiresDestructiveConfirmation(editor: EditorBufferState | null | undefined): boolean {
  return Boolean(editor?.dirty || editor?.autosaveStatus === "pending" || editor?.autosaveStatus === "saving" || editor?.autosaveStatus === "error")
}

function wouldReplaceDirtyEditor(state: TuiState, nextNoteKey: string): boolean {
  return Boolean(editorRequiresDestructiveConfirmation(state.editor) && state.editor?.note.key !== nextNoteKey)
}

function mustConfirmDirtyReplacement(state: TuiState, nextNoteKey: string, options: WorkspaceActionOptions): boolean {
  return wouldReplaceDirtyEditor(state, nextNoteKey) && options.confirmed !== true
}

function mustConfirmDirtyDestructiveAction(state: TuiState, command: string, options: WorkspaceActionOptions): boolean {
  return Boolean(editorRequiresDestructiveConfirmation(state.editor) && destructiveCommands.has(commandNameFor(command)) && options.confirmed !== true)
}

function applySavedEditor(state: TuiState, persistedNote: TuiNote, submittedBody = persistedNote.body): TuiState {
  if (state.editor?.note.key !== persistedNote.key) {
    return state
  }

  if (state.editor.body !== submittedBody) {
    return {
      ...state,
      editor: {
        ...state.editor,
        note: {
          ...state.editor.note,
          body: state.editor.body,
        },
        savedBody: persistedNote.body,
        dirty: state.editor.body !== persistedNote.body,
      },
    }
  }

  return {
    ...state,
    editor: {
      note: toTuiNote(persistedNote),
      body: persistedNote.body,
      savedBody: persistedNote.body,
      dirty: false,
    },
  }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === "function"
}

export function createWorkspaceController(deps: WorkspaceControllerDependencies): WorkspaceController {
  let noteSummaries: readonly NoteManagerSummary[] = []
  let state = createInitialTuiState()
  let searchResults: SearchEverythingResult[] = []

  function applyManagerBrowserModel(): void {
    const model = buildManagerBrowserModel(noteSummaries, state.manager)
    const items = model.layout1Rows.map(cloneManagerItem)
    const focusedIndex = clampIndex(model.focusedIndex, items.length)
    const focusedItem = items[focusedIndex]
    const previousSelectedNoteKey = state.manager.selectedNoteKey
    const selectedNoteStillExists = previousSelectedNoteKey
      ? noteSummaries.some((summary) => summary.key === previousSelectedNoteKey)
      : false
    const selectedNoteKey = selectedNoteKeyFor(focusedItem) ?? (selectedNoteStillExists ? previousSelectedNoteKey : null)

    state = {
      ...state,
      manager: {
        ...model.state,
        items,
        focusedIndex,
        selectedNoteKey,
        currentFolderPath: model.currentFolderPath,
        hoveredPath: model.hoveredPath,
        filterQuery: model.state.filterQuery ?? "",
      },
    }
  }

  function refreshManager(): void {
    noteSummaries = deps.listNotes()
    applyManagerBrowserModel()
  }

  function setEditorNote(note: TuiNote): void {
    state = openEditorForNote(state, toTuiNote(note))
  }

  function openNoteByKey(key: string, options: WorkspaceActionOptions = {}): WorkspaceActionResult {
    if (editorRequiresDestructiveConfirmation(state.editor) && state.editor?.note.key === key) {
      state = {
        ...state,
        screen: "editor",
        mode: "editor.body",
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
    state = {
      ...state,
      screen: "manager",
      mode: "manager.browse",
      search: null,
      manager: {
        ...state.manager,
        currentFolderPath: path,
        hoveredPath: null,
        focusedIndex: 0,
      },
    }
    applyManagerBrowserModel()
  }

  const controller: WorkspaceController = {
    getState: () => cloneStateSnapshot(state),

    getSearchResults: () => searchResults.map(cloneSearchResult),

    refreshManager,

    focusManagerItem: (index) => {
      const focusedIndex = clampIndex(index, state.manager.items.length)
      const focusedItem = state.manager.items[focusedIndex]
      state = {
        ...state,
        manager: {
          ...state.manager,
          focusedIndex,
          hoveredPath: focusedItem?.relativePath ?? null,
          selectedNoteKey: selectedNoteKeyFor(focusedItem),
        },
      }
      applyManagerBrowserModel()
    },

    moveManagerSelection: (direction, options = {}) => {
      const previousManager = state.manager
      const movedManager = moveManagerSelection(previousManager, direction, options)
      const focusedItem = movedManager.items[movedManager.focusedIndex]
      state = {
        ...state,
        manager: {
          ...previousManager,
          ...movedManager,
          currentFolderPath: previousManager.currentFolderPath,
          hoveredPath: focusedItem?.relativePath ?? null,
          filterQuery: previousManager.filterQuery ?? "",
        },
      }
      applyManagerBrowserModel()
    },

    openFocusedManagerItem: (options = {}) => {
      const focused = state.manager.items[state.manager.focusedIndex]
      if (!focused) {
        return ok()
      }

      if (focused.type === "folder") {
        const opened = openManagerBrowserItem(state.manager, { showNote: deps.showNote })
        if (opened.type === "folder") {
          state = {
            ...state,
            screen: "manager",
            mode: "manager.browse",
            search: null,
            manager: opened.state,
          }
          applyManagerBrowserModel()
        }
        return ok()
      }

      if (editorRequiresDestructiveConfirmation(state.editor) && state.editor?.note.key === focused.key) {
        state = {
          ...state,
          screen: "editor",
          mode: "editor.body",
          search: null,
        }
        return ok()
      }

      if (mustConfirmDirtyReplacement(state, focused.key, options)) {
        return dirtyBlocked()
      }

      const opened = openManagerBrowserItem(state.manager, { showNote: deps.showNote })
      if (opened.type !== "note") {
        return ok()
      }

      setEditorNote(opened.note)
      return ok()
    },

    goBack: () => {
      if (state.screen === "search" || state.mode === "editor.find" || state.mode === "editor.replace" || state.mode === "manager.filter") {
        state = closeTransientMode(state)
        if (state.screen === "manager") {
          applyManagerBrowserModel()
        }
        if (state.screen !== "search") {
          searchResults = []
        }
        return ok()
      }

      if (state.screen === "manager") {
        const nextManager = goToManagerParent(state.manager)
        state = {
          ...state,
          mode: "manager.browse",
          manager: nextManager,
        }
        applyManagerBrowserModel()
      }
      return ok()
    },

    openManagerFilter: () => {
      state = setManagerFilterState(state, state.manager.filterQuery ?? "")
      applyManagerBrowserModel()
    },

    setManagerFilter: (query) => {
      state = setManagerFilterState(state, query)
      applyManagerBrowserModel()
    },

    updateManagerFilter: (query) => {
      state = setManagerFilterState(state, query)
      applyManagerBrowserModel()
    },

    clearManagerFilter: () => {
      state = clearManagerFilterState(state)
      applyManagerBrowserModel()
    },

    toggleSearch: (query = "") => {
      if (state.screen === "search") {
        state = closeSearchEverything(state)
        searchResults = []
        return
      }

      controller.openSearch(query)
    },

    openEditorFind: (query = "") => {
      state = openEditorFindState(state, { query })
    },

    showManager: () => {
      state = {
        ...state,
        screen: "manager",
        mode: "manager.browse",
        search: null,
      }
      applyManagerBrowserModel()
      return ok()
    },

    showEditor: () => {
      if (state.editor) {
        state = {
          ...state,
          screen: "editor",
          mode: "editor.body",
          search: null,
        }
      }
      return ok()
    },

    updateEditorBody: (body) => {
      state = markEditorBodyChanged(state, body)
    },

    saveEditor: async () => {
      if (!state.editor) {
        return ok()
      }

      const persist = deps.persistEditorBody ?? ((note, body) => ({ ...note, body }))
      const noteToPersist = toTuiNote(state.editor.note)
      const submittedBody = state.editor.body
      const persistedNote = persist(noteToPersist, submittedBody)

      if (isPromiseLike(persistedNote)) {
        const savedNote = await persistedNote
        state = applySavedEditor(state, savedNote, submittedBody)
        return ok()
      }

      state = applySavedEditor(state, persistedNote, submittedBody)
      return ok()
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

    focusSearchResult: (index) => {
      if (!state.search) {
        return
      }

      state = {
        ...state,
        search: {
          ...state.search,
          selectedIndex: clampIndex(index, searchResults.length),
        },
      }
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
      if (commandName === "/save") {
        void controller.saveEditor()
        return ok()
      }

      deps.commandHandlers?.[commandName]?.({ state: cloneStateSnapshot(state), command })
      return ok()
    },
  }

  refreshManager()

  return controller
}
