import type { TuiNoteDetail } from "../data/note-detail-adapter"
import type { ShellFocusRegion } from "../shell/shell-state"

export interface NotePaneViewModel {
  selectedNote: TuiNoteDetail | null
  focusRegion: ShellFocusRegion
  emptyMessage: string
}

export function renderNotePane(view: NotePaneViewModel): string {
  const header = `Note${view.focusRegion === "main" ? " [focus]" : ""}`

  if (view.selectedNote === null) {
    return [header, "", view.emptyMessage].join("\n")
  }

  return [
    header,
    "",
    view.selectedNote.title,
    view.selectedNote.relativePath,
    view.selectedNote.description,
    "",
    view.selectedNote.body,
  ].join("\n")
}
