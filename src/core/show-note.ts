import path from "node:path"

import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { selectNote } from "./select-note"
import { createNoteRepository } from "../storage/note-repository"

export interface ShowNoteOptions extends ResolveBlueNoteRootOptions {
  selector: string
}

export function showNote(options: ShowNoteOptions): string {
  const rootPath = resolveBlueNoteRoot(options)
  const repository = createNoteRepository(rootPath)
  const selected = selectNote({ repository, selector: options.selector })

  return repository.readRaw(path.join(rootPath, selected.sourcePath))
}
