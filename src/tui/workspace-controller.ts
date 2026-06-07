import type { ClipboardModel, ClipboardOperationResult, EditorCursorDirection, EditorSelection, SaveEditorBufferDependencies } from "./adapters/editor-buffer-adapter"
import { advanceEditorFindState, backspaceAtEditorCursor, deleteAtEditorCursor, findInEditorBody, insertTextAtEditorCursor, moveEditorCursor, pasteText, replaceAllMatches, replaceCurrentMatch, replaceEditorBody } from "./adapters/editor-buffer-adapter"
import {
  buildManagerBrowserModel,
  buildManagerFolderPreviewRows,
  canCreateManagerFolderAt,
  focusedManagerBrowserItem,
  goToManagerParent,
  moveManagerSelection,
  openManagerBrowserItem,
  type ManagerBrowserModel,
  type MoveManagerSelectionDirection,
  type NoteManagerSummary,
} from "./adapters/note-manager-adapter"
import {
  buildSearchEverythingResults,
  type SearchEverythingCommandContext,
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
  EDITOR_HISTORY_LIMIT,
  createEditorHistorySnapshot,
  editorHistorySnapshotsEqual,
  markEditorBodyChanged,
  openEditorForNote,
  restoreEditorHistorySnapshot,
  openManagerCreate as openManagerCreateState,
  openManagerDeleteConfirm as openManagerDeleteConfirmState,
  openSearchEverything,
  setManagerCreateStatus,
  setManagerCreateTitle as setManagerCreateTitleState,
  setManagerFilter as setManagerFilterState,
  type EditorBufferState,
  type EditorReplaceField,
  type ManagerItem,
  type AiStatusState,
  type TuiNote,
  type TuiState,
} from "./state"
import { sanitizeAiErrorMessage } from "../ai/error-redaction"
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

export interface WorkspaceAiDescribeResult {
  key: string
  status?: string
  description?: string
}

export interface WorkspaceAiQueueResult {
  applied?: number
  failed?: number
  failedThisRun?: number
  queued?: number
  remaining?: number
}

export type WorkspaceAiQueueProgressHandler = (progress: { processed: number; total: number }) => void

export interface WorkspaceAiStaleScanResult {
  scanned?: number
  enqueued?: number
  queued?: number
  failed?: number
}

export interface WorkspaceAiEnqueueResult {
  queued?: number
  failed?: number
}

export interface WorkspaceAiActions {
  describeNote?: (selector: string) => Promise<WorkspaceAiDescribeResult>
  enqueueNote?: (selector: string) => Promise<WorkspaceAiEnqueueResult | boolean | void> | WorkspaceAiEnqueueResult | boolean | void
  enqueueStaleDescriptions?: () => Promise<WorkspaceAiStaleScanResult> | WorkspaceAiStaleScanResult
  processQueue?: (onProgress?: WorkspaceAiQueueProgressHandler) => Promise<WorkspaceAiQueueResult>
  getStatus?: () => AiStatusState
}

