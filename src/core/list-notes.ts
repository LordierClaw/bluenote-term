import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { loadIndexStore } from "../index/index-store"

export interface NoteSummary {
  key: string
  title: string
  description: string
  relativePath: string
}

export function listNotes(options: ResolveBlueNoteRootOptions = {}): NoteSummary[] {
  const store = loadIndexStore(resolveBlueNoteRoot(options))

  return store.listSummaries().map((summary) => ({
    key: summary.key,
    title: summary.title,
    description: summary.description,
    relativePath: summary.relativePath,
  }))
}
