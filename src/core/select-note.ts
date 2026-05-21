import path from "node:path"

import { AmbiguousSelectorError, UsageError } from "./errors"
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

function assertSingleMatch(selector: string, matches: ParsedNote[]): ParsedNote {
  if (matches.length === 1) {
    return matches[0]
  }

  throw new AmbiguousSelectorError(
    `Ambiguous note selector: ${selector}. Matches: ${matches.map((note) => note.sourcePath).join(", ")}.`,
    {
      hint: "Use a note ID or managed-root-relative path to disambiguate.",
    },
  )
}

export function selectNote(options: SelectNoteOptions): ParsedNote {
  const notes = options.repository.list()
  const normalizedSlugSelector = normalizeSlugSelector(options.selector)

  const exactIdMatches = notes.filter((note) => note.frontmatter.id === options.selector)
  if (exactIdMatches.length > 0) {
    return assertSingleMatch(options.selector, exactIdMatches)
  }

  const normalizedSelectorPath = normalizeSelectorPath(options.selector)
  const exactPathMatches = notes.filter((note) => path.normalize(note.sourcePath) === normalizedSelectorPath)
  if (exactPathMatches.length > 0) {
    return assertSingleMatch(options.selector, exactPathMatches)
  }

  const slugMatches = notes.filter((note) => slugifyTitle(note.frontmatter.title) === normalizedSlugSelector)
  if (slugMatches.length > 0) {
    return assertSingleMatch(options.selector, slugMatches)
  }

  throw new UsageError(`Could not find a note matching selector '${options.selector}'.`, {
    hint: "Use bn list to inspect available notes.",
  })
}
