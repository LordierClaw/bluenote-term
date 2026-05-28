import type { EditorCursorDirection, SaveEditorBufferDependencies } from "./adapters/editor-buffer-adapter"
import { advanceEditorFindState, backspaceAtEditorCursor, deleteAtEditorCursor, findInEditorBody, insertTextAtEditorCursor, moveEditorCursor } from "./adapters/editor-buffer-adapter"
import {
  buildManagerBrowserModel,
  goToManagerParent,
  moveManagerSelection,
  openManagerBrowserItem,
  type ManagerBrowserModel,
  type MoveManagerSelectionDirection,
  type NoteManagerSummary,
} from "./adapters/note-manager-adapter"
import {
  buildSearchEverythingResults,
  type SearchEverythingResult,
} from "./adapters/search-everything-adapter"
import {
  clearManagerFilter as clearManagerFilterState,
  cancelManagerCreate as cancelManagerCreateState,
  cancelManagerDeleteConfirm as cancelManagerDeleteConfirmState,
  closeSearchEverything,
  closeTransientMode,
  createInitialTuiState,
  openEditorFind as openEditorFindState,
  markAutosaveError,
  markAutosavePending,
  markAutosaveSaving,
  markEditorBodyChanged,
  openEditorForNote,
  openManagerCreate as openManagerCreateState,
  openManagerDeleteConfirm as openManagerDeleteConfirmState,
  openSearchEverything,
  setManagerCreateStatus,
  setManagerCreateTitle as setManagerCreateTitleState,
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

export interface WorkspaceDebounceScheduler {
  setTimeout: (callback: () => void, delay: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface WorkspaceControllerDependencies {
  listNotes: () => readonly NoteManagerSummary[]
  showNote: (selector: string) => TuiNote
  searchNotes: (query: string) => readonly SearchNoteMatch[]
  createNote?: (title: string, body: string) => TuiNote | { key: string }
  deleteNote?: (selector: string) => void
  rebuildIndexes?: () => void
  persistEditorBody?: SaveEditorBufferDependencies["persist"]
  autosaveScheduler?: WorkspaceDebounceScheduler
  onAutosaveStateChange?: () => void
  commandHandlers?: Partial<Record<string, WorkspaceCommandHandler>>
}

export interface WorkspaceController {
  getState: () => TuiState
  getManagerBrowserModel: () => ManagerBrowserModel
  getSearchResults: () => readonly SearchEverythingResult[]
  refreshManager: () => void
  focusManagerItem: (index: number) => void
  moveManagerSelection: (direction: MoveManagerSelectionDirection, options?: { wrap?: boolean }) => void
  openFocusedManagerItem: (options?: WorkspaceActionOptions) => WorkspaceActionResult
  showManager: () => WorkspaceActionResult
  showEditor: () => WorkspaceActionResult
  updateEditorBody: (body: string) => void
  insertEditorText: (text: string) => void
  backspaceEditor: () => void
  deleteEditor: () => void
  moveEditorCursor: (direction: EditorCursorDirection) => void
  toggleEditorWrapMode: () => void
  saveEditor: () => Promise<WorkspaceActionResult>
  openSearch: (query?: string) => void
  updateSearchQuery: (query: string) => void
  focusSearchResult: (index: number) => void
  cancelSearch: () => void
  goBack: () => WorkspaceActionResult
  openManagerFilter: () => void
  openManagerCreate: () => void
  updateManagerCreateTitle: (title: string) => void
  submitManagerCreate: () => Promise<WorkspaceActionResult>
  cancelManagerCreate: () => void
  openManagerDeleteConfirmation: () => void
  confirmManagerDelete: () => Promise<WorkspaceActionResult>
  cancelManagerDelete: () => void
  setManagerFilter: (query: string) => void
  updateManagerFilter: (query: string) => void
  clearManagerFilter: () => void
  toggleManagerPreview: () => void
  setManagerPreviewVisible: (visible: boolean) => void
  toggleSearch: (query?: string) => void
  openEditorFind: (query?: string) => void
  updateEditorFindQuery: (query: string) => void
  advanceEditorFind: (direction?: "next" | "previous") => void
  requestQuit: (options?: WorkspaceActionOptions) => WorkspaceActionResult
  dispose: () => void
  setAutosaveStateChangeHandler: (handler: (() => void) | null) => void
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
      createDraft: source.manager.createDraft ? { ...source.manager.createDraft } : null,
      deleteDraft: source.manager.deleteDraft ? { ...source.manager.deleteDraft } : null,
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
    return state
  }

  const currentEditor = state.editor

  return {
    ...state,
    editor: {
      ...currentEditor,
      note: toTuiNote(persistedNote),
      body: persistedNote.body,
      savedBody: persistedNote.body,
      dirty: false,
      autosaveStatus: "saved",
    },
  }
}

function applyAutosaveFailure(state: TuiState, noteKey: string, submittedBody: string): TuiState {
  if (state.editor?.note.key !== noteKey || state.editor.body !== submittedBody || !state.editor.dirty) {
    return state
  }

  return markAutosaveError(state)
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === "function"
}

export function createWorkspaceController(deps: WorkspaceControllerDependencies): WorkspaceController {
  let noteSummaries: readonly NoteManagerSummary[] = []
  let state = createInitialTuiState()
  let searchResults: SearchEverythingResult[] = []
  let autosaveTimer: unknown = null
  let autosaveStateChangeHandler: (() => void) | null = deps.onAutosaveStateChange ?? null
  const previewBodyCache = new Map<string, string>()
  const autosaveScheduler: WorkspaceDebounceScheduler = deps.autosaveScheduler ?? {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }

  function clearAutosaveTimer(): void {
    if (autosaveTimer !== null) {
      autosaveScheduler.clearTimeout(autosaveTimer)
      autosaveTimer = null
    }
  }

  function notifyAutosaveStateChange(): void {
    autosaveStateChangeHandler?.()
  }

  function persistEditorSnapshot(noteToPersist: TuiNote, submittedBody: string): TuiNote | Promise<TuiNote> {
    const persist = deps.persistEditorBody ?? ((note, body) => ({ ...note, body }))
    return persist(noteToPersist, submittedBody)
  }

  async function autosaveEditor(noteToPersist: TuiNote, submittedBody: string): Promise<void> {
    if (state.editor?.note.key !== noteToPersist.key || state.editor.body !== submittedBody) {
      return
    }

    state = markAutosaveSaving(state)
    notifyAutosaveStateChange()
    try {
      const persistedNote = persistEditorSnapshot(noteToPersist, submittedBody)
      const savedNote = isPromiseLike(persistedNote) ? await persistedNote : persistedNote
      const previousState = state
      applySavedEditorAndPreviewCache(savedNote, submittedBody)
      if (state !== previousState) {
        notifyAutosaveStateChange()
      }
    } catch {
      clearManagerPreviewCache()
      const previousState = state
      state = applyAutosaveFailure(state, noteToPersist.key, submittedBody)
      if (state !== previousState) {
        notifyAutosaveStateChange()
      }
    }
  }

  function scheduleAutosave(): void {
    if (!state.editor) {
      return
    }

    clearAutosaveTimer()
    const noteToPersist = toTuiNote(state.editor.note)
    const submittedBody = state.editor.body
    autosaveTimer = autosaveScheduler.setTimeout(() => {
      autosaveTimer = null
      void autosaveEditor(noteToPersist, submittedBody)
    }, 750)
  }

  function cachePreviewBodyFor(note: TuiNote): void {
    previewBodyCache.set(note.key, note.body)
    previewBodyCache.set(note.relativePath, note.body)
  }

  function updatePreviewSourcesForSavedNote(note: TuiNote): void {
    cachePreviewBodyFor(note)
    noteSummaries = noteSummaries.map((summary) => {
      if (summary.key !== note.key && summary.relativePath !== note.relativePath) {
        return summary
      }

      return {
        ...summary,
        title: note.title,
        description: note.description,
        relativePath: note.relativePath,
        body: note.body,
      }
    })
  }

  function hydrateManagerPreviewBody(item: ManagerItem): string | undefined {
    if (item.type !== "note") {
      return undefined
    }

    const cacheKey = item.key || item.relativePath
    const cachedBody = previewBodyCache.get(cacheKey)
    if (cachedBody !== undefined) {
      return cachedBody
    }

    const hydratedNote = deps.showNote(item.key)
    cachePreviewBodyFor(hydratedNote)
    return hydratedNote.body
  }

  function applySavedEditorAndPreviewCache(persistedNote: TuiNote, submittedBody: string): void {
    const previousState = state
    state = applySavedEditor(state, persistedNote, submittedBody)
    if (state !== previousState) {
      updatePreviewSourcesForSavedNote(persistedNote)
    }
  }

  function clearManagerPreviewCache(): void {
    previewBodyCache.clear()
  }

  function setManagerDeleteStatus(status: string | null): void {
    const draft = state.manager.deleteDraft
    if (!draft) {
      return
    }

    state = {
      ...state,
      manager: {
        ...state.manager,
        deleteDraft: { ...draft, status },
      },
    }
  }

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
    clearManagerPreviewCache()
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

  function applyEditorChange(nextEditor: EditorBufferState): void {
    state = {
      ...state,
      editor: nextEditor,
    }
    const editor = state.editor
    if (!editor) return
    if (!editor.dirty) {
      clearAutosaveTimer()
      state = {
        ...state,
        editor: {
          ...editor,
          autosaveStatus: "saved",
        },
      }
      notifyAutosaveStateChange()
      return
    }
    state = markAutosavePending(state)
    notifyAutosaveStateChange()
    scheduleAutosave()
  }

  const controller: WorkspaceController = {
    getState: () => cloneStateSnapshot(state),

    getManagerBrowserModel: () => buildManagerBrowserModel(noteSummaries, state.manager, {
      previewVisible: state.manager.previewVisible ?? true,
      hiddenReason: "manual",
      getPreviewBody: hydrateManagerPreviewBody,
    }),

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
          status: null,
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
          status: null,
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
      if (state.screen === "search" || state.mode === "editor.find" || state.mode === "editor.replace" || state.mode === "manager.filter" || state.mode === "manager.create" || state.mode === "manager.deleteConfirm") {
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

      if (state.screen === "editor") {
        state = {
          ...state,
          screen: "manager",
          mode: "manager.browse",
          search: null,
        }
        applyManagerBrowserModel()
      }
      return ok()
    },

    openManagerFilter: () => {
      state = setManagerFilterState(state, state.manager.filterQuery ?? "")
      applyManagerBrowserModel()
    },

    openManagerCreate: () => {
      state = openManagerCreateState(state)
      applyManagerBrowserModel()
    },

    updateManagerCreateTitle: (title) => {
      state = setManagerCreateTitleState(state, title)
      applyManagerBrowserModel()
    },

    submitManagerCreate: async () => {
      const title = state.manager.createDraft?.title.trim() ?? ""
      if (!title) {
        state = setManagerCreateStatus(state, "Title required")
        applyManagerBrowserModel()
        return ok()
      }

      if (editorRequiresDestructiveConfirmation(state.editor)) {
        state = setManagerCreateStatus(state, "Save or discard current note first")
        applyManagerBrowserModel()
        return dirtyBlocked()
      }

      try {
        const created = deps.createNote?.(title, "")
        if (!created) {
          state = setManagerCreateStatus(state, "Create unavailable")
          applyManagerBrowserModel()
          return ok()
        }

        clearManagerPreviewCache()
        deps.rebuildIndexes?.()
        refreshManager()
        setEditorNote(deps.showNote(created.key))
        return ok()
      } catch {
        clearManagerPreviewCache()
        state = setManagerCreateStatus(state, "Create failed")
        applyManagerBrowserModel()
        return ok()
      }
    },

    cancelManagerCreate: () => {
      state = cancelManagerCreateState(state)
      applyManagerBrowserModel()
    },

    openManagerDeleteConfirmation: () => {
      const focused = state.manager.items[state.manager.focusedIndex]
      if (!focused) {
        return
      }
      state = openManagerDeleteConfirmState(state, focused)
      applyManagerBrowserModel()
    },

    confirmManagerDelete: async () => {
      const draft = state.manager.deleteDraft
      if (!draft) {
        return ok()
      }
      if (editorRequiresDestructiveConfirmation(state.editor)) {
        setManagerDeleteStatus("Save or discard current note first")
        applyManagerBrowserModel()
        return dirtyBlocked()
      }
      if (!deps.deleteNote) {
        state = {
          ...state,
          manager: {
            ...state.manager,
            deleteDraft: { ...draft, status: "Delete unavailable" },
          },
        }
        return ok()
      }
      const deletedOpenNote = state.editor?.note.key === draft.key
      try {
        deps.deleteNote(draft.key)
        clearManagerPreviewCache()
        deps.rebuildIndexes?.()
        refreshManager()
        state = cancelManagerDeleteConfirmState(state)
        if (deletedOpenNote) {
          state = {
            ...state,
            screen: "manager",
            mode: "manager.browse",
            editor: null,
            search: null,
          }
        }
        applyManagerBrowserModel()
        return ok()
      } catch {
        clearManagerPreviewCache()
        state = {
          ...state,
          manager: {
            ...state.manager,
            deleteDraft: { ...draft, status: "Delete failed" },
          },
        }
        return ok()
      }
    },

    cancelManagerDelete: () => {
      state = cancelManagerDeleteConfirmState(state)
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

    toggleManagerPreview: () => {
      state = {
        ...state,
        manager: {
          ...state.manager,
          previewVisible: !(state.manager.previewVisible ?? true),
        },
      }
    },

    setManagerPreviewVisible: (visible) => {
      state = {
        ...state,
        manager: {
          ...state.manager,
          previewVisible: visible,
        },
      }
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
      if (!state.editor) {
        return
      }
      const findState = findInEditorBody(state.editor, query)
      state = openEditorFindState(state, {
        query: findState.query,
        matchCount: findState.matches.length,
        activeIndex: findState.currentIndex >= 0 ? findState.currentIndex : null,
      })
    },

    updateEditorFindQuery: (query) => {
      if (!state.editor) {
        return
      }
      const findState = findInEditorBody(state.editor, query)
      state = openEditorFindState(state, {
        query: findState.query,
        matchCount: findState.matches.length,
        activeIndex: findState.currentIndex >= 0 ? findState.currentIndex : null,
      })
    },

    advanceEditorFind: (direction = "next") => {
      if (!state.editor) {
        return
      }
      const findState = findInEditorBody(state.editor, state.editor.findQuery ?? "")
      const activeIndex = state.editor.activeFindIndex ?? findState.currentIndex
      const currentIndex = direction === "previous" && findState.matches.length > 0
        ? (activeIndex - 2 + findState.matches.length) % findState.matches.length
        : activeIndex
      const advanced = advanceEditorFindState(state.editor, {
        ...findState,
        currentIndex,
        currentMatch: activeIndex >= 0 ? findState.matches[activeIndex] ?? null : null,
      })
      state = openEditorFindState(state, {
        query: advanced.query,
        matchCount: advanced.matches.length,
        activeIndex: advanced.currentIndex >= 0 ? advanced.currentIndex : null,
      })
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

    requestQuit: (options = {}) => {
      if (editorRequiresDestructiveConfirmation(state.editor) && options.confirmed !== true) {
        return dirtyBlocked()
      }

      return ok()
    },

    updateEditorBody: (body) => {
      const previousEditor = state.editor
      state = markEditorBodyChanged(state, body)
      if (!state.editor) {
        clearAutosaveTimer()
        return
      }
      applyEditorChange({
        ...state.editor,
        cursorOffset: previousEditor?.cursorOffset ?? Array.from(body).length,
        selectionStart: previousEditor?.cursorOffset ?? Array.from(body).length,
        selectionEnd: previousEditor?.cursorOffset ?? Array.from(body).length,
      })
    },

    insertEditorText: (text) => {
      if (!state.editor || text.length === 0) return
      applyEditorChange(insertTextAtEditorCursor(state.editor, text))
    },

    backspaceEditor: () => {
      if (!state.editor) return
      const previousEditor = state.editor
      const nextEditor = backspaceAtEditorCursor(previousEditor)
      if (nextEditor.body === previousEditor.body) {
        state = {
          ...state,
          editor: nextEditor,
        }
        return
      }
      applyEditorChange(nextEditor)
    },

    deleteEditor: () => {
      if (!state.editor) return
      const previousEditor = state.editor
      const nextEditor = deleteAtEditorCursor(previousEditor)
      if (nextEditor.body === previousEditor.body) {
        state = {
          ...state,
          editor: nextEditor,
        }
        return
      }
      applyEditorChange(nextEditor)
    },

    moveEditorCursor: (direction) => {
      if (!state.editor) return
      state = {
        ...state,
        editor: moveEditorCursor(state.editor, direction),
      }
    },

    toggleEditorWrapMode: () => {
      if (!state.editor) return
      state = {
        ...state,
        editor: {
          ...state.editor,
          wrapMode: state.editor.wrapMode === "none" ? "word" : "none",
        },
      }
    },

    saveEditor: async () => {
      if (!state.editor) {
        return ok()
      }

      clearAutosaveTimer()
      const noteToPersist = toTuiNote(state.editor.note)
      const submittedBody = state.editor.body
      try {
        const persistedNote = persistEditorSnapshot(noteToPersist, submittedBody)

        if (isPromiseLike(persistedNote)) {
          const savedNote = await persistedNote
          applySavedEditorAndPreviewCache(savedNote, submittedBody)
          return ok()
        }

        applySavedEditorAndPreviewCache(persistedNote, submittedBody)
        return ok()
      } catch {
        clearManagerPreviewCache()
        state = markAutosaveError(state)
        notifyAutosaveStateChange()
        return dirtyBlocked()
      }
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

    dispose: () => {
      clearAutosaveTimer()
      autosaveStateChangeHandler = null
    },

    setAutosaveStateChangeHandler: (handler) => {
      autosaveStateChangeHandler = handler
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
