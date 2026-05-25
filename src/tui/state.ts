export type TuiScreen = "manager" | "editor" | "search"

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
}

export interface EditorBufferState {
  note: TuiNote
  body: string
  savedBody: string
  dirty: boolean
}

export interface SearchEverythingState {
  query: string
  selectedIndex: number
  previousScreen: Exclude<TuiScreen, "search">
}

export interface TuiState {
  screen: TuiScreen
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

function cloneManagerItems(items: ManagerItem[]): ManagerItem[] {
  return items.map((item) => ({ ...item }))
}

function cloneNote(note: TuiNote): TuiNote {
  return { ...note }
}

const defaultManagerState = (): ManagerState => ({
  items: [],
  focusedIndex: 0,
  selectedNoteKey: null,
})

export function createInitialTuiState(options: CreateInitialTuiStateOptions = {}): TuiState {
  const manager = {
    ...defaultManagerState(),
    ...options.manager,
  }

  return {
    screen: "manager",
    manager: {
      ...manager,
      items: cloneManagerItems(manager.items),
    },
    editor: null,
    search: null,
  }
}

export function openSearchEverything(
  state: TuiState,
  options: OpenSearchEverythingOptions = {},
): TuiState {
  const previousScreen = state.screen === "search" ? state.search?.previousScreen ?? "manager" : state.screen

  return {
    ...state,
    screen: "search",
    search: {
      query: options.query ?? "",
      selectedIndex: options.selectedIndex ?? 0,
      previousScreen,
    },
  }
}

export function closeSearchEverything(state: TuiState): TuiState {
  return {
    ...state,
    screen: state.search?.previousScreen ?? "manager",
    search: null,
  }
}

export function openEditorForNote(state: TuiState, note: TuiNote): TuiState {
  const editorNote = cloneNote(note)

  return {
    ...state,
    screen: "editor",
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
    },
    search: null,
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
    },
  }
}
