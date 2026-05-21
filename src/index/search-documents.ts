import type { ParsedNote } from "../storage/note-schema"

export interface SearchDocument {
  id: string
  title: string
  body: string
  relativePath: string
  tags: string
}

export function createSearchDocuments(notes: ParsedNote[]): SearchDocument[] {
  return notes.map((note) => ({
    id: note.frontmatter.id,
    title: note.frontmatter.title,
    body: note.body,
    relativePath: note.sourcePath,
    tags: note.frontmatter.tags.join(" "),
  }))
}
