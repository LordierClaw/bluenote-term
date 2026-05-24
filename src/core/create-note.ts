import path from "node:path"
import { existsSync, readdirSync } from "node:fs"

import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { IndexValidationFailedError } from "./errors"
import { createNoteDescription } from "../domain/note-description"
import { createNoteKey } from "../domain/note-key"
import { rebuildIndexes } from "./rebuild-indexes"
import { systemClock, type Clock } from "../platform/clock"
import { createNoteRepository } from "../storage/note-repository"
import { ensureManagedRoot, getStateNotesPath } from "../storage/root-layout"

export interface CreateNoteOptions extends ResolveBlueNoteRootOptions {
  title: string
  body?: string
  clock?: Clock
  randomSource?: () => number
}

export interface CreateNoteSummary {
  key: string
  title: string
  description: string
  rootPath: string
  notePath: string
  relativePath: string
}

function listExistingCreateKeys(rootPath: string, repository: ReturnType<typeof createNoteRepository>): Set<string> {
  const existingKeys = new Set(repository.listNotePaths().map((record) => path.basename(record.relativePath, ".md")))
  const stateNotesPath = getStateNotesPath(rootPath)

  if (!existsSync(stateNotesPath)) {
    return existingKeys
  }

  for (const entry of readdirSync(stateNotesPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue
    }

    existingKeys.add(path.basename(entry.name, ".json"))
  }

  return existingKeys
}

export function createNote(options: CreateNoteOptions): CreateNoteSummary {
  const rootPath = ensureManagedRoot(resolveBlueNoteRoot(options))
  const clock = options.clock ?? systemClock
  const timestamp = clock.now().toISOString()
  const repository = createNoteRepository(rootPath)
  const existingKeys = listExistingCreateKeys(rootPath, repository)
  const key = createNoteKey(options.title, {
    isUnique: (candidate) => !existingKeys.has(candidate),
    randomSource: options.randomSource,
  })
  const description = createNoteDescription(options.body ?? "")
  const created = repository.create({
    frontmatter: {
      id: key,
      schemaVersion: 1,
      title: options.title,
      mode: "plain",
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    body: options.body ?? "",
  })

  const rebuildSummary = rebuildIndexes({ override: rootPath })

  if (rebuildSummary.validationErrors.length > 0) {
    throw new IndexValidationFailedError(
      [`Created note '${key}', but derived indexes could not be rebuilt.`, ...rebuildSummary.validationErrors].join("\n"),
      {
        hint: "Run bn rebuild after fixing the reported validation errors.",
      },
    )
  }

  return {
    key,
    title: options.title,
    description,
    rootPath,
    notePath: created.notePath,
    relativePath: created.relativePath,
  }
}
