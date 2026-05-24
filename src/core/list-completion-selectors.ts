import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { loadIndexStore } from "../index/index-store"

export interface CompletionSelectorRecord {
  key: string
}

export interface ListCompletionSelectorsOptions extends ResolveBlueNoteRootOptions {
  command?: string
  partial?: string
}

export function listCompletionSelectorCandidates(
  candidates: readonly CompletionSelectorRecord[],
  partial: string,
): string[] {
  const normalizedPartial = partial.trim()

  return [...new Set(candidates.map((candidate) => candidate.key))]
    .filter((key) => normalizedPartial === "" || key.startsWith(normalizedPartial))
    .sort((left, right) => left.localeCompare(right))
}

export function listCompletionSelectors(options: ListCompletionSelectorsOptions = {}): string[] {
  const store = loadIndexStore(resolveBlueNoteRoot(options))
  const includeArchived = options.command === "delete" || options.command === "show"
  const summaries = includeArchived ? store.listAllSummaries() : store.listSummaries()
  const candidates = summaries.map((note) => ({ key: note.key }))

  return listCompletionSelectorCandidates(candidates, options.partial ?? "")
}
