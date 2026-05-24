import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { loadIndexStore, type SearchIndexMatch } from "../index/index-store"

export type SearchMatchSource = "title" | "description" | "content" | "key-path"

export interface SearchNoteExplanation {
  source: SearchMatchSource
  label: string
  excerpt?: string
}

export interface SearchNoteMatch {
  key: string
  title: string
  relativePath: string
  match: SearchNoteExplanation
}

function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase()
}

function includesAnyToken(value: string, tokens: string[]): boolean {
  const normalized = normalizeForMatch(value)
  return tokens.some((token) => normalized.includes(token))
}

function createContentExplanation(body: string, tokens: string[]): SearchNoteExplanation {
  const lines = body.split(/\r?\n/)

  for (const [index, line] of lines.entries()) {
    if (!includesAnyToken(line, tokens)) {
      continue
    }

    const trimmed = line.trim()
    const excerpt = trimmed === "" ? "..." : `...${trimmed}...`
    return {
      source: "content",
      label: `content line ${index + 1}`,
      excerpt,
    }
  }

  return {
    source: "content",
    label: "content",
  }
}

function getMatchedFields(match: SearchIndexMatch): Set<string> {
  const fields = new Set<string>()

  for (const matchedFields of Object.values(match.termMatches ?? {})) {
    for (const field of matchedFields) {
      fields.add(field)
    }
  }

  return fields
}

function getBodyMatchTokens(match: SearchIndexMatch): string[] {
  return Object.entries(match.termMatches ?? {})
    .filter(([, fields]) => fields.includes("body"))
    .map(([term]) => term)
}

function explainMatch(match: SearchIndexMatch): SearchNoteExplanation {
  const matchedFields = getMatchedFields(match)

  if (matchedFields.has("title")) {
    return {
      source: "title",
      label: "title",
    }
  }

  if (matchedFields.has("description")) {
    return {
      source: "description",
      label: "description",
    }
  }

  if (matchedFields.has("body")) {
    const tokens = getBodyMatchTokens(match)
    return createContentExplanation(match.body, tokens)
  }

  return {
    source: "key-path",
    label: "key/path",
  }
}

function getMatchPriority(explanation: SearchNoteExplanation): number {
  switch (explanation.source) {
    case "title":
      return 0
    case "description":
      return 1
    case "content":
      return 2
    case "key-path":
      return 3
  }
}

export function searchNotes(query: string, options: ResolveBlueNoteRootOptions = {}): SearchNoteMatch[] {
  const rootPath = resolveBlueNoteRoot(options)
  const store = loadIndexStore(rootPath)

  return store.search(query)
    .map((match) => ({
      key: match.key,
      title: match.title,
      relativePath: match.relativePath,
      match: explainMatch(match),
      score: match.score ?? 0,
    }))
    .sort((left, right) => {
      const priorityDifference = getMatchPriority(left.match) - getMatchPriority(right.match)

      if (priorityDifference !== 0) {
        return priorityDifference
      }

      if (right.score !== left.score) {
        return right.score - left.score
      }

      return left.relativePath.localeCompare(right.relativePath)
    })
    .map(({ key, title, relativePath, match }) => ({
      key,
      title,
      relativePath,
      match,
    }))
}
