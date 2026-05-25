import type { ResolveBlueNoteRootOptions } from "../../config/root"
import { loadNoteDetail } from "../data/note-detail-adapter"
import { loadNoteList } from "../data/note-list-adapter"
import type { TuiNoteBrowserState } from "../types"

export function loadInitialNoteBrowserState(options: ResolveBlueNoteRootOptions = {}): TuiNoteBrowserState {
  const noteList = loadNoteList(options)

  if (!noteList.ok) {
    return {
      status: "empty",
      notes: [],
      selectedNote: null,
      emptyState: noteList.error,
    }
  }

  const firstNote = noteList.notes[0]

  if (!firstNote) {
    return {
      status: "ready",
      notes: noteList.notes,
      selectedNote: null,
    }
  }

  const noteDetail = loadNoteDetail({
    ...options,
    selector: firstNote.selector,
  })

  if (noteDetail.ok) {
    return {
      status: "ready",
      notes: noteList.notes,
      selectedNote: noteDetail.note,
    }
  }

  return {
    status: "empty",
    notes: noteList.notes,
    selectedNote: null,
    emptyState: noteDetail.error,
  }
}
