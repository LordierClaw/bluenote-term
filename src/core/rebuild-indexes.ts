import path from "node:path"

import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { InvalidFrontmatterError } from "./errors"
import { rebuildIndexStore } from "../index/index-store"
import { createNoteRepository } from "../storage/note-repository"
import { ensureManagedRoot } from "../storage/root-layout"
import type { ParsedNote } from "../storage/note-schema"

export interface RebuildIndexesSummary {
  rootPath: string
  noteCount: number
  validationErrors: string[]
  metadataDatabasePath?: string
  searchIndexPath?: string
}

function isArchivedNote(note: ParsedNote): boolean {
  return note.frontmatter.archivedAt !== undefined || note.sourcePath.startsWith(`notes${path.sep}archive${path.sep}`)
}

export function rebuildIndexes(options: ResolveBlueNoteRootOptions = {}): RebuildIndexesSummary {
  const rootPath = ensureManagedRoot(resolveBlueNoteRoot(options))
  const repository = createNoteRepository(rootPath)
  const notes: ParsedNote[] = []
  const validationErrors: string[] = []
  const noteRecords = repository.listNotePaths()

  for (const record of noteRecords) {
    try {
      notes.push(repository.read(record.notePath))
    } catch (error) {
      if (error instanceof InvalidFrontmatterError) {
        validationErrors.push(error.message)
        continue
      }

      throw error
    }
  }

  const seenIds = new Map<string, string[]>()

  for (const note of notes) {
    const matches = seenIds.get(note.frontmatter.id)

    if (matches) {
      matches.push(note.sourcePath)
    } else {
      seenIds.set(note.frontmatter.id, [note.sourcePath])
    }
  }

  for (const [id, sourcePaths] of seenIds) {
    if (sourcePaths.length > 1) {
      validationErrors.push(`Duplicate note id '${id}' found in: ${sourcePaths.join(", ")}.`)
    }
  }

  if (validationErrors.length > 0) {
    return {
      rootPath,
      noteCount: notes.length,
      validationErrors,
    }
  }

  const activeNotes = notes.filter((note) => !isArchivedNote(note))
  const rebuilt = rebuildIndexStore({ rootPath, notes: activeNotes })

  return {
    rootPath,
    noteCount: rebuilt.noteCount,
    validationErrors,
    metadataDatabasePath: rebuilt.metadataDatabasePath,
    searchIndexPath: rebuilt.searchIndexPath,
  }
}
