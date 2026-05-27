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
}

export interface ManagerState {
  items: ManagerItem[]
  focusedIndex: number
  selectedNoteKey: string | null
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
  wrapMode?: "word"
  findQuery?: string
  findMatchCount?: number
  activeFindIndex?: number | null
  autosaveStatus?: AutosaveStatus
}

export interface SearchEverythingState {
  query: string
  selectedIndex: number
  previousScreen: Exclude<TuiScreen, "search">
  previousMode?: Exclude<TuiMode, "search.input">
}

export interface TuiState {
  screen: TuiScreen
  mode?: TuiMode
  manager: ManagerState
  editor: EditorBufferState | null
  search: SearchEverythingState | null
}

export interface CreateInitialTuiStateOptions {
  manager?: Partial<ManagerState>
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
}

function cloneManagerItems(items: ManagerItem[]): ManagerItem[] {
  return items.map((item) => ({ ...item }))
}

function cloneNote(note: TuiNote): TuiNote {
  return { ...note }
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
    hoveredPath: manager.hoveredPath ?? null,
    filterQuery: manager.filterQuery ?? "",
    status: manager.status ?? null,
    createDraft: manager.createDraft ? { ...manager.createDraft } : null,
    deleteDraft: manager.deleteDraft ? { ...manager.deleteDraft } : null,
  }
}

const defaultManagerState = (): ManagerState => ({
  items: [],
  focusedIndex: 0,
  selectedNoteKey: null,
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
    search: {
      query: options.query ?? "",
      selectedIndex: options.selectedIndex ?? 0,
      previousScreen,
      previousMode,
    },
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
      findMatchCount: 0,
      activeFindIndex: null,
      autosaveStatus: "idle",
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

  return {
    ...state,
    editor: {
      ...state.editor,
      note: {
        ...state.editor.note,
        body: state.editor.body,
      },
      savedBody: state.editor.body,
      dirty: false,
      autosaveStatus: "saved",
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
