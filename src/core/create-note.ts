import path from "node:path"

import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { IndexValidationFailedError } from "./errors"
import { createNoteDescription } from "../domain/note-description"
import { createNoteKey } from "../domain/note-key"
import { rebuildIndexes } from "./rebuild-indexes"
import { systemClock, type Clock } from "../platform/clock"
import type { IdGenerator } from "../platform/ids"
import { createNoteRepository } from "../storage/note-repository"
import { ensureManagedRoot } from "../storage/root-layout"

export interface CreateNoteOptions extends ResolveBlueNoteRootOptions {
  title: string
  body?: string
  clock?: Clock
  ids?: IdGenerator
}

export interface CreateNoteSummary {
  key: string
  title: string
  description: string
  rootPath: string
  notePath: string
  relativePath: string
}

function readTestTimestamp(): Date | null {
  const value = process.env.BLUENOTE_TEST_NOW

  if (!value) {
    return null
  }

  return new Date(value)
}

function createRandomSourceFromEnvironment(): (() => number) | undefined {
  const sequence = process.env.BLUENOTE_TEST_RANDOM_SEQUENCE

  if (!sequence) {
    return undefined
  }

  const draws = sequence
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => Number(value))

  return () => draws.shift() ?? 0
}

export function createNote(options: CreateNoteOptions): CreateNoteSummary {
  const rootPath = ensureManagedRoot(resolveBlueNoteRoot(options))
  const clock =
    options.clock ??
    (() => {
      const testTimestamp = readTestTimestamp()

      return testTimestamp === null
        ? systemClock
        : {
            now() {
              return new Date(testTimestamp)
            },
          }
    })()
  const timestamp = clock.now().toISOString()
  const repository = createNoteRepository(rootPath)
  const randomSource = createRandomSourceFromEnvironment()
  const existingKeys = new Set(repository.listNotePaths().map((record) => path.basename(record.relativePath, ".md")))
  const key = createNoteKey(options.title, {
    isUnique: (candidate) => !existingKeys.has(candidate),
    randomSource,
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
