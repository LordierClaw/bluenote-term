export type TuiScreen = "manager" | "editor" | "search"
export type TuiMode =
  | "manager.browse"
  | "manager.filter"
  | "manager.create"
  | "manager.deleteConfirm"
  | "editor.body"
  | "editor.find"
  | "editor.replace"
  | "search.input"

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error"
export type EditorReplaceField = "find" | "replacement"

export interface AiQueueStatusState {
  queued: number
  failed?: number
}

export interface AiQueueProgressState {
  processed: number
  total: number
}

export type AiStatusState =
  | { kind: "not-configured" }
  | { kind: "auth-required"; reason: string; queue?: AiQueueStatusState }
  | { kind: "connected"; model: string; queue?: AiQueueStatusState }
  | { kind: "running"; key?: string; count?: number; progress?: AiQueueProgressState; queue?: AiQueueStatusState }
  | { kind: "updated"; key?: string; count?: number; queue?: AiQueueStatusState }
  | { kind: "error"; reason: string; queue?: AiQueueStatusState }

export interface ManagerItem {
  type: "note" | "folder"
  key: string
  filename: string
  title: string
  description: string
  relativePath: string
}

export interface TuiNote {
  key: string
  title: string
  description: string
  relativePath: string
  body: string
  createdAt?: string
  updatedAt?: string
  modifiedAt?: string
}

export interface ManagerState {
  items: ManagerItem[]
  focusedIndex: number
  selectedNoteKey: string | null
  previewVisible?: boolean
  currentFolderPath?: string
  hoveredPath?: string | null
  filterQuery?: string
  status?: string | null
  createDraft?: ManagerCreateDraft | null
  deleteDraft?: ManagerDeleteDraft | null
}

export interface ManagerCreateDraft {
  title: string
  status: string | null
}

export interface ManagerDeleteDraft {
  key: string
  title: string
  relativePath: string
  status: string | null
}

export interface EditorBufferState {
  note: TuiNote
  body: string
  savedBody: string
  dirty: boolean
  cursorOffset?: number
  selectionStart?: number
  selectionEnd?: number
  preferredColumn?: number | null
  wrapMode?: "word" | "none"
  findQuery?: string
  replacementText?: string
  replaceField?: EditorReplaceField
  findMatchCount?: number
  activeFindIndex?: number | null
  autosaveStatus?: AutosaveStatus
  statusMessage?: string | null
  undoStack?: EditorHistorySnapshot[]
  redoStack?: EditorHistorySnapshot[]
}

export interface EditorHistorySnapshot {
  body: string
  savedBody: string
  dirty: boolean
  cursorOffset?: number
  selectionStart?: number
  selectionEnd?: number
  preferredColumn?: number | null
  wrapMode?: "word" | "none"
  findQuery?: string
  replacementText?: string
  replaceField?: EditorReplaceField
  findMatchCount?: number
  activeFindIndex?: number | null
}

export interface SearchEverythingState {
  query: string
  selectedIndex: number
  resultScrollOffset?: number
  previousScreen: Exclude<TuiScreen, "search">
  previousMode?: Exclude<TuiMode, "search.input">
  previewVisible?: boolean
  status?: string | null
}

export interface TuiState {
  screen: TuiScreen
  mode?: TuiMode
  manager: ManagerState
  editor: EditorBufferState | null
  search: SearchEverythingState | null
  ai?: AiStatusState
}

export interface CreateInitialTuiStateOptions {
  manager?: Partial<ManagerState>
  ai?: AiStatusState
}

export interface OpenSearchEverythingOptions {
  query?: string
  selectedIndex?: number
}

export interface OpenEditorFindOptions {
  query?: string
  matchCount?: number
  activeIndex?: number | null
  mode?: "editor.find" | "editor.replace"
  replacementText?: string
  replaceField?: EditorReplaceField
}

function cloneManagerItems(items: ManagerItem[]): ManagerItem[] {
  return items.map((item) => ({ ...item }))
}

function cloneNote(note: TuiNote): TuiNote {
  return { ...note }
}

function cloneAiStatus(ai: AiStatusState | null | undefined): AiStatusState {
  if (!ai) {
    return { kind: "not-configured" }
  }
  return { ...ai }
}

function normalizeManagerPath(path: string | null | undefined): string {
  return (path ?? "").replace(/^\/+|\/+$/gu, "")
}

function stableModeForScreen(screen: TuiScreen): TuiMode {
  if (screen === "editor") {
    return "editor.body"
  }

  if (screen === "search") {
    return "search.input"
  }

  return "manager.browse"
}

