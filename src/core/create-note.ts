import { resolveBlueNoteRoot, type ResolveBlueNoteRootOptions } from "../config/root"
import { systemClock, type Clock } from "../platform/clock"
import { uuidGenerator, type IdGenerator } from "../platform/ids"
import { createNoteRepository } from "../storage/note-repository"

export interface CreateNoteOptions extends ResolveBlueNoteRootOptions {
  title: string
  body?: string
  clock?: Clock
  ids?: IdGenerator
}

export interface CreateNoteSummary {
  id: string
  rootPath: string
  notePath: string
  relativePath: string
}

export function createNote(options: CreateNoteOptions): CreateNoteSummary {
  const rootPath = resolveBlueNoteRoot(options)
  const clock = options.clock ?? systemClock
  const ids = options.ids ?? uuidGenerator
  const timestamp = clock.now().toISOString()
  const id = ids.generate()
  const repository = createNoteRepository(rootPath)
  const created = repository.create({
    frontmatter: {
      id,
      schemaVersion: 1,
      title: options.title,
      mode: "plain",
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    body: options.body ?? "",
  })

  return {
    id,
    rootPath,
    notePath: created.notePath,
    relativePath: created.relativePath,
  }
}