export interface WorkspaceDebounceScheduler {
  setTimeout: (callback: () => void, delay: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface WorkspaceControllerDependencies {
  listNotes: () => readonly NoteManagerSummary[]
  listNoteFolders?: () => readonly string[]
  showNote: (selector: string) => TuiNote
  searchNotes: (query: string) => readonly SearchNoteMatch[]
  managedRootPath?: string
  createNote?: (title: string, destinationFolder: string) => TuiNote
  createDraft?: () => TuiNote
  createFolder?: (folderRelativePath: string) => void
  renameNote?: (selector: string, title: string) => TuiNote
  renameFolder?: (folderRelativePath: string, nextName: string) => void
  moveNote?: (selector: string, destinationFolder: string) => TuiNote
  promoteDraft?: (selector: string, title: string, destinationFolder: string) => TuiNote
  deleteNote?: (selector: string) => void
  rebuildIndexes?: () => void
  persistEditorBody?: SaveEditorBufferDependencies["persist"]
  initialNote?: TuiNote
  recordLatestOpenedNote?: (note: TuiNote) => void
  autosaveScheduler?: WorkspaceDebounceScheduler
  aiIdleScheduler?: WorkspaceDebounceScheduler
  transientIndicatorScheduler?: WorkspaceDebounceScheduler
  clipboard?: ClipboardModel
  initialAiStatus?: AiStatusState
  aiActions?: WorkspaceAiActions
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
  openFocusedManagerFolder: () => WorkspaceActionResult
  goToManagerParent: (options?: { preserveActionMode?: boolean }) => WorkspaceActionResult
  showManager: () => WorkspaceActionResult
  showEditor: () => WorkspaceActionResult
  updateEditorBody: (body: string) => void
  insertEditorText: (text: string) => void
  setEditorSelection: (start: number, end: number) => void
  copyAllEditorBody: () => string
  replaceAllEditorBodyFromClipboard: () => void
  pasteEditorClipboard: (text?: string) => void
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
  toggleManagerCreateKind: () => void
  quickNewDraft: () => WorkspaceActionResult
  updateManagerCreateTitle: (title: string) => void
  submitManagerCreate: () => Promise<WorkspaceActionResult>
  cancelManagerCreate: () => void
  openManagerRename: () => void
  openManagerMove: () => WorkspaceActionResult
  openSaveDraftAs: () => WorkspaceActionResult
  updateManagerActionInput: (input: string) => void
  submitManagerAction: () => WorkspaceActionResult
  cancelManagerAction: () => void
  openManagerDeleteConfirmation: () => void
  confirmManagerDelete: () => Promise<WorkspaceActionResult>
  cancelManagerDelete: () => void
  renameFocusedManagerItem: (titleOrFolderName: string) => WorkspaceActionResult
  moveFocusedManagerNote: (destinationFolder: string) => WorkspaceActionResult
  setManagerFilter: (query: string) => void
  updateManagerFilter: (query: string) => void
  clearManagerFilter: () => void
  toggleManagerPreview: () => void
  setManagerPreviewVisible: (visible: boolean) => void
  toggleSearchPreview: () => void
  setSearchPreviewVisible: (visible: boolean) => void
  toggleSearch: (query?: string) => void
  openEditorFind: (query?: string) => void
  openEditorReplace: (query?: string) => void
  updateEditorFindQuery: (query: string) => void
  updateEditorReplacement: (replacement: string) => void
  setEditorReplaceField: (field: EditorReplaceField) => void
  advanceEditorFind: (direction?: "next" | "previous") => void
  replaceCurrentEditorMatch: () => void
  replaceAllEditorMatches: () => void
  undoEditor: () => void
  redoEditor: () => void
  switchEditorNote: (direction: "next" | "previous", options?: WorkspaceActionOptions) => WorkspaceActionResult
  requestQuit: (options?: WorkspaceActionOptions) => WorkspaceActionResult
  dispose: () => void
  startAiStartupScan: () => void
  setAutosaveStateChangeHandler: (handler: (() => void) | null) => void
  selectSearchResult: (result?: SearchEverythingResult, options?: WorkspaceActionOptions) => WorkspaceActionResult
  runCommand: (command: string, options?: WorkspaceActionOptions) => WorkspaceActionResult
}

const ok = (): WorkspaceActionResult => ({ blocked: false })
const dirtyBlocked = (): WorkspaceActionResult => ({ blocked: true, reason: "dirty-editor" })

const destructiveCommands = new Set(["/archive", "/delete", "/migrate", "/quit"])
const searchIndexUnavailableStatus = "Search index unavailable; showing notes, folders, and commands only"
const dirtyEditorManagerStatus = "Save or discard current note first"

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

function isDraftRelativePath(relativePath: string | undefined): boolean {
  return (relativePath ?? "").replaceAll("\\", "/").startsWith("draft/")
}

function cloneStateSnapshot(source: TuiState): TuiState {
  return {
    ...source,
    manager: {
      ...source.manager,
      items: source.manager.items.map(cloneManagerItem),
      createDraft: source.manager.createDraft ? { ...source.manager.createDraft } : null,
      actionDraft: source.manager.actionDraft ? { ...source.manager.actionDraft } : null,
      deleteDraft: source.manager.deleteDraft ? { ...source.manager.deleteDraft } : null,
    },
    editor: source.editor
      ? {
          ...source.editor,
          note: toTuiNote(source.editor.note),
          noteSwitchIndicator: source.editor.noteSwitchIndicator ? { ...source.editor.noteSwitchIndicator } : null,
          undoStack: source.editor.undoStack?.map((snapshot) => ({ ...snapshot })) ?? [],
          redoStack: source.editor.redoStack?.map((snapshot) => ({ ...snapshot })) ?? [],
        }
      : null,
    search: source.search
      ? {
          ...source.search,
          previewVisible: source.search.previewVisible ?? true,
          status: source.search.status ?? null,
        }
      : null,
  }
}

function commandNameFor(command: string): string {
  return command.trim().split(/\s+/u)[0] ?? ""
}

function commandArgumentsFor(command: string): string {
  const trimmed = command.trim()
  const commandName = commandNameFor(trimmed)
  return commandName.length > 0 ? trimmed.slice(commandName.length).trim() : ""
}

function filenameForPath(path: string): string {
  return path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? path
}

function normalizeWorkspaceRelativePath(relativePath: string | null | undefined): string {
  return (relativePath ?? "").replaceAll("\\", "/").replace(/\/+/gu, "/").replace(/^\/+|\/+$/gu, "")
}

function managerFolderForNotePath(relativePath: string | null | undefined): string | null {
  const normalizedPath = normalizeWorkspaceRelativePath(relativePath)
  const parts = normalizedPath.split("/").filter(Boolean)

  if (parts.length < 2 || !normalizedPath.endsWith(".md")) {
    return null
  }

  if (parts[0] !== "note" && parts[0] !== "draft") {
    return null
  }

  return parts.slice(0, -1).join("/")
}

function folderNameSegmentFromTitle(title: string): string {
  return title.trim().replaceAll("\\", "/").split("/").filter(Boolean).at(-1)?.trim() ?? ""
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
  const savedBody = persistedNote.body
  const rebaseHistory = (stack: typeof currentEditor.undoStack) => stack?.map((snapshot) => ({
    ...snapshot,
    savedBody,
    dirty: snapshot.body !== savedBody,
  })) ?? []

  return {
    ...state,
    editor: {
      ...currentEditor,
      note: toTuiNote(persistedNote),
      body: savedBody,
      savedBody,
      dirty: false,
      autosaveStatus: "saved",
      undoStack: rebaseHistory(currentEditor.undoStack),
      redoStack: rebaseHistory(currentEditor.redoStack),
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
  let userFolderPaths: readonly string[] = []
  let state = createInitialTuiState({
    ai: deps.initialAiStatus,
    manager: { managedRootPath: deps.managedRootPath ?? null },
  })
  let searchResults: SearchEverythingResult[] = []
  let autosaveTimer: unknown = null
  let aiIdleTimer: unknown = null
  let noteSwitchIndicatorTimer: unknown = null
  let aiIdleGeneration = 0
  let aiIdlePendingSelector: string | null = null
  let disposed = false
  let inFlightSave: { noteKey: string; body: string; promise: Promise<TuiNote> } | null = null
  const saveQueuesByNote = new Map<string, Promise<void>>()
  let autosaveStateChangeHandler: (() => void) | null = deps.onAutosaveStateChange ?? null
  const previewBodyCache = new Map<string, string>()
  const autosaveScheduler: WorkspaceDebounceScheduler = deps.autosaveScheduler ?? {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  const aiIdleScheduler: WorkspaceDebounceScheduler = deps.aiIdleScheduler ?? {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  const transientIndicatorScheduler: WorkspaceDebounceScheduler = deps.transientIndicatorScheduler ?? {
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  const editorAiIdleDelayMs = 10_000
  const managerAiIdleDelayMs = 5_000
  let fallbackClipboardText = ""
  const clipboard: ClipboardModel = deps.clipboard ?? {
    name: "in-memory clipboard",
    canRead: true,
    canWrite: true,
    readText: () => fallbackClipboardText,
    writeText: (text) => {
      fallbackClipboardText = text
    },
  }

  function clipboardName(): string {
    return clipboard.name ?? "clipboard"
  }

  function clipboardWriteStatus(verb: "Copied", selectedText: string, result: void | ClipboardOperationResult): string {
    const count = charCountLabel(selectedText)
    if (!result) return `${verb} ${count} to ${clipboardName()}`
    if (result.category === "desktop") return `${verb} ${count} to desktop clipboard (${result.providerName})`
    if (result.category === "terminal") return `${verb} ${count} inside BlueNote and sent terminal clipboard copy (${result.providerName})`
    if (result.category === "internal") return `${verb} ${count} inside BlueNote; desktop clipboard unavailable`
    return `${verb} ${count}; clipboard unavailable`
  }

  function clipboardReadStatus(pastedText: string, result: ClipboardOperationResult | null): string {
    const count = charCountLabel(pastedText)
    if (!result) return `Pasted ${count} from ${clipboardName()}`
    if (result.category === "desktop") return `Pasted ${count} from desktop clipboard (${result.providerName})`
    if (result.category === "internal") return `Pasted ${count} from BlueNote internal clipboard`
    if (result.category === "terminal") return `Pasted ${count} from terminal clipboard (${result.providerName})`
    return `Pasted ${count}`
  }

  function clipboardReplaceAllStatus(pastedText: string, result: ClipboardOperationResult | null): string {
    const count = charCountLabel(pastedText)
    if (!result) return `Replaced note body with ${count} from ${clipboardName()}`
    if (result.category === "desktop") return `Replaced note body with ${count} from desktop clipboard (${result.providerName})`
    if (result.category === "internal") return `Replaced note body with ${count} from BlueNote internal clipboard`
    if (result.category === "terminal") return `Replaced note body with ${count} from terminal clipboard (${result.providerName})`
    return `Replaced note body with ${count}`
  }

  function charCountLabel(text: string): string {
    const count = Array.from(text).length
    return `${count} ${count === 1 ? "char" : "chars"}`
  }

  function setEditorStatus(statusMessage: string): void {
    if (!state.editor) return
    state = {
      ...state,
      editor: {
        ...state.editor,
        statusMessage,
      },
    }
  }

  function clearAutosaveTimer(): void {
    if (autosaveTimer !== null) {
      autosaveScheduler.clearTimeout(autosaveTimer)
      autosaveTimer = null
    }
  }

  function clearNoteSwitchIndicatorTimer(): void {
    if (noteSwitchIndicatorTimer !== null) {
      transientIndicatorScheduler.clearTimeout(noteSwitchIndicatorTimer)
      noteSwitchIndicatorTimer = null
    }
  }

  function scheduleNoteSwitchIndicator(label: string): void {
    clearNoteSwitchIndicatorTimer()
    if (!state.editor) return
    state = {
      ...state,
      editor: {
        ...state.editor,
        noteSwitchIndicator: { label },
      },
    }
    notifyAutosaveStateChange()
    noteSwitchIndicatorTimer = transientIndicatorScheduler.setTimeout(() => {
      noteSwitchIndicatorTimer = null
      if (disposed || state.editor?.noteSwitchIndicator?.label !== label) {
        return
      }
      state = {
        ...state,
        editor: {
          ...state.editor,
          noteSwitchIndicator: null,
        },
      }
      notifyAutosaveStateChange()
    }, 2_000)
  }

  function clearAiIdleTimer(options: { clearPending?: boolean } = {}): void {
    if (aiIdleTimer !== null) {
      aiIdleGeneration += 1
      try {
        aiIdleScheduler.clearTimeout(aiIdleTimer)
      } catch {
        // AI idle scheduler failures must never affect note persistence or user actions.
      }
      aiIdleTimer = null
    }
    if (options.clearPending) {
      aiIdlePendingSelector = null
    }
  }

  function canScheduleAiIdleWork(): boolean {
    return Boolean(!disposed && (deps.aiActions?.enqueueNote || deps.aiActions?.processQueue) && state.ai?.kind !== "not-configured")
  }

  function scheduleAiIdleWork(selector: string, delay: number): void {
    clearAiIdleTimer()
    if (!canScheduleAiIdleWork()) {
      aiIdlePendingSelector = null
      return
    }

    try {
      const generation = aiIdleGeneration + 1
      aiIdleGeneration = generation
      aiIdleTimer = aiIdleScheduler.setTimeout(() => {
        if (generation !== aiIdleGeneration) {
          return
        }
        aiIdleTimer = null
        if (disposed || !canScheduleAiIdleWork()) {
          return
        }
        startAiIdleWork(selector)
      }, delay)
      aiIdlePendingSelector = selector
    } catch {
      aiIdleTimer = null
      aiIdlePendingSelector = null
      // AI idle scheduler failures must never roll back successful note persistence.
    }
  }

  function scheduleEditorAiIdleWork(selector: string): void {
    scheduleAiIdleWork(selector, editorAiIdleDelayMs)
  }

  function scheduleManagerAiIdleWork(selector: string): void {
    scheduleAiIdleWork(selector, managerAiIdleDelayMs)
  }

  function scheduleSavedNoteAiIdleWork(selector: string): void {
    if (state.screen === "manager" || state.search?.previousScreen === "manager") {
      scheduleManagerAiIdleWork(selector)
      return
    }
    scheduleEditorAiIdleWork(selector)
  }

  function recordManagerAiActivity(): void {
    if (state.screen !== "manager" || !aiIdlePendingSelector) {
      return
    }
    scheduleManagerAiIdleWork(aiIdlePendingSelector)
  }

  function queuePendingAiIdleWorkBeforeOpeningNote(nextKey: string): void {
    const pendingOpenNoteSelector = aiIdlePendingSelector
    if (pendingOpenNoteSelector && state.editor?.note.key === pendingOpenNoteSelector && nextKey !== pendingOpenNoteSelector) {
      queuePendingAiIdleWorkNow(pendingOpenNoteSelector)
    }
  }

  function queuePendingAiIdleWorkNow(selector: string): void {
    clearAiIdleTimer()
    aiIdlePendingSelector = null
    if (disposed || !canScheduleAiIdleWork()) {
      return
    }
    startAiIdleWork(selector)
  }

  function didApplySavedSnapshot(noteKey: string, submittedBody: string): boolean {
    return Boolean(
      state.editor?.note.key === noteKey
      && state.editor.savedBody === submittedBody
      && state.editor.body === submittedBody
      && !state.editor.dirty,
    )
  }

  function notifyAutosaveStateChange(): void {
    autosaveStateChangeHandler?.()
  }

  let lastPersistWarning: string | null = null

  function persistEditorSnapshot(noteToPersist: TuiNote, submittedBody: string): TuiNote | Promise<TuiNote> {
    const persist = deps.persistEditorBody ?? ((note, body) => ({ ...note, body }))
    lastPersistWarning = null
    return persist(noteToPersist, submittedBody, (message) => {
      lastPersistWarning = message
    })
  }

  function persistEditorSnapshotCoalesced(noteToPersist: TuiNote, submittedBody: string): TuiNote | Promise<TuiNote> {
    if (inFlightSave?.noteKey === noteToPersist.key && inFlightSave.body === submittedBody) {
      return inFlightSave.promise
    }

    const previousSaveForNote = saveQueuesByNote.get(noteToPersist.key)
    if (!previousSaveForNote) {
      const persistedNote = persistEditorSnapshot(noteToPersist, submittedBody)
      if (!isPromiseLike(persistedNote)) {
        return persistedNote
      }

      const promise = persistedNote
      const queueTail = promise.then(
        () => undefined,
        () => undefined,
      )
      saveQueuesByNote.set(noteToPersist.key, queueTail)
      inFlightSave = { noteKey: noteToPersist.key, body: submittedBody, promise }
      queueTail.then(() => {
        if (saveQueuesByNote.get(noteToPersist.key) === queueTail) {
          saveQueuesByNote.delete(noteToPersist.key)
        }
        if (inFlightSave?.promise === promise) {
          inFlightSave = null
        }
      })
      return promise
    }

    const promise = previousSaveForNote.then(() => persistEditorSnapshot(noteToPersist, submittedBody))
    const queueTail = promise.then(
      () => undefined,
      () => undefined,
    )
    saveQueuesByNote.set(noteToPersist.key, queueTail)
    inFlightSave = { noteKey: noteToPersist.key, body: submittedBody, promise }
    queueTail.then(() => {
      if (saveQueuesByNote.get(noteToPersist.key) === queueTail) {
        saveQueuesByNote.delete(noteToPersist.key)
      }
      if (inFlightSave?.promise === promise) {
        inFlightSave = null
      }
    })
    return promise
  }

  async function autosaveEditor(noteToPersist: TuiNote, submittedBody: string): Promise<void> {
    if (disposed) {
      return
    }
    const currentEditor = state.editor
    if (
      currentEditor?.note.key !== noteToPersist.key
      || currentEditor.body !== submittedBody
      || !currentEditor.dirty
    ) {
      return
    }

    state = markAutosaveSaving(state)
    notifyAutosaveStateChange()
    const editorAfterSaving = state.editor
    if (!editorAfterSaving) {
      return
    }
    const hasChangedBody = editorAfterSaving.savedBody !== submittedBody
    try {
      const persistedNote = persistEditorSnapshotCoalesced(noteToPersist, submittedBody)
      const savedNote = isPromiseLike(persistedNote) ? await persistedNote : persistedNote
      if (disposed) {
        return
      }
      const previousState = state
      applySavedEditorAndPreviewCache(savedNote, submittedBody)
      if (state !== previousState && hasChangedBody) {
        scheduleSavedNoteAiIdleWork(noteToPersist.key)
      }
      if (state !== previousState) {
        notifyAutosaveStateChange()
      }
    } catch {
      if (disposed) {
        return
      }
      clearManagerPreviewCache()
      const previousState = state
      state = applyAutosaveFailure(state, noteToPersist.key, submittedBody)
      if (state !== previousState) {
        notifyAutosaveStateChange()
      }
    }
  }

  function scheduleAutosave(): void {
    if (disposed) {
      return
    }
    if (!state.editor) {
      return
    }

    clearAutosaveTimer()
    const noteToPersist = toTuiNote(state.editor.note)
    const submittedBody = state.editor.body
    autosaveTimer = autosaveScheduler.setTimeout(() => {
      autosaveTimer = null
      if (disposed) {
        return
      }
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

  function searchSummariesWithCachedBodies(): readonly NoteManagerSummary[] {
    return noteSummaries.map((summary) => {
      const cachedBody = previewBodyCache.get(summary.key) ?? previewBodyCache.get(summary.relativePath)
      return cachedBody !== undefined && summary.body === undefined ? { ...summary, body: cachedBody } : summary
    })
  }

  function hydrateSelectedSearchPreview(): void {
    const selectedIndex = state.search?.selectedIndex ?? 0
    const selected = searchResults[selectedIndex]
    if (!selected || selected.kind !== "note" || selected.body !== undefined) {
      return
    }

    const cachedBody = previewBodyCache.get(selected.key) ?? previewBodyCache.get(selected.relativePath)
    if (cachedBody !== undefined) {
      searchResults = searchResults.map((result, index): SearchEverythingResult => (
        index === selectedIndex && result.kind === "note" ? { ...result, body: cachedBody } : result
      ))
      return
    }

    try {
      const hydratedNote = deps.showNote(selected.key)
      cachePreviewBodyFor(hydratedNote)
      searchResults = searchResults.map((result, index): SearchEverythingResult => (
        index === selectedIndex && result.kind === "note"
          ? {
            ...result,
            title: hydratedNote.title,
            description: hydratedNote.description,
            relativePath: hydratedNote.relativePath,
            body: hydratedNote.body,
          }
          : result
      ))
    } catch {
      // Keep the lightweight summary result; preview falls back to available summary text.
    }
  }

  function applySavedEditorAndPreviewCache(persistedNote: TuiNote, submittedBody: string): void {
    const previousState = state
    state = applySavedEditor(state, persistedNote, submittedBody)
    if (state !== previousState) {
      clearAutosaveTimer()
      updatePreviewSourcesForSavedNote(persistedNote)
    }
    if (lastPersistWarning && state.editor?.note.key === persistedNote.key && state.editor.body === submittedBody) {
      setEditorStatus(lastPersistWarning)
    }
  }

  function clearManagerPreviewCache(): void {
    previewBodyCache.clear()
  }

  function setManagerStatus(status: string | null): void {
    state = {
      ...state,
      manager: {
        ...state.manager,
        status,
      },
    }
  }

  function sanitizeAiStatusReason(error: unknown): string {
    return sanitizeAiErrorMessage(error)
  }

  function nonNegativeInteger(value: number | null | undefined): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0
  }

  function queueStatus(queued = 0, failed = 0): { queued: number; failed?: number } {
    return {
      queued: nonNegativeInteger(queued),
      failed: nonNegativeInteger(failed),
    }
  }

  function currentQueueStatus(): { queued: number; failed?: number } | undefined {
    const ai = state.ai
    if (ai?.kind === "not-configured") {
      return undefined
    }
    if (ai && "queue" in ai && ai.queue) {
      return queueStatus(ai.queue.queued, ai.queue.failed ?? 0)
    }
    return queueStatus()
  }

  function withQueueStatus(ai: AiStatusState, queue = currentQueueStatus()): AiStatusState {
    if (!queue || ai.kind === "not-configured") {
      return ai
    }
    return { ...ai, queue }
  }

  function queueStatusFromResult(result: WorkspaceAiQueueResult | undefined): { queued: number; failed?: number } {
    return queueStatus(result?.queued ?? result?.remaining ?? currentQueueStatus()?.queued ?? 0, result?.failed ?? currentQueueStatus()?.failed ?? 0)
  }

  function queueStatusFromEnqueueResult(result: WorkspaceAiEnqueueResult | boolean | void): { queued: number; failed?: number } {
    if (typeof result === "object" && result !== null) {
      return queueStatus(result.queued ?? currentQueueStatus()?.queued ?? 0, result.failed ?? currentQueueStatus()?.failed ?? 0)
    }
    return queueStatus((currentQueueStatus()?.queued ?? 0) + 1, currentQueueStatus()?.failed ?? 0)
  }

  function queueStatusFromStaleScanResult(result: WorkspaceAiStaleScanResult | undefined): { queued: number; failed?: number } {
    if (typeof result?.queued === "number") {
      return queueStatus(result.queued, result.failed ?? currentQueueStatus()?.failed ?? 0)
    }
    const enqueued = Math.max(0, Math.trunc(result?.enqueued ?? 0))
    return queueStatus((currentQueueStatus()?.queued ?? 0) + enqueued, currentQueueStatus()?.failed ?? 0)
  }

  function setAiStatus(ai: AiStatusState): void {
    state = {
      ...state,
      ai,
    }
    notifyAutosaveStateChange()
  }

  let aiOperationId = 0
  let aiStartupScanCancelled = false
  let aiQueueProcessingPromise: Promise<void> | null = null
  let aiQueueProcessRequestedDuringRun: { mode: "status"; operationId: number } | { mode: "background" } | null = null

  function nextAiOperationId(): number {
    aiStartupScanCancelled = true
    aiOperationId += 1
    return aiOperationId
  }

  function isLatestAiOperation(operationId: number): boolean {
    return operationId === aiOperationId
  }

  function setLatestAiStatus(operationId: number, ai: AiStatusState): void {
    if (isLatestAiOperation(operationId)) {
      setAiStatus(ai)
    }
  }

  function currentAiDescribeSelector(): string | null {
    if (state.search?.previousScreen === "editor" && state.editor) {
      return state.editor.note.key
    }
    if (state.screen === "editor" && state.editor) {
      return state.editor.note.key
    }
    const focused = state.manager.items[state.manager.focusedIndex]
    return selectedNoteKeyFor(focused) ?? state.manager.selectedNoteKey ?? state.editor?.note.key ?? null
  }

  function startAiDescribe(): void {
    if (disposed) {
      return
    }
    const operationId = nextAiOperationId()
    const selector = currentAiDescribeSelector()
    if (!selector || !deps.aiActions?.describeNote) {
      setAiStatus(withQueueStatus({ kind: "error", reason: "unavailable" }))
      return
    }

    setAiStatus(withQueueStatus({ kind: "running", key: selector }))
    void (async () => {
      try {
        const result = await deps.aiActions?.describeNote?.(selector)
        if (disposed) return
        if (!isLatestAiOperation(operationId)) return
        if (!result || (result.status && result.status !== "applied")) {
          setLatestAiStatus(operationId, withQueueStatus({ kind: "error", reason: "invalid result" }))
          return
        }
        refreshManager()
        setLatestAiStatus(operationId, withQueueStatus({ kind: "updated", key: result.key || selector }))
      } catch (error) {
        if (disposed) return
        setLatestAiStatus(operationId, withQueueStatus({ kind: "error", reason: sanitizeAiStatusReason(error) }))
      }
    })()
  }

  function startAiIdleWork(selector: string): void {
    if (disposed) {
      return
    }
    if (aiIdlePendingSelector === selector) {
      aiIdlePendingSelector = null
    }
    if (!deps.aiActions?.enqueueNote) {
      startAiProcessQueue()
      return
    }

    const operationId = nextAiOperationId()
    setAiStatus(withQueueStatus({ kind: "running", key: selector }))
    void (async () => {
      try {
        if (disposed) return
        const enqueued = await deps.aiActions?.enqueueNote?.(selector)
        if (disposed) return
        if (enqueued === false) {
          setLatestAiStatus(operationId, withQueueStatus({ kind: "error", reason: "enqueue failed" }))
          return
        }
        const queue = queueStatusFromEnqueueResult(enqueued)
        if (deps.aiActions?.processQueue) {
          const processOperationId = isLatestAiOperation(operationId) ? operationId : null
          if (processOperationId !== null) {
            setLatestAiStatus(processOperationId, withQueueStatus({ kind: "running" }, queue))
          }
          startAiProcessQueue({ operationId: processOperationId, rerunAfterCurrent: true })
          globalThis.setTimeout(() => {
            if (disposed || aiQueueProcessingPromise) return
            const pendingQueue = currentQueueStatus()
            if ((pendingQueue?.queued ?? 0) > 0) {
              startAiProcessQueue({ operationId: isLatestAiOperation(operationId) ? operationId : null, rerunAfterCurrent: true })
            }
          }, 0)
          return
        }
        setLatestAiStatus(operationId, withQueueStatus({ kind: "updated", key: selector }, queue))
      } catch (error) {
        if (disposed) return
        setLatestAiStatus(operationId, withQueueStatus({ kind: "error", reason: sanitizeAiStatusReason(error) }))
      }
    })()
  }

  function startAiProcessQueue(options: { operationId?: number | null; rerunAfterCurrent?: boolean } = {}): void {
    if (disposed) {
      return
    }
    if (aiQueueProcessingPromise) {
      if (options.rerunAfterCurrent === true) {
        if (options.operationId === null) {
          if (aiQueueProcessRequestedDuringRun?.mode !== "status") {
            aiQueueProcessRequestedDuringRun = { mode: "background" }
          }
        } else {
          aiQueueProcessRequestedDuringRun = { mode: "status", operationId: options.operationId ?? aiOperationId }
        }
      }
      if (options.operationId === null) {
        return
      }
      if (state.ai?.kind === "running") {
        setAiStatus(withQueueStatus(state.ai))
      } else {
        setAiStatus(withQueueStatus({ kind: "running" }))
      }
      return
    }
    const operationId = options.operationId === null ? null : options.operationId ?? nextAiOperationId()
    if (!deps.aiActions?.processQueue) {
      if (operationId !== null) {
        setAiStatus(withQueueStatus({ kind: "error", reason: "unavailable" }))
      }
      return
    }

    const initialQueue = currentQueueStatus()
    const totalForRun = nonNegativeInteger(initialQueue?.queued ?? 0)
    const runningStatus: AiStatusState = totalForRun > 0
      ? { kind: "running", progress: { processed: 0, total: totalForRun } }
      : { kind: "running" }
    if (operationId !== null) {
      setAiStatus(withQueueStatus(runningStatus, initialQueue))
    }
    const queueProcessing = (async () => {
      try {
        if (disposed) return
        const result = await deps.aiActions?.processQueue?.((progress) => {
          if (operationId === null || disposed || !isLatestAiOperation(operationId)) return
          const total = nonNegativeInteger(progress.total)
          const processed = Math.min(nonNegativeInteger(progress.processed), total)
          const queue = queueStatus(Math.max(0, total - processed), currentQueueStatus()?.failed ?? 0)
          setLatestAiStatus(operationId, withQueueStatus({ kind: "running", progress: { processed, total } }, queue))
        })
        if (disposed) return
        refreshManager()
        if (operationId === null || !isLatestAiOperation(operationId)) {
          setAiStatus(withQueueStatus(state.ai ?? { kind: "not-configured" }, queueStatusFromResult(result)))
          return
        }
        const queue = queueStatusFromResult(result)
        const newlyFailed = Math.max(0, result?.failedThisRun ?? result?.failed ?? 0)
        if (newlyFailed > 0) {
          setLatestAiStatus(operationId, withQueueStatus({ kind: "error", reason: `${newlyFailed} failed` }, queue))
          return
        }
        setLatestAiStatus(operationId, withQueueStatus({ kind: "updated", count: result?.applied ?? 0 }, queue))
      } catch (error) {
        if (disposed || operationId === null) return
        setLatestAiStatus(operationId, withQueueStatus({ kind: "error", reason: sanitizeAiStatusReason(error) }))
      }
    })()
    aiQueueProcessingPromise = queueProcessing
    void queueProcessing.finally(() => {
      if (aiQueueProcessingPromise === queueProcessing) {
        aiQueueProcessingPromise = null
        if (aiQueueProcessRequestedDuringRun && !disposed) {
          const rerunRequest = aiQueueProcessRequestedDuringRun
          aiQueueProcessRequestedDuringRun = null
          startAiProcessQueue({
            operationId: rerunRequest.mode === "background" || !isLatestAiOperation(rerunRequest.operationId) ? null : rerunRequest.operationId,
          })
        }
      }
    })
  }

  function startAiStartupScan(): void {
    if (disposed || aiStartupScanCancelled || !deps.aiActions?.enqueueStaleDescriptions || state.ai?.kind === "not-configured") {
      return
    }

    const operationId = aiOperationId
    void (async () => {
      try {
        if (disposed) return
        const result = await deps.aiActions?.enqueueStaleDescriptions?.()
        if (disposed) return
        if (!isLatestAiOperation(operationId)) return
        const queue = queueStatusFromStaleScanResult(result)
        if (deps.aiActions?.processQueue && queue.queued > 0 && state.ai?.kind !== "auth-required") {
          setLatestAiStatus(operationId, withQueueStatus({ kind: "running" }, queue))
          startAiProcessQueue({ operationId })
        } else {
          setLatestAiStatus(operationId, withQueueStatus(state.ai ?? { kind: "not-configured" }, queue))
        }
      } catch (error) {
        if (disposed) return
        setLatestAiStatus(operationId, withQueueStatus({ kind: "error", reason: sanitizeAiStatusReason(error) }))
      }
    })()
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
    const model = buildManagerBrowserModel(noteSummaries, state.manager, { userFolderPaths })
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
    userFolderPaths = deps.listNoteFolders?.() ?? []
    applyManagerBrowserModel()
  }

  function setEditorNote(note: TuiNote): void {
    const openedNote = toTuiNote(note)
    state = openEditorForNote({
      ...state,
      manager: {
        ...state.manager,
        status: null,
      },
    }, openedNote)
    try {
      deps.recordLatestOpenedNote?.(openedNote)
    } catch {
      // Latest-opened state is a best-effort startup hint; opening the editor must remain non-blocking.
    }
  }

  function updateOpenEditorNotePreservingScreen(note: TuiNote): void {
    if (!state.editor) {
      return
    }

    const openedNote = toTuiNote(note)
    state = {
      ...state,
      editor: {
        ...state.editor,
        note: openedNote,
        body: openedNote.body,
        savedBody: openedNote.body,
        dirty: false,
        autosaveStatus: "saved",
        statusMessage: null,
      },
    }
    try {
      deps.recordLatestOpenedNote?.(openedNote)
    } catch {
      // Latest-opened state is a best-effort startup hint; renames/moves must not depend on it.
    }
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
      setManagerStatus(dirtyEditorManagerStatus)
      return dirtyBlocked()
    }

    queuePendingAiIdleWorkBeforeOpeningNote(key)
    setEditorNote(deps.showNote(key))
    return ok()
  }

  function folderPathForNoteRelativePath(relativePath: string | undefined): string {
    const normalized = (relativePath ?? "").replaceAll("\\", "/").replace(/\/+/gu, "/").replace(/^\/+|\/+$/gu, "")
    const parts = normalized.split("/").filter(Boolean)
    return parts.length <= 1 ? "" : parts.slice(0, -1).join("/")
  }

  function noteSwitchLabel(index: number, total: number): string {
    const width = Math.max(2, String(total).length)
    return `${String(index + 1).padStart(width, "0")}/${String(total).padStart(width, "0")}`
  }

  function switchEditorNote(direction: "next" | "previous", options: WorkspaceActionOptions = {}): WorkspaceActionResult {
    const editor = state.editor
    if (!editor) {
      return ok()
    }

    const folderPath = folderPathForNoteRelativePath(editor.note.relativePath)
    const rows = buildManagerFolderPreviewRows(noteSummaries, folderPath, editor.note.key).filter((row) => row.type === "note")
    if (rows.length === 0) {
      return ok()
    }

    const currentIndex = rows.findIndex((row) => row.key === editor.note.key)
    if (currentIndex === -1) {
      return ok()
    }

    if (rows.length === 1) {
      scheduleNoteSwitchIndicator(noteSwitchLabel(currentIndex, rows.length))
      return ok()
    }

    const nextIndex = direction === "next"
      ? (currentIndex + 1) % rows.length
      : (currentIndex - 1 + rows.length) % rows.length
    const next = rows[nextIndex]
    if (!next) {
      return ok()
    }

    const result = openNoteByKey(next.key, options)
    if (!result.blocked) {
      state = {
        ...state,
        manager: {
          ...state.manager,
          currentFolderPath: folderPath,
        },
      }
      scheduleNoteSwitchIndicator(noteSwitchLabel(nextIndex, rows.length))
    }
    return result
  }

  function searchCommandContext(): SearchEverythingCommandContext {
    const screen = state.search?.previousScreen ?? (state.screen === "search" ? "manager" : state.screen)
    if (screen === "editor") {
      return { screen, activeEditorIsDraft: isDraftRelativePath(state.editor?.note.relativePath) }
    }
    const focused = state.manager.items[state.manager.focusedIndex]
    return {
      screen: "manager",
      managerSelection: focused?.type ?? "none",
      managerCanCreateFolder: state.manager.canCreateFolder === true,
    }
  }

  function rebuildSearchResults(query: string): void {
    const commandContext = searchCommandContext()
    try {
      searchResults = buildSearchEverythingResults(query, {
        noteSummaries: searchSummariesWithCachedBodies(),
        userFolderPaths,
        searchNotes: deps.searchNotes,
      }, { commandContext })
      hydrateSelectedSearchPreview()
    } catch {
      searchResults = buildSearchEverythingResults(query, {
        noteSummaries: searchSummariesWithCachedBodies(),
        userFolderPaths,
        searchNotes: () => [],
      }, { commandContext })
      hydrateSelectedSearchPreview()
      if (state.search) {
        state = {
          ...state,
          search: {
            ...state.search,
            status: searchIndexUnavailableStatus,
            selectedIndex: clampIndex(state.search.selectedIndex, searchResults.length),
            resultScrollOffset: 0,
          },
        }
      }
    }
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

  function applyEditorChange(nextEditor: EditorBufferState, options: { recordHistory?: boolean } = {}): void {
    const previousEditor = state.editor
    let editorToApply = nextEditor
    if (options.recordHistory !== false && previousEditor) {
      const previousSnapshot = createEditorHistorySnapshot(previousEditor)
      const nextSnapshot = createEditorHistorySnapshot(nextEditor)
      if (!editorHistorySnapshotsEqual(previousSnapshot, nextSnapshot)) {
        const previousUndoStack = previousEditor.undoStack ?? []
        const lastUndoSnapshot = previousUndoStack.at(-1)
        const nextUndoStack = lastUndoSnapshot && editorHistorySnapshotsEqual(lastUndoSnapshot, previousSnapshot)
          ? previousUndoStack
          : [...previousUndoStack, previousSnapshot].slice(-EDITOR_HISTORY_LIMIT)
        editorToApply = {
          ...nextEditor,
          undoStack: nextUndoStack,
          redoStack: [],
        }
      }
    }
    state = {
      ...state,
      editor: editorToApply,
    }
    clearAiIdleTimer({ clearPending: true })
    const editor = state.editor
    if (!editor) return
    const hasConflictingInFlightSave = inFlightSave?.noteKey === editor.note.key && inFlightSave.body !== editor.body
    if (!editor.dirty && !hasConflictingInFlightSave) {
      clearAutosaveTimer()
      clearAiIdleTimer()
      state = {
        ...state,
        editor: {
          ...editor,
          autosaveStatus: "saved",
          statusMessage: null,
        },
      }
      notifyAutosaveStateChange()
      return
    }
    const editorBeforePending = state.editor
    state = markAutosavePending(state)
    if (state.editor) {
      state = {
        ...state,
        editor: {
          ...state.editor,
          dirty: editorBeforePending?.dirty || hasConflictingInFlightSave,
          statusMessage: null,
        },
      }
    }
    notifyAutosaveStateChange()
    scheduleAutosave()
  }

  function codePointLength(text: string): number {
    return Array.from(text).length
  }

  function normalizeEditorOffset(offset: number, body: string): number {
    const finiteOffset = Number.isFinite(offset) ? Math.trunc(offset) : 0
    return Math.max(0, Math.min(finiteOffset, codePointLength(body)))
  }

  function currentEditorSelection(editor: EditorBufferState): EditorSelection {
    const bodyLength = codePointLength(editor.body)
    const fallback = normalizeEditorOffset(editor.cursorOffset ?? bodyLength, editor.body)
    const start = normalizeEditorOffset(editor.selectionStart ?? fallback, editor.body)
    const end = normalizeEditorOffset(editor.selectionEnd ?? fallback, editor.body)
    const rangeStart = Math.min(start, end)
    const rangeEnd = Math.max(start, end)
    const text = Array.from(editor.body).slice(rangeStart, rangeEnd).join("")
    return { start: rangeStart, end: rangeEnd, text, collapsed: rangeStart === rangeEnd }
  }

  function applyEditorEditResult(result: { editor: EditorBufferState; selection: EditorSelection }): void {
    applyEditorChange({
      ...result.editor,
      cursorOffset: result.selection.end,
      selectionStart: result.selection.start,
      selectionEnd: result.selection.end,
      preferredColumn: null,
    })
  }

  function moveManagerNote(sourceKey: string, sourceRelativePath: string, destinationFolder: string): WorkspaceActionResult {
    const normalizedDestination = normalizeWorkspaceRelativePath(destinationFolder)
    if (!deps.moveNote) {
      setManagerStatus("Move note unavailable")
      applyManagerBrowserModel()
      return ok()
    }
    try {
      const moved = deps.moveNote(sourceKey, normalizedDestination)
      if (state.editor?.note.key === sourceKey || state.editor?.note.relativePath === sourceRelativePath) {
        updateOpenEditorNotePreservingScreen(moved)
      }
      clearManagerPreviewCache()
      deps.rebuildIndexes?.()
      refreshManager()
      setManagerStatus("Moved")
      applyManagerBrowserModel()
      return ok()
    } catch (error) {
      clearManagerPreviewCache()
      setManagerStatus(error instanceof Error ? error.message : "Move failed")
      applyManagerBrowserModel()
      return ok()
    }
  }

  function promoteManagerDraft(sourceKey: string, sourceRelativePath: string, title: string, destinationFolder: string): WorkspaceActionResult {
    const normalizedDestination = normalizeWorkspaceRelativePath(destinationFolder)
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setManagerStatus("Title required")
      applyManagerBrowserModel()
      return ok()
    }
    if (!deps.promoteDraft) {
      setManagerStatus("Save draft as unavailable")
      applyManagerBrowserModel()
      return ok()
    }
    try {
      const promoted = deps.promoteDraft(sourceKey, trimmedTitle, normalizedDestination)
      clearManagerPreviewCache()
      deps.rebuildIndexes?.()
      refreshManager()
      setEditorNote(promoted)
      state = {
        ...state,
        manager: {
          ...state.manager,
          actionDraft: null,
          status: null,
        },
      }
      setManagerStatus("Draft saved as normal note")
      applyManagerBrowserModel()
      return ok()
    } catch (error) {
      clearManagerPreviewCache()
      const status = error instanceof Error ? error.message : "Save draft as failed"
      setManagerStatus(status)
      state = {
        ...state,
        manager: {
          ...state.manager,
          actionDraft: state.manager.actionDraft ? { ...state.manager.actionDraft, status } : null,
        },
      }
      applyManagerBrowserModel()
      return ok()
    }
  }

  const controller: WorkspaceController = {
    getState: () => cloneStateSnapshot(state),

    getManagerBrowserModel: () => buildManagerBrowserModel(noteSummaries, state.manager, {
      previewVisible: state.manager.previewVisible ?? true,
      hiddenReason: "manual",
      getPreviewBody: hydrateManagerPreviewBody,
      userFolderPaths,
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
      recordManagerAiActivity()
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
      recordManagerAiActivity()
    },

    openFocusedManagerItem: (options = {}) => {
      const focused = focusedManagerBrowserItem(state.manager).item
      if (!focused) {
        return ok()
      }

      if (focused.type === "folder") {
        const previousMode = state.mode
        const previousActionDraft = state.manager.actionDraft
        const opened = openManagerBrowserItem(state.manager, { showNote: deps.showNote })
        if (opened.type === "folder") {
          const shouldPreserveActionMode = previousActionDraft
            && (previousMode === "manager.move" || previousMode === "manager.saveDraftAs")
          const nextState = clearManagerFilterState({
            ...state,
            screen: "manager",
            mode: "manager.browse",
            search: null,
            manager: opened.state,
          })
          state = shouldPreserveActionMode
            ? {
                ...nextState,
                mode: previousMode,
                manager: { ...nextState.manager, actionDraft: previousActionDraft },
              }
            : nextState
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
        setManagerStatus(dirtyEditorManagerStatus)
        return dirtyBlocked()
      }

      queuePendingAiIdleWorkBeforeOpeningNote(focused.key)

      state = clearManagerFilterState(state)
      const note = deps.showNote(focused.key)
      setEditorNote(note)
      return ok()
    },

    openFocusedManagerFolder: () => {
      const focused = focusedManagerBrowserItem(state.manager).item
      if (!focused || focused.type !== "folder") {
        return ok()
      }
      return controller.openFocusedManagerItem()
    },

    goToManagerParent: (options = {}) => {
      if (state.screen !== "manager") {
        return ok()
      }
      const previousMode = state.mode
      const previousActionDraft = state.manager.actionDraft
      const nextManager = goToManagerParent(state.manager)
      const shouldPreserveActionMode = options.preserveActionMode === true
        && previousActionDraft
        && (previousMode === "manager.move" || previousMode === "manager.saveDraftAs")
      state = {
        ...state,
        mode: shouldPreserveActionMode ? previousMode : "manager.browse",
        manager: shouldPreserveActionMode
          ? { ...nextManager, actionDraft: previousActionDraft }
          : nextManager,
      }
      applyManagerBrowserModel()
      return ok()
    },

    goBack: () => {
      if (state.screen === "search" || state.mode === "editor.find" || state.mode === "editor.replace" || state.mode === "manager.filter" || state.mode === "manager.create" || state.mode === "manager.rename" || state.mode === "manager.move" || state.mode === "manager.saveDraftAs" || state.mode === "manager.deleteConfirm") {
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
        return controller.goToManagerParent()
      }

      if (state.screen === "editor") {
        const selectorLeavingEditor = state.editor?.note.key ?? null
        state = {
          ...state,
          screen: "manager",
          mode: "manager.browse",
          search: null,
        }
        applyManagerBrowserModel()
        if (selectorLeavingEditor && aiIdlePendingSelector === selectorLeavingEditor) {
          scheduleManagerAiIdleWork(selectorLeavingEditor)
        }
      }
      return ok()
    },

    openManagerFilter: () => {
      state = setManagerFilterState(state, state.manager.filterQuery ?? "")
      applyManagerBrowserModel()
    },

    openManagerCreate: () => {
      const currentFolderPath = state.manager.currentFolderPath ?? ""
      const parts = normalizeWorkspaceRelativePath(currentFolderPath).split("/").filter(Boolean)
      if (parts[0] === "draft") {
        setManagerStatus("New draft shortcut creates drafts; folders are unavailable in draft")
        applyManagerBrowserModel()
        return
      }
      if (!canCreateManagerFolderAt(currentFolderPath)) {
        setManagerStatus("Note creation is unavailable here")
        applyManagerBrowserModel()
        return
      }
      state = openManagerCreateState(state)
      applyManagerBrowserModel()
    },

    toggleManagerCreateKind: () => {
      if (state.mode !== "manager.create" || !state.manager.createDraft) {
        return
      }
      if (!canCreateManagerFolderAt(state.manager.currentFolderPath)) {
        state = setManagerCreateStatus(state, "Folder creation is unavailable here")
        applyManagerBrowserModel()
        return
      }
      state = {
        ...state,
        manager: {
          ...state.manager,
          createDraft: {
            ...state.manager.createDraft,
            kind: state.manager.createDraft.kind === "folder" ? "note" : "folder",
            status: null,
          },
        },
      }
      applyManagerBrowserModel()
    },

    quickNewDraft: () => {
      if (editorRequiresDestructiveConfirmation(state.editor)) {
        const status = "Save or discard current changes before creating a new draft"
        if (state.editor) {
          state = { ...state, editor: { ...state.editor, statusMessage: status } }
          setManagerStatus(status)
        } else {
          setManagerStatus(status)
          applyManagerBrowserModel()
        }
        return dirtyBlocked()
      }
      if (!deps.createDraft) {
        setManagerStatus("Create draft unavailable")
        applyManagerBrowserModel()
        return ok()
      }
      try {
        const created = deps.createDraft()
        deps.rebuildIndexes?.()
        refreshManager()
        setEditorNote(created)
        return ok()
      } catch (error) {
        const status = error instanceof Error ? error.message : "Create draft failed"
        if (state.editor) {
          state = { ...state, editor: { ...state.editor, statusMessage: status } }
        } else {
          setManagerStatus(status)
          applyManagerBrowserModel()
        }
        return ok()
      }
    },

    updateManagerCreateTitle: (title) => {
      state = setManagerCreateTitleState(state, title)
      applyManagerBrowserModel()
    },

    submitManagerCreate: async () => {
      const title = state.manager.createDraft?.title.trim() ?? ""
      const createKind = state.manager.createDraft?.kind ?? "note"
      if (!title) {
        state = setManagerCreateStatus(state, createKind === "folder" ? "Folder name required" : "Title required")
        applyManagerBrowserModel()
        return ok()
      }

      const parentFolderPath = normalizeWorkspaceRelativePath(state.manager.currentFolderPath)
      if (!canCreateManagerFolderAt(parentFolderPath)) {
        state = setManagerCreateStatus(state, createKind === "folder" ? "Folder creation is unavailable here" : "Note creation is unavailable here")
        applyManagerBrowserModel()
        return ok()
      }

      try {
        if (createKind === "note") {
          if (editorRequiresDestructiveConfirmation(state.editor)) {
            state = setManagerCreateStatus(state, "Save or discard current changes before creating a note")
            applyManagerBrowserModel()
            return dirtyBlocked()
          }
          if (!deps.createNote) {
            state = setManagerCreateStatus(state, "Create note unavailable")
            applyManagerBrowserModel()
            return ok()
          }
          const created = deps.createNote(title, parentFolderPath)
          clearManagerPreviewCache()
          deps.rebuildIndexes?.()
          refreshManager()
          state = cancelManagerCreateState(state)
          setEditorNote(created)
          return ok()
        }

        const folderName = folderNameSegmentFromTitle(title)
        if (!folderName) {
          state = setManagerCreateStatus(state, "Folder name required")
          applyManagerBrowserModel()
          return ok()
        }
        if (!deps.createFolder) {
          state = setManagerCreateStatus(state, "Create folder unavailable")
          applyManagerBrowserModel()
          return ok()
        }
        const folderRelativePath = `${parentFolderPath}/${folderName}`
        deps.createFolder(folderRelativePath)

        clearManagerPreviewCache()
        deps.rebuildIndexes?.()
        refreshManager()
        state = cancelManagerCreateState(state)
        state = {
          ...state,
          screen: "manager",
          mode: "manager.browse",
          manager: {
            ...state.manager,
            currentFolderPath: parentFolderPath,
            hoveredPath: null,
            focusedIndex: 0,
            status: null,
          },
        }
        applyManagerBrowserModel()
        return ok()
      } catch {
        clearManagerPreviewCache()
        state = setManagerCreateStatus(state, createKind === "folder" ? "Create folder failed" : "Create note failed")
        applyManagerBrowserModel()
        return ok()
      }
    },

    cancelManagerCreate: () => {
      state = cancelManagerCreateState(state)
      applyManagerBrowserModel()
    },

    openManagerRename: () => {
      const focused = focusedManagerBrowserItem(state.manager).item
      if (!focused) {
        setManagerStatus("Rename target required")
        applyManagerBrowserModel()
        return
      }
      state = {
        ...state,
        screen: "manager",
        mode: "manager.rename",
        manager: {
          ...state.manager,
          items: state.manager.items.map((item) => ({ ...item })),
          status: null,
          actionDraft: { kind: "rename", input: focused.title, status: null },
        },
        search: null,
      }
      applyManagerBrowserModel()
    },

    openManagerMove: () => {
      const focused = focusedManagerBrowserItem(state.manager).item
      if (!focused || focused.type !== "note") {
        setManagerStatus("Move note unavailable")
        applyManagerBrowserModel()
        return ok()
      }
      if (isDraftRelativePath(focused.relativePath)) {
        setManagerStatus("Use Save Draft As to move drafts into note folders")
        applyManagerBrowserModel()
        return ok()
      }
      state = {
        ...state,
        screen: "manager",
        mode: "manager.move",
        manager: {
          ...state.manager,
          items: state.manager.items.map((item) => ({ ...item })),
          status: null,
          actionDraft: {
            kind: "move",
            input: state.manager.currentFolderPath || "note",
            status: null,
            sourceKey: focused.key,
            sourceRelativePath: focused.relativePath,
          },
        },
        search: null,
      }
      applyManagerBrowserModel()
      return ok()
    },

    openSaveDraftAs: () => {
      const draft = state.editor?.note
      if (draft && isDraftRelativePath(draft.relativePath) && editorRequiresDestructiveConfirmation(state.editor)) {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        state = {
          ...state,
          screen: "editor",
          mode: "editor.body",
          editor: state.editor ? { ...state.editor, statusMessage: "Save the current draft before Save As" } : state.editor,
        }
        return dirtyBlocked()
      }
      if (!draft || !isDraftRelativePath(draft.relativePath)) {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        if (state.editor) {
          state = {
            ...state,
            screen: "editor",
            mode: "editor.body",
            editor: { ...state.editor, statusMessage: "Save draft as is only available for drafts" },
          }
        } else {
          setManagerStatus("Save draft as is only available for drafts")
          applyManagerBrowserModel()
        }
        return ok()
      }
      state = {
        ...state,
        screen: "manager",
        mode: "manager.saveDraftAs",
        search: null,
        manager: {
          ...state.manager,
          currentFolderPath: "note",
          hoveredPath: null,
          focusedIndex: 0,
          status: null,
          actionDraft: {
            kind: "saveDraftAs",
            input: draft.title,
            status: null,
            sourceKey: draft.key,
            sourceRelativePath: draft.relativePath,
          },
        },
      }
      applyManagerBrowserModel()
      return ok()
    },

    updateManagerActionInput: (input) => {
      const draft = state.manager.actionDraft
      if (!draft || (state.mode !== "manager.rename" && state.mode !== "manager.move" && state.mode !== "manager.saveDraftAs")) {
        return
      }
      if (draft.kind === "move") {
        return
      }
      state = {
        ...state,
        screen: "manager",
        manager: {
          ...state.manager,
          items: state.manager.items.map((item) => ({ ...item })),
          actionDraft: { ...draft, input, status: null },
        },
        search: null,
      }
      applyManagerBrowserModel()
    },

    submitManagerAction: () => {
      const draft = state.manager.actionDraft
      if (!draft) {
        return ok()
      }
      const focusedActionItem = focusedManagerBrowserItem(state.manager).item
      const result = draft.kind === "rename"
        ? controller.renameFocusedManagerItem(draft.input)
        : draft.kind === "saveDraftAs"
          ? promoteManagerDraft(
              draft.sourceKey ?? "",
              draft.sourceRelativePath ?? "",
              draft.input,
              focusedActionItem?.type === "folder" ? focusedActionItem.relativePath : state.manager.currentFolderPath || "note",
            )
          : moveManagerNote(
              draft.sourceKey ?? "",
              draft.sourceRelativePath ?? "",
              focusedActionItem?.type === "folder" ? focusedActionItem.relativePath : state.manager.currentFolderPath || draft.input,
            )
      if (draft.kind !== "saveDraftAs") {
        state = {
          ...state,
          mode: "manager.browse",
          manager: {
            ...state.manager,
            items: state.manager.items.map((item) => ({ ...item })),
            actionDraft: null,
          },
        }
        applyManagerBrowserModel()
      }
      return result
    },

    cancelManagerAction: () => {
      state = {
        ...state,
        screen: "manager",
        mode: "manager.browse",
        manager: {
          ...state.manager,
          items: state.manager.items.map((item) => ({ ...item })),
          status: null,
          actionDraft: null,
        },
        search: null,
      }
      applyManagerBrowserModel()
    },

    openManagerDeleteConfirmation: () => {
      const focused = state.manager.items[state.manager.focusedIndex]
      const activeEditorItem: ManagerItem | undefined = state.editor
        ? {
          type: "note",
          key: state.editor.note.key,
          filename: filenameForPath(state.editor.note.relativePath),
          title: state.editor.note.title,
          description: state.editor.note.description,
          relativePath: state.editor.note.relativePath,
        }
        : undefined
      const deleteTarget = focused ?? activeEditorItem
      if (!deleteTarget) {
        return
      }
      state = openManagerDeleteConfirmState(state, deleteTarget)
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

    renameFocusedManagerItem: (titleOrFolderName) => {
      const focused = focusedManagerBrowserItem(state.manager).item
      const nextName = titleOrFolderName.trim()
      if (!focused || !nextName) {
        setManagerStatus("Rename target required")
        applyManagerBrowserModel()
        return ok()
      }
      if (editorRequiresDestructiveConfirmation(state.editor)) {
        setManagerStatus(dirtyEditorManagerStatus)
        applyManagerBrowserModel()
        return dirtyBlocked()
      }
      try {
        if (focused.type === "folder") {
          if (!deps.renameFolder) {
            setManagerStatus("Rename folder unavailable")
            applyManagerBrowserModel()
            return ok()
          }
          deps.renameFolder(focused.relativePath, nextName)
          if (state.editor?.note.relativePath === focused.relativePath || state.editor?.note.relativePath.startsWith(`${focused.relativePath}/`)) {
            updateOpenEditorNotePreservingScreen(deps.showNote(state.editor.note.key))
          }
        } else {
          if (!deps.renameNote) {
            setManagerStatus("Rename note unavailable")
            applyManagerBrowserModel()
            return ok()
          }
          const renamed = deps.renameNote(focused.key, nextName)
          if (state.editor?.note.key === focused.key || state.editor?.note.relativePath === focused.relativePath) {
            updateOpenEditorNotePreservingScreen(renamed)
          }
        }
        clearManagerPreviewCache()
        deps.rebuildIndexes?.()
        refreshManager()
        setManagerStatus("Renamed")
        applyManagerBrowserModel()
        return ok()
      } catch (error) {
        clearManagerPreviewCache()
        setManagerStatus(error instanceof Error ? error.message : "Rename failed")
        applyManagerBrowserModel()
        return ok()
      }
    },

    moveFocusedManagerNote: (destinationFolder) => {
      const focused = focusedManagerBrowserItem(state.manager).item
      const normalizedDestination = normalizeWorkspaceRelativePath(destinationFolder)
      if (!focused || focused.type !== "note") {
        setManagerStatus("Move note unavailable")
        applyManagerBrowserModel()
        return ok()
      }
      if (editorRequiresDestructiveConfirmation(state.editor)) {
        setManagerStatus(dirtyEditorManagerStatus)
        applyManagerBrowserModel()
        return dirtyBlocked()
      }
      return moveManagerNote(focused.key, focused.relativePath, normalizedDestination)
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

    toggleSearchPreview: () => {
      if (!state.search) {
        return
      }

      state = {
        ...state,
        search: {
          ...state.search,
          previewVisible: !(state.search.previewVisible ?? true),
        },
      }
    },

    setSearchPreviewVisible: (visible) => {
      if (!state.search) {
        return
      }

      state = {
        ...state,
        search: {
          ...state.search,
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
        mode: "editor.find",
      })
    },

    openEditorReplace: (query = "") => {
      if (!state.editor) {
        return
      }
      const findState = findInEditorBody(state.editor, query)
      state = openEditorFindState(state, {
        query: findState.query,
        replacementText: "",
        replaceField: "find",
        matchCount: findState.matches.length,
        activeIndex: findState.currentIndex >= 0 ? findState.currentIndex : null,
        mode: "editor.replace",
      })
    },

    updateEditorFindQuery: (query) => {
      if (!state.editor) {
        return
      }
      const findState = findInEditorBody(state.editor, query)
      state = openEditorFindState(state, {
        query: findState.query,
        replacementText: state.editor.replacementText ?? "",
        replaceField: state.mode === "editor.replace" ? state.editor.replaceField ?? "find" : state.editor.replaceField,
        matchCount: findState.matches.length,
        activeIndex: findState.currentIndex >= 0 ? findState.currentIndex : null,
        mode: state.mode === "editor.replace" ? "editor.replace" : "editor.find",
      })
    },

    updateEditorReplacement: (replacementText) => {
      if (!state.editor) {
        return
      }
      state = openEditorFindState(state, {
        query: state.editor.findQuery ?? "",
        replacementText,
        replaceField: state.editor.replaceField ?? "replacement",
        matchCount: state.editor.findMatchCount ?? 0,
        activeIndex: state.editor.activeFindIndex ?? null,
        mode: "editor.replace",
      })
    },

    setEditorReplaceField: (replaceField) => {
      if (!state.editor || state.mode !== "editor.replace") {
        return
      }
      state = {
        ...state,
        editor: {
          ...state.editor,
          replaceField,
        },
      }
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
        replacementText: state.editor.replacementText ?? "",
        replaceField: state.editor.replaceField ?? "find",
        matchCount: advanced.matches.length,
        activeIndex: advanced.currentIndex >= 0 ? advanced.currentIndex : null,
        mode: state.mode === "editor.replace" ? "editor.replace" : "editor.find",
      })
    },

    replaceCurrentEditorMatch: () => {
      if (!state.editor) return
      const findState = findInEditorBody(state.editor, state.editor.findQuery ?? "")
      const activeIndex = state.editor.activeFindIndex ?? findState.currentIndex
      const currentFindState = {
        ...findState,
        currentIndex: activeIndex,
        currentMatch: activeIndex >= 0 ? findState.matches[activeIndex] ?? null : null,
      }
      const result = replaceCurrentMatch(state.editor, currentFindState, state.editor.replacementText ?? "")
      applyEditorChange({
        ...result.editor,
        findQuery: result.findState.query,
        replacementText: state.editor.replacementText ?? "",
        findMatchCount: result.findState.matches.length,
        activeFindIndex: result.findState.currentIndex >= 0 ? result.findState.currentIndex : null,
      })
      state = openEditorFindState(state, {
        query: result.findState.query,
        replacementText: state.editor?.replacementText ?? "",
        replaceField: state.editor?.replaceField ?? "replacement",
        matchCount: result.findState.matches.length,
        activeIndex: result.findState.currentIndex >= 0 ? result.findState.currentIndex : null,
        mode: "editor.replace",
      })
    },

    replaceAllEditorMatches: () => {
      if (!state.editor) return
      const result = replaceAllMatches(state.editor, state.editor.findQuery ?? "", state.editor.replacementText ?? "")
      applyEditorChange({
        ...result.editor,
        findQuery: result.findState.query,
        replacementText: state.editor.replacementText ?? "",
        findMatchCount: result.findState.matches.length,
        activeFindIndex: result.findState.currentIndex >= 0 ? result.findState.currentIndex : null,
      })
      state = openEditorFindState(state, {
        query: result.findState.query,
        replacementText: state.editor?.replacementText ?? "",
        replaceField: state.editor?.replaceField ?? "replacement",
        matchCount: result.findState.matches.length,
        activeIndex: result.findState.currentIndex >= 0 ? result.findState.currentIndex : null,
        mode: "editor.replace",
      })
    },

    undoEditor: () => {
      const editor = state.editor
      const undoStack = editor?.undoStack ?? []
      if (!editor || undoStack.length === 0) {
        if (editor) {
          state = {
            ...state,
            editor: {
              ...editor,
              statusMessage: "Nothing to undo",
            },
          }
        }
        return
      }
      const snapshot = undoStack.at(-1)!
      const redoSnapshot = createEditorHistorySnapshot(editor)
      applyEditorChange({
        ...restoreEditorHistorySnapshot(editor, snapshot),
        undoStack: undoStack.slice(0, -1),
        redoStack: [...(editor.redoStack ?? []), redoSnapshot].slice(-EDITOR_HISTORY_LIMIT),
      }, { recordHistory: false })
    },

    redoEditor: () => {
      const editor = state.editor
      const redoStack = editor?.redoStack ?? []
      if (!editor || redoStack.length === 0) {
        if (editor) {
          state = {
            ...state,
            editor: {
              ...editor,
              statusMessage: "Nothing to redo",
            },
          }
        }
        return
      }
      const snapshot = redoStack.at(-1)!
      const undoSnapshot = createEditorHistorySnapshot(editor)
      applyEditorChange({
        ...restoreEditorHistorySnapshot(editor, snapshot),
        undoStack: [...(editor.undoStack ?? []), undoSnapshot].slice(-EDITOR_HISTORY_LIMIT),
        redoStack: redoStack.slice(0, -1),
      }, { recordHistory: false })
    },

    switchEditorNote,

    showManager: () => {
      const selectorLeavingEditor = state.screen === "editor" ? state.editor?.note.key ?? null : null
      const anchoredFolderPath = managerFolderForNotePath(state.editor?.note.relativePath) ?? state.manager.currentFolderPath ?? ""
      state = {
        ...state,
        screen: "manager",
        mode: "manager.browse",
        search: null,
        manager: {
          ...state.manager,
          currentFolderPath: anchoredFolderPath,
          hoveredPath: null,
          focusedIndex: 0,
        },
      }
      applyManagerBrowserModel()
      if (state.editor) {
        const activeNoteIndex = state.manager.items.findIndex((item) => item.type === "note" && item.key === state.editor?.note.key)
        if (activeNoteIndex !== -1) {
          const activeNoteItem = state.manager.items[activeNoteIndex]
          state = {
            ...state,
            manager: {
              ...state.manager,
              focusedIndex: activeNoteIndex,
              hoveredPath: activeNoteItem?.relativePath ?? null,
              selectedNoteKey: activeNoteItem?.key ?? null,
            },
          }
          applyManagerBrowserModel()
        }
      }
      if (selectorLeavingEditor && aiIdlePendingSelector === selectorLeavingEditor) {
        scheduleManagerAiIdleWork(selectorLeavingEditor)
      }
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
      const nextState = markEditorBodyChanged(state, body)
      if (!nextState.editor) {
        clearAutosaveTimer()
        return
      }
      applyEditorChange({
        ...nextState.editor,
        cursorOffset: previousEditor?.cursorOffset ?? Array.from(body).length,
        selectionStart: previousEditor?.cursorOffset ?? Array.from(body).length,
        selectionEnd: previousEditor?.cursorOffset ?? Array.from(body).length,
      })
    },

    insertEditorText: (text) => {
      if (!state.editor || text.length === 0) return
      applyEditorChange(insertTextAtEditorCursor(state.editor, text))
    },

    setEditorSelection: (start, end) => {
      if (!state.editor) return
      const normalizedStart = normalizeEditorOffset(start, state.editor.body)
      const normalizedEnd = normalizeEditorOffset(end, state.editor.body)
      state = {
        ...state,
        editor: {
          ...state.editor,
          cursorOffset: normalizedEnd,
          selectionStart: normalizedStart,
          selectionEnd: normalizedEnd,
          preferredColumn: null,
        },
      }
    },

    copyAllEditorBody: () => {
      if (!state.editor) return ""
      try {
        const text = state.editor.body
        const writeResult = clipboard.writeText(text)
        setEditorStatus(clipboardWriteStatus("Copied", text, writeResult))
        return text
      } catch {
        setEditorStatus("Clipboard unavailable for copy-all")
        return ""
      }
    },

    replaceAllEditorBodyFromClipboard: () => {
      if (!state.editor) return
      if (clipboard.canRead === false) {
        setEditorStatus("Clipboard replace-all unavailable; desktop clipboard cannot be read")
        return
      }
      const readResult = clipboard.readTextWithResult?.() ?? null
      const text = readResult?.text ?? clipboard.readText()
      if (readResult && (!readResult.ok || readResult.category !== "desktop")) {
        setEditorStatus("Clipboard replace-all unavailable; desktop clipboard cannot be read")
        return
      }
      if (!readResult && clipboard.clipboardStatus?.().desktopReadAvailable === false) {
        setEditorStatus("Clipboard replace-all unavailable; desktop clipboard cannot be read")
        return
      }
      if (text.length === 0) {
        setEditorStatus("Clipboard replace-all skipped; clipboard is empty or unavailable")
        return
      }
      const replaced = replaceEditorBody(state.editor, text)
      applyEditorChange(replaced)
      setEditorStatus(clipboardReplaceAllStatus(text, readResult))
    },

    pasteEditorClipboard: (text) => {
      if (!state.editor) return
      if (text === undefined && clipboard.canRead === false) {
        setEditorStatus("Clipboard paste unavailable; use terminal paste instead")
        return
      }
      const selection = currentEditorSelection(state.editor)
      const readResult = text === undefined ? clipboard.readTextWithResult?.() ?? null : null
      const pastedText = text ?? readResult?.text ?? clipboard.readText()
      if (pastedText.length === 0) {
        setEditorStatus(text === undefined ? "Clipboard is empty or unavailable" : "Paste text was empty")
        return
      }
      const result = pasteText(state.editor, selection, pastedText)
      if (result.editor.body === state.editor.body && result.selection.start === selection.start && result.selection.end === selection.end) {
        return
      }
      applyEditorEditResult(result)
      setEditorStatus(text === undefined ? clipboardReadStatus(pastedText, readResult) : `Pasted ${charCountLabel(pastedText)}`)
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
      const nextEditor = moveEditorCursor(state.editor, direction)
      state = {
        ...state,
        editor: nextEditor,
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
      const hasChangedBody = state.editor.savedBody !== submittedBody
      try {
        const coalescedWithInFlight = inFlightSave?.noteKey === noteToPersist.key && inFlightSave.body === submittedBody
        const persistedNote = persistEditorSnapshotCoalesced(noteToPersist, submittedBody)

        if (isPromiseLike(persistedNote)) {
          try {
            const savedNote = await persistedNote
            if (disposed) {
              return ok()
            }
            applySavedEditorAndPreviewCache(savedNote, submittedBody)
            if (hasChangedBody && didApplySavedSnapshot(noteToPersist.key, submittedBody)) {
              scheduleSavedNoteAiIdleWork(noteToPersist.key)
            }
            return ok()
          } catch (error) {
            if (!coalescedWithInFlight || state.editor?.note.key !== noteToPersist.key || state.editor.body !== submittedBody) {
              throw error
            }
            const retriedNote = persistEditorSnapshot(noteToPersist, submittedBody)
            const savedNote = isPromiseLike(retriedNote) ? await retriedNote : retriedNote
            if (disposed) {
              return ok()
            }
            applySavedEditorAndPreviewCache(savedNote, submittedBody)
            if (hasChangedBody && didApplySavedSnapshot(noteToPersist.key, submittedBody)) {
              scheduleSavedNoteAiIdleWork(noteToPersist.key)
            }
            return ok()
          }
        }

        applySavedEditorAndPreviewCache(persistedNote, submittedBody)
        if (hasChangedBody && didApplySavedSnapshot(noteToPersist.key, submittedBody)) {
          scheduleSavedNoteAiIdleWork(noteToPersist.key)
        }
        return ok()
      } catch {
        if (disposed) {
          return ok()
        }
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
          resultScrollOffset: 0,
          status: null,
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
      hydrateSelectedSearchPreview()
    },

    cancelSearch: () => {
      state = closeSearchEverything(state)
      searchResults = []
    },

    dispose: () => {
      disposed = true
      clearAutosaveTimer()
      clearAiIdleTimer()
      clearNoteSwitchIndicatorTimer()
      autosaveStateChangeHandler = null
    },

    startAiStartupScan,

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
      const actionResult = controller.runCommand(command, options)
      if (actionResult.blocked) {
        return actionResult
      }
      if (!state.search) {
        searchResults = []
      }
      return ok()
    },

    runCommand: (command, options = {}) => {
      if (mustConfirmDirtyDestructiveAction(state, command, options)) {
        return dirtyBlocked()
      }

      const commandName = commandNameFor(command)
      const handler = deps.commandHandlers?.[commandName]
      if (commandName === "/save") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        void controller.saveEditor()
        return ok()
      }

      if (commandName === "/save-draft-as") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        return controller.openSaveDraftAs()
      }

      if (commandName === "/copy-all") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        controller.copyAllEditorBody()
        return ok()
      }

      if (commandName === "/replace-all") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        controller.replaceAllEditorBodyFromClipboard()
        return ok()
      }

      if (commandName === "/paste") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        controller.pasteEditorClipboard()
        return ok()
      }

      if (commandName === "/ai-describe") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        clearAiIdleTimer({ clearPending: true })
        startAiDescribe()
        return ok()
      }

      if (commandName === "/ai-process-queue") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        clearAiIdleTimer({ clearPending: true })
        startAiProcessQueue()
        return ok()
      }

      if (commandName === "/ai-status") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        clearAiIdleTimer({ clearPending: true })
        nextAiOperationId()
        const currentStatus = deps.aiActions?.getStatus?.()
        if (currentStatus) {
          setAiStatus(currentStatus)
        } else {
          notifyAutosaveStateChange()
        }
        return ok()
      }

      if (handler) {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        handler({ state: cloneStateSnapshot(state), command })
        return ok()
      }

      if (commandName === "/find") {
        const query = commandArgumentsFor(command)
        if (state.search) {
          state = closeSearchEverything(state)
        }
        controller.openEditorFind(query)
        return ok()
      }

      if (commandName === "/replace") {
        const query = commandArgumentsFor(command)
        if (state.search) {
          state = closeSearchEverything(state)
        }
        controller.openEditorReplace(query)
        return ok()
      }

      if (commandName === "/new") {
        if (state.search) {
          state = closeSearchEverything(state)
        }
        state = {
          ...state,
          screen: "manager",
          mode: "manager.browse",
          search: null,
        }
        applyManagerBrowserModel()
        controller.openManagerCreate()
        const title = commandArgumentsFor(command)
        if (title.length > 0) {
          controller.updateManagerCreateTitle(title)
        }
        return ok()
      }

      if (commandName === "/delete") {
        const invokedFromEditor = state.search?.previousScreen === "editor" || (state.screen === "editor" && !state.search)
        const commandDeleteTarget: ManagerItem | undefined = invokedFromEditor && state.editor
          ? {
            type: "note",
            key: state.editor.note.key,
            filename: filenameForPath(state.editor.note.relativePath),
            title: state.editor.note.title,
            description: state.editor.note.description,
            relativePath: state.editor.note.relativePath,
          }
          : undefined
        if (state.search) {
          state = closeSearchEverything(state)
        }
        state = {
          ...state,
          screen: "manager",
          mode: "manager.browse",
          search: null,
        }
        applyManagerBrowserModel()
        if (commandDeleteTarget) {
          state = openManagerDeleteConfirmState(state, commandDeleteTarget)
          applyManagerBrowserModel()
        } else {
          controller.openManagerDeleteConfirmation()
        }
        return ok()
      }

      if (state.search) {
        state = {
          ...state,
          search: {
            ...state.search,
            status: `Command unavailable: ${commandName}`,
          },
        }
      }
      return ok()
    },
  }

  refreshManager()
  if (deps.initialNote) {
    setEditorNote(deps.initialNote)
  }

  return controller
}