function currentMode(state: TuiState): TuiMode {
  return state.mode ?? stableModeForScreen(state.screen)
}

function cloneManagerState(manager: ManagerState): ManagerState {
  return {
    ...manager,
    items: cloneManagerItems(manager.items),
    currentFolderPath: normalizeManagerPath(manager.currentFolderPath),
    previewVisible: manager.previewVisible ?? true,
    hoveredPath: manager.hoveredPath ?? null,
    filterQuery: manager.filterQuery ?? "",
    status: manager.status ?? null,
    createDraft: manager.createDraft ? { ...manager.createDraft } : null,
    deleteDraft: manager.deleteDraft ? { ...manager.deleteDraft } : null,
  }
}

function cloneSearchEverythingState(search: SearchEverythingState): SearchEverythingState {
  return {
    ...search,
    resultScrollOffset: Math.max(0, Math.trunc(search.resultScrollOffset ?? 0)),
    previewVisible: search.previewVisible ?? true,
    status: search.status ?? null,
  }
}

function cloneEditorHistorySnapshot(snapshot: EditorHistorySnapshot): EditorHistorySnapshot {
  return { ...snapshot }
}

function cloneEditorHistory(stack: EditorHistorySnapshot[] | undefined): EditorHistorySnapshot[] {
  return stack?.map(cloneEditorHistorySnapshot) ?? []
}

const defaultManagerState = (): ManagerState => ({
  items: [],
  focusedIndex: 0,
  selectedNoteKey: null,
  previewVisible: true,
  currentFolderPath: "",
  hoveredPath: null,
  filterQuery: "",
  status: null,
  createDraft: null,
  deleteDraft: null,
})

export function createInitialTuiState(options: CreateInitialTuiStateOptions = {}): TuiState {
  const manager = {
    ...defaultManagerState(),
    ...options.manager,
  }

  return {
    screen: "manager",
    mode: "manager.browse",
    manager: cloneManagerState(manager),
    editor: null,
    search: null,
    ai: cloneAiStatus(options.ai),
  }
}

export function openSearchEverything(
  state: TuiState,
  options: OpenSearchEverythingOptions = {},
): TuiState {
  const previousScreen = state.screen === "search" ? state.search?.previousScreen ?? "manager" : state.screen
  const previousMode: Exclude<TuiMode, "search.input"> =
    state.screen === "search"
      ? state.search?.previousMode ?? (stableModeForScreen(previousScreen) as Exclude<TuiMode, "search.input">)
      : (currentMode(state) as Exclude<TuiMode, "search.input">)

  return {
    ...state,
    screen: "search",
    mode: "search.input",
    search: cloneSearchEverythingState({
      query: options.query ?? "",
      selectedIndex: options.selectedIndex ?? 0,
      resultScrollOffset: 0,
      previousScreen,
      previousMode,
      previewVisible: true,
      status: null,
    }),
  }
}

export function closeSearchEverything(state: TuiState): TuiState {
  const previousScreen = state.search?.previousScreen ?? "manager"

  return {
    ...state,
    screen: previousScreen,
    mode: state.search?.previousMode ?? stableModeForScreen(previousScreen),
    search: null,
  }
}

export function openEditorForNote(state: TuiState, note: TuiNote): TuiState {
  const editorNote = cloneNote(note)
  const cursorOffset = Array.from(editorNote.body).length

  return {
    ...state,
    screen: "editor",
    mode: "editor.body",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      selectedNoteKey: editorNote.key,
    },
    editor: {
      note: editorNote,
      body: editorNote.body,
      savedBody: editorNote.body,
      dirty: false,
      cursorOffset,
      selectionStart: cursorOffset,
      selectionEnd: cursorOffset,
      preferredColumn: null,
      wrapMode: "word",
      findQuery: "",
      replacementText: "",
      replaceField: "find",
      findMatchCount: 0,
      activeFindIndex: null,
      autosaveStatus: "idle",
      statusMessage: null,
      undoStack: [],
      redoStack: [],
    },
    search: null,
  }
}

export function openEditorFind(state: TuiState, options: OpenEditorFindOptions = {}): TuiState {
  if (!state.editor) {
    return state
  }

  const activeFindIndex = Object.hasOwn(options, "activeIndex") ? options.activeIndex ?? null : state.editor.activeFindIndex ?? null

  return {
    ...state,
    screen: "editor",
    mode: options.mode ?? "editor.find",
    editor: {
      ...state.editor,
      findQuery: options.query ?? state.editor.findQuery ?? "",
      replacementText: options.replacementText ?? state.editor.replacementText ?? "",
      replaceField: options.mode === "editor.replace" ? options.replaceField ?? state.editor.replaceField ?? "find" : state.editor.replaceField ?? "find",
      findMatchCount: options.matchCount ?? state.editor.findMatchCount ?? 0,
      activeFindIndex,
    },
    search: null,
  }
}

