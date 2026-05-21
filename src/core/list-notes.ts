import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { createNoteRepository } from "../storage/note-repository"

export interface NoteSummary {
  id: string
  title: string
  relativePath: string
}

export function listNotes(options: ResolveBlueNoteRootOptions = {}): NoteSummary[] {
  const repository = createNoteRepository(resolveBlueNoteRoot(options))

  return repository.list().map((note) => ({
    id: note.frontmatter.id,
    title: note.frontmatter.title,
    relativePath: note.sourcePath,
  }))
}
