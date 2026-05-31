import path from "node:path"

import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { createNoteRepository } from "../storage/note-repository"
import { parsePlainNote } from "../storage/plain-note"
import { launchEditor, type LaunchEditorOptions } from "../platform/editor"
import { systemClock, type Clock } from "../platform/clock"
import { rebuildIndexes } from "./rebuild-indexes"
import { renameNote } from "./rename-note"
import { selectNote } from "./select-note"

export interface EditNoteOptions extends ResolveBlueNoteRootOptions, LaunchEditorOptions {
  selector: string
  clock?: Clock
  randomSource?: () => number
}

export interface EditNoteSummary {
  rootPath: string
  notePath: string
  relativePath: string
  previousKey?: string
  key?: string
}

function extractEditedTitle(body: string, fallbackTitle: string): string {
  const firstMeaningfulLine = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (firstMeaningfulLine && /^#\s+.+$/u.test(firstMeaningfulLine)) {
    return firstMeaningfulLine.replace(/^#\s+/u, "").trim()
  }

  return fallbackTitle
}

export function editNote(options: EditNoteOptions): EditNoteSummary {
  const rootPath = resolveBlueNoteRoot(options)
  const repository = createNoteRepository(rootPath)
  const selected = selectNote({ repository, selector: options.selector })
  const notePath = path.join(rootPath, selected.sourcePath)
  const clock = options.clock ?? systemClock

  launchEditor(notePath, options)

  const editedRaw = repository.readRaw(notePath)
  const edited = parsePlainNote(editedRaw, selected.sourcePath)
  const title = extractEditedTitle(edited.body, selected.frontmatter.title)
  const updatedAt = clock.now().toISOString()

  if (title !== selected.frontmatter.title) {
    const renamed = renameNote({
      override: rootPath,
      selector: options.selector,
      title,
      body: edited.body,
      updatedAt,
      randomSource: options.randomSource,
    })

    rebuildIndexes({ override: rootPath })

    return {
      rootPath,
      notePath: renamed.notePath,
      relativePath: renamed.relativePath,
      previousKey: renamed.previousKey,
      key: renamed.key,
    }
  }

  const synced = repository.syncEditedNote(notePath, {
    title,
    body: edited.body,
    updatedAt,
  })

  rebuildIndexes({ override: rootPath })

  return {
    rootPath,
    notePath: synced.notePath,
    relativePath: synced.relativePath,
    previousKey: selected.frontmatter.id,
    key: selected.frontmatter.id,
  }
}
