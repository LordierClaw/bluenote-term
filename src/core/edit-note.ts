import path from "node:path"

import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { launchEditor, type LaunchEditorOptions } from "../platform/editor"
import { createNoteRepository } from "../storage/note-repository"
import { rebuildIndexes } from "./rebuild-indexes"
import { selectNote } from "./select-note"

export interface EditNoteOptions extends ResolveBlueNoteRootOptions, LaunchEditorOptions {
  selector: string
}

export interface EditNoteSummary {
  rootPath: string
  notePath: string
  relativePath: string
}

export function editNote(options: EditNoteOptions): EditNoteSummary {
  const rootPath = resolveBlueNoteRoot(options)
  const repository = createNoteRepository(rootPath)
  const selected = selectNote({ repository, selector: options.selector })
  const notePath = path.join(rootPath, selected.sourcePath)

  launchEditor(notePath, options)
  repository.read(notePath)
  rebuildIndexes({ override: rootPath })

  return {
    rootPath,
    notePath,
    relativePath: selected.sourcePath,
  }
}
