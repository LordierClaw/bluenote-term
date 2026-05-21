import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { loadIndexStore } from "../index/index-store"

export interface SearchNoteMatch {
  id: string
  title: string
  relativePath: string
  titleSnippet: string
  pathSnippet: string
}

function createSnippet(value: string): string {
  return value
}

export function searchNotes(query: string, options: ResolveBlueNoteRootOptions = {}): SearchNoteMatch[] {
  const rootPath = resolveBlueNoteRoot(options)
  const store = loadIndexStore(rootPath)

  return store.search(query).map((match) => ({
    id: match.id,
    title: match.title,
    relativePath: match.relativePath,
    titleSnippet: createSnippet(match.title),
    pathSnippet: createSnippet(match.relativePath),
  }))
}
