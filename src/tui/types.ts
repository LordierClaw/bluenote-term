import type { TuiNoteDetail } from "./data/note-detail-adapter"
import type { TuiAdapterError, TuiNoteListItem } from "./data/note-list-adapter"

export type TuiBootstrapStatus = "missing-root" | "ready"

export interface TuiBootstrapInfo {
  appName: "BlueNote"
  status: TuiBootstrapStatus
  rootPath: string
  nextPhase: "phase-3-tui-shell"
}

export type TuiNoteBrowserState =
  | {
      status: "empty"
      notes: TuiNoteListItem[]
      selectedNote: null
      emptyState: TuiAdapterError
    }
  | {
      status: "ready"
      notes: TuiNoteListItem[]
      selectedNote: TuiNoteDetail | null
    }

export interface TuiAppState {
  bootstrap: TuiBootstrapInfo
  noteBrowser: TuiNoteBrowserState
}
