import path from "node:path"

import {
  createNoteDescription,
  createNoteRepository,
  enqueueDescribeNoteIfAiEnabled,
  getNoteSyncEntityId,
  parsePlainNote,
  rebuildIndexes,
  recordSyncMutationBestEffort,
  renameNote,
  resolveBlueNoteRoot,
  selectNote,
  systemClock,
  type Clock,
  type NoteVisibilityOptions,
  type ResolveBlueNoteRootOptions,
} from "@lordierclaw/bluenote-core"
import { launchEditor, type LaunchEditorOptions } from "../platform/editor"

export interface EditNoteOptions extends ResolveBlueNoteRootOptions, LaunchEditorOptions, NoteVisibilityOptions {
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

function enqueueAiDescriptionAfterEdit(
  rootPath: string,
  input: { key: string; title: string; body: string; description: string; relativePath: string; clock: Clock; replaceKey?: string | null },
): void {
  enqueueDescribeNoteIfAiEnabled(rootPath, {
    key: input.key,
    relativePath: input.relativePath,
    title: input.title,
    body: input.body,
    currentDescription: input.description,
    replaceKey: input.replaceKey,
  }, { clock: input.clock, warn: (message) => console.warn(message) })
}

export function editNote(options: EditNoteOptions): EditNoteSummary {
  const rootPath = resolveBlueNoteRoot(options)
  const repository = createNoteRepository(rootPath)
  const selected = selectNote({ repository, selector: options.selector, visibility: options.visibility })
  const notePath = path.join(rootPath, selected.sourcePath)
  const clock = options.clock ?? systemClock

  launchEditor(notePath, options)

  const editedRaw = repository.readRaw(notePath)
  const edited = parsePlainNote(editedRaw, selected.sourcePath)
  const title = extractEditedTitle(edited.body, selected.frontmatter.title)
  const updatedAt = clock.now().toISOString()
  const titleChanged = title !== selected.frontmatter.title
  const bodyChanged = edited.body !== selected.body

  if (titleChanged) {
    const renamed = renameNote({
      override: rootPath,
      selector: options.selector,
      title,
      body: edited.body,
      updatedAt,
      visibility: options.visibility,
      randomSource: options.randomSource,
    })

    rebuildIndexes({ override: rootPath })

    enqueueAiDescriptionAfterEdit(rootPath, {
      key: renamed.key,
      title,
      body: edited.body,
      description: createNoteDescription(edited.body),
      relativePath: renamed.relativePath,
      clock,
      replaceKey: renamed.previousKey,
    })

    return {
      rootPath,
      notePath: renamed.notePath,
      relativePath: renamed.relativePath,
      previousKey: renamed.previousKey,
      key: renamed.key,
    }
  }

  const syncEntityId = getNoteSyncEntityId(rootPath, selected)
  const synced = repository.syncEditedNote(notePath, {
    title,
    body: edited.body,
    updatedAt,
  })
  recordSyncMutationBestEffort(rootPath, {
    notes: [{
      entityId: syncEntityId,
      markedAt: updatedAt,
      metadata: {
        key: selected.frontmatter.id,
        relativePath: synced.relativePath,
        title,
        description: createNoteDescription(edited.body),
      },
    }],
  })

  rebuildIndexes({ override: rootPath })

  if (bodyChanged) {
    enqueueAiDescriptionAfterEdit(rootPath, {
      key: selected.frontmatter.id,
      title,
      body: edited.body,
      description: createNoteDescription(edited.body),
      relativePath: synced.relativePath,
      clock,
    })
  }

  return {
    rootPath,
    notePath: synced.notePath,
    relativePath: synced.relativePath,
    previousKey: selected.frontmatter.id,
    key: selected.frontmatter.id,
  }
}
