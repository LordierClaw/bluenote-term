import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { loadIndexStore } from "../index/index-store"

export interface NoteSummary {
  id: string
  title: string
  relativePath: string
}

export function listNotes(options: ResolveBlueNoteRootOptions = {}): NoteSummary[] {
  const store = loadIndexStore(resolveBlueNoteRoot(options))

  return store.listSummaries().map((summary) => ({
    id: summary.id,
    title: summary.title,
    relativePath: summary.relativePath,
  }))
}
