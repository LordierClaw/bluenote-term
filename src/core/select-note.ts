import path from "node:path"

import { AmbiguousSelectorError, SelectorNotFoundError } from "./errors"
import type { ParsedNote } from "../storage/note-schema"
import type { NoteRepository } from "../storage/note-repository"

export interface SelectNoteOptions {
  repository: NoteRepository
  selector: string
}

function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeSelectorPath(selector: string): string {
  return path.normalize(selector)
}

function normalizeSlugSelector(selector: string): string {
  return selector.trim().toLowerCase()
}

function selectorKeyFor(note: ParsedNote): string {
  return path.basename(note.sourcePath, ".md")
}

function levenshteinDistance(left: string, right: string): number {
  const previous = new Array(right.length + 1).fill(0)
  const current = new Array(right.length + 1).fill(0)

  for (let column = 0; column <= right.length; column += 1) {
    previous[column] = column
  }

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row

    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost,
      )
    }

    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column]
    }
  }

  return previous[right.length]
}

function findSuggestedKeys(selector: string, notes: readonly ParsedNote[]): string[] {
  const normalizedSelector = selector.trim().toLowerCase()

  return notes
    .map((note) => selectorKeyFor(note))
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .map((key) => ({
      key,
      distance: levenshteinDistance(normalizedSelector, key.toLowerCase()),
    }))
    .filter(({ distance }) => distance <= 3)
    .sort((left, right) => left.distance - right.distance || left.key.localeCompare(right.key))
    .slice(0, 3)
    .map(({ key }) => key)
}

function assertSingleMatch(selector: string, matches: ParsedNote[]): ParsedNote {
  if (matches.length === 1) {
    return matches[0]
  }

  throw new AmbiguousSelectorError(
    `Ambiguous note selector: ${selector}. Matches: ${matches.map((note) => note.sourcePath).join(", ")}.`,
    {
      hint: "Use a note key or managed-root-relative path to disambiguate.",
    },
  )
}

export function selectNote(options: SelectNoteOptions): ParsedNote {
  const notes = options.repository.list()
  const trimmedSelector = options.selector.trim()
  const normalizedSlugSelector = normalizeSlugSelector(trimmedSelector)

  const exactKeyMatches = notes.filter((note) => selectorKeyFor(note) === trimmedSelector)
  const exactLegacyIdMatches = notes.filter(
    (note) => note.frontmatter.id === trimmedSelector && selectorKeyFor(note) !== trimmedSelector,
  )

  if (exactKeyMatches.length > 0 && exactLegacyIdMatches.length > 0) {
    return assertSingleMatch(trimmedSelector, [...exactKeyMatches, ...exactLegacyIdMatches])
  }

  if (exactKeyMatches.length > 0) {
    return assertSingleMatch(trimmedSelector, exactKeyMatches)
  }

  if (exactLegacyIdMatches.length > 0) {
    return assertSingleMatch(trimmedSelector, exactLegacyIdMatches)
  }

  const normalizedSelectorPath = normalizeSelectorPath(trimmedSelector)
  const exactPathMatches = notes.filter((note) => path.normalize(note.sourcePath) === normalizedSelectorPath)
  if (exactPathMatches.length > 0) {
    return assertSingleMatch(trimmedSelector, exactPathMatches)
  }

  const slugMatches = notes.filter((note) => slugifyTitle(note.frontmatter.title) === normalizedSlugSelector)
  if (slugMatches.length > 0) {
    return assertSingleMatch(trimmedSelector, slugMatches)
  }

  const suggestions = findSuggestedKeys(trimmedSelector, notes)

  throw new SelectorNotFoundError(`Could not find a note matching selector '${options.selector}'.`, {
    hint: suggestions.length > 0 ? `Did you mean: ${suggestions.join(", ")}?` : "Use bn list to inspect available notes.",
  })
}