export function closeEditorFind(state: TuiState): TuiState {
  if (!state.editor || (currentMode(state) !== "editor.find" && currentMode(state) !== "editor.replace")) {
    return state
  }

  return {
    ...state,
    screen: "editor",
    mode: "editor.body",
  }
}

export function setManagerFilter(state: TuiState, query: string): TuiState {
  return {
    ...state,
    screen: "manager",
    mode: "manager.filter",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      filterQuery: query,
    },
    search: null,
  }
}

export function clearManagerFilter(state: TuiState): TuiState {
  if (state.screen !== "manager" && currentMode(state) !== "manager.filter") {
    return state
  }

  return {
    ...state,
    screen: "manager",
    mode: "manager.browse",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      filterQuery: "",
    },
    search: null,
  }
}

export function openManagerCreate(state: TuiState): TuiState {
  return {
    ...state,
    screen: "manager",
    mode: "manager.create",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      status: null,
      createDraft: { title: "", status: null },
    },
    search: null,
  }
}

export function setManagerCreateTitle(state: TuiState, title: string): TuiState {
  if (currentMode(state) !== "manager.create") {
    return state
  }

  return {
    ...state,
    screen: "manager",
    mode: "manager.create",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      status: null,
      createDraft: { title, status: null },
    },
    search: null,
  }
}

export function setManagerCreateStatus(state: TuiState, status: string | null): TuiState {
  if (currentMode(state) !== "manager.create") {
    return state
  }

  return {
    ...state,
    screen: "manager",
    mode: "manager.create",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      createDraft: {
        title: state.manager.createDraft?.title ?? "",
        status,
      },
    },
    search: null,
  }
}

export function cancelManagerCreate(state: TuiState): TuiState {
  if (currentMode(state) !== "manager.create") {
    return state
  }

  return {
    ...state,
    screen: "manager",
    mode: "manager.browse",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      status: null,
      createDraft: null,
    },
    search: null,
  }
}

export function openManagerDeleteConfirm(state: TuiState, item: ManagerItem): TuiState {
  if (item.type !== "note") {
    return {
      ...state,
      screen: "manager",
      mode: "manager.browse",
      manager: {
        ...state.manager,
        items: cloneManagerItems(state.manager.items),
        status: "Folders cannot be deleted here",
        deleteDraft: null,
      },
      search: null,
    }
  }

  return {
    ...state,
    screen: "manager",
    mode: "manager.deleteConfirm",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      status: null,
      deleteDraft: {
        key: item.key,
        title: item.title,
        relativePath: item.relativePath,
        status: null,
      },
    },
    search: null,
  }
}

export function cancelManagerDeleteConfirm(state: TuiState): TuiState {
  if (currentMode(state) !== "manager.deleteConfirm") {
    return state
  }

  return {
    ...state,
    screen: "manager",
    mode: "manager.browse",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      status: null,
      deleteDraft: null,
    },
    search: null,
  }
}

export function setManagerFolderPath(state: TuiState, path: string): TuiState {
  return {
    ...state,
    screen: "manager",
    mode: "manager.browse",
    manager: {
      ...state.manager,
      items: cloneManagerItems(state.manager.items),
      currentFolderPath: normalizeManagerPath(path),
      hoveredPath: null,
      focusedIndex: 0,
    },
    search: null,
  }
}

export function goToManagerParent(state: TuiState): TuiState {
  const currentFolderPath = normalizeManagerPath(state.manager.currentFolderPath)
  const parentPath = currentFolderPath.includes("/") ? currentFolderPath.split("/").slice(0, -1).join("/") : ""

  return setManagerFolderPath(state, parentPath)
}

export function closeTransientMode(state: TuiState): TuiState {
  switch (currentMode(state)) {
    case "search.input":
      return closeSearchEverything(state)
    case "editor.find":
    case "editor.replace":
      return closeEditorFind(state)
    case "manager.filter":
      return clearManagerFilter(state)
    case "manager.create":
      return cancelManagerCreate(state)
    case "manager.deleteConfirm":
      return cancelManagerDeleteConfirm(state)
    default:
      return state
  }
}

