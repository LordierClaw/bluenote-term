import path from "node:path"

import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { createSidecarRepository } from "../storage/sidecar-repository"
import { selectNote } from "./select-note"
import { createNoteRepository } from "../storage/note-repository"

export interface ShowNoteOptions extends ResolveBlueNoteRootOptions {
  selector: string
}

export interface ShowNoteSummary {
  key: string
  title: string
  description: string
  relativePath: string
  body: string
}

export function showNote(options: ShowNoteOptions): ShowNoteSummary {
  const rootPath = resolveBlueNoteRoot(options)
  const repository = createNoteRepository(rootPath)
  const selected = selectNote({ repository, selector: options.selector })
  const sidecar = createSidecarRepository(rootPath).read(selected.frontmatter.id)

  return {
    key: sidecar.key,
    title: sidecar.title,
    description: sidecar.description,
    relativePath: sidecar.relativePath,
    body: repository.readRaw(path.join(rootPath, selected.sourcePath)),
  }
}
