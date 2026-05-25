import type { TuiNoteListItem } from "../data/note-list-adapter"
import type { ShellFocusRegion } from "../shell/shell-state"

export interface SidebarViewModel {
  notes: TuiNoteListItem[]
  selectedNoteSelector: string | null
  focusRegion: ShellFocusRegion
}

export function renderSidebar(view: SidebarViewModel): string {
  const header = `Notes${view.focusRegion === "sidebar" ? " [focus]" : ""}`

  if (view.notes.length === 0) {
    return [header, "", "No notes yet."].join("\n")
  }

  return [
    header,
    "",
    ...view.notes.map((note) => `${note.selector === view.selectedNoteSelector ? ">" : " "} ${note.title}`),
  ].join("\n")
}