export const EDITOR_HISTORY_LIMIT = 50

export function createEditorHistorySnapshot(editor: EditorBufferState): EditorHistorySnapshot {
  return {
    body: editor.body,
    savedBody: editor.savedBody,
    dirty: editor.dirty,
    cursorOffset: editor.cursorOffset,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
    preferredColumn: editor.preferredColumn ?? null,
    wrapMode: editor.wrapMode ?? "word",
    findQuery: editor.findQuery ?? "",
    replacementText: editor.replacementText ?? "",
    replaceField: editor.replaceField ?? "find",
    findMatchCount: editor.findMatchCount ?? 0,
    activeFindIndex: editor.activeFindIndex ?? null,
  }
}

export function editorHistorySnapshotsEqual(left: EditorHistorySnapshot, right: EditorHistorySnapshot): boolean {
  return left.body === right.body
    && left.savedBody === right.savedBody
    && left.dirty === right.dirty
    && left.cursorOffset === right.cursorOffset
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd
    && (left.preferredColumn ?? null) === (right.preferredColumn ?? null)
    && (left.wrapMode ?? "word") === (right.wrapMode ?? "word")
    && (left.findQuery ?? "") === (right.findQuery ?? "")
    && (left.replacementText ?? "") === (right.replacementText ?? "")
    && (left.replaceField ?? "find") === (right.replaceField ?? "find")
    && (left.findMatchCount ?? 0) === (right.findMatchCount ?? 0)
    && (left.activeFindIndex ?? null) === (right.activeFindIndex ?? null)
}

export function restoreEditorHistorySnapshot(editor: EditorBufferState, snapshot: EditorHistorySnapshot): EditorBufferState {
  return {
    ...editor,
    body: snapshot.body,
    savedBody: snapshot.savedBody,
    dirty: snapshot.body !== snapshot.savedBody,
    cursorOffset: snapshot.cursorOffset,
    selectionStart: snapshot.selectionStart,
    selectionEnd: snapshot.selectionEnd,
    preferredColumn: snapshot.preferredColumn ?? null,
    wrapMode: snapshot.wrapMode ?? "word",
    findQuery: snapshot.findQuery ?? "",
    replacementText: snapshot.replacementText ?? "",
    replaceField: snapshot.replaceField ?? "find",
    findMatchCount: snapshot.findMatchCount ?? 0,
    activeFindIndex: snapshot.activeFindIndex ?? null,
  }
}

export function markEditorBodyChanged(state: TuiState, body: string): TuiState {
  if (!state.editor) {
    return state
  }

  return {
    ...state,
    editor: {
      ...state.editor,
      body,
      dirty: body !== state.editor.savedBody,
      cursorOffset: Math.min(state.editor.cursorOffset ?? Array.from(body).length, Array.from(body).length),
      selectionStart: Math.min(state.editor.cursorOffset ?? Array.from(body).length, Array.from(body).length),
      selectionEnd: Math.min(state.editor.cursorOffset ?? Array.from(body).length, Array.from(body).length),
    },
  }
}

export function markEditorSaved(state: TuiState): TuiState {
  if (!state.editor) {
    return state
  }

  const savedBody = state.editor.body
  const rebaseHistory = (stack: EditorHistorySnapshot[] | undefined): EditorHistorySnapshot[] => cloneEditorHistory(stack).map((snapshot) => ({
    ...snapshot,
    savedBody,
    dirty: snapshot.body !== savedBody,
  }))

  return {
    ...state,
    editor: {
      ...state.editor,
      note: {
        ...state.editor.note,
        body: savedBody,
      },
      savedBody,
      dirty: false,
      autosaveStatus: "saved",
      undoStack: rebaseHistory(state.editor.undoStack),
      redoStack: rebaseHistory(state.editor.redoStack),
    },
  }
}

function markAutosaveStatus(state: TuiState, autosaveStatus: AutosaveStatus): TuiState {
  if (!state.editor) {
    return state
  }

  return {
    ...state,
    editor: {
      ...state.editor,
      autosaveStatus,
    },
  }
}

export function markAutosavePending(state: TuiState): TuiState {
  return markAutosaveStatus(state, "pending")
}

export function markAutosaveSaving(state: TuiState): TuiState {
  return markAutosaveStatus(state, "saving")
}

export function markAutosaveSaved(state: TuiState): TuiState {
  return markEditorSaved(markAutosaveStatus(state, "saved"))
}

export function markAutosaveError(state: TuiState): TuiState {
  return markAutosaveStatus(state, "error")
}
