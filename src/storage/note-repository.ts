import path from "node:path"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"

import { UsageError } from "../core/errors"
import { assertPathInsideRoot, toRootRelativePath } from "../platform/path-safety"
import { type PlainNote } from "./note-schema"
import type { NoteFrontmatter, ParsedNote } from "./note-schema"
import { parsePlainNote, serializePlainNote } from "./plain-note"
import { createSidecarRepository } from "./sidecar-repository"
import type { NoteSidecar } from "./sidecar-schema"
import { getArchiveNotePath, getInboxNotePath, getNotesPath } from "./root-layout"

export interface CreateStoredNoteInput {
  frontmatter: NoteFrontmatter
  body: string
}

export interface StoredNoteRecord {
  notePath: string
  relativePath: string
}

export interface NoteRepository {
  create(input: CreateStoredNoteInput): StoredNoteRecord
  read(notePath: string): ParsedNote
  readRaw(notePath: string): string
  archive(notePath: string, archivedAt: string): StoredNoteRecord
  list(): ParsedNote[]
  listNotePaths(): StoredNoteRecord[]
}

const NOTES_RELATIVE_PATH = "notes"
const NOTE_SCHEMA_VERSION = 1
const NOTE_MODE = "plain"
const NOTE_NAMING_VERSION = 1

function assertCreateFrontmatterIsSupported(frontmatter: NoteFrontmatter): void {
  if (
    frontmatter.schemaVersion !== NOTE_SCHEMA_VERSION ||
    frontmatter.mode !== NOTE_MODE ||
    frontmatter.tags.length > 0
  ) {
    throw new UsageError(
      `Could not create note '${frontmatter.id}': create only supports schemaVersion=${NOTE_SCHEMA_VERSION}, mode='${NOTE_MODE}', and an empty tags array.`,
      {
        hint: "Pass canonical plain-note frontmatter or extend note persistence to round-trip additional metadata.",
      },
    )
  }
}

function wrapRepositoryError(action: "create" | "read" | "list" | "archive", relativePath: string, error: unknown): never {
  const message =
    action === "create"
      ? `Could not create note '${relativePath}'.`
      : action === "read"
        ? `Could not read note '${relativePath}'.`
        : action === "archive"
          ? `Could not archive note '${relativePath}'.`
          : `Could not list notes in '${relativePath}'.`
  const hint =
    action === "create"
      ? "Ensure BLUENOTE_ROOT points to a writable directory path."
      : action === "read"
        ? "Ensure the note exists inside BLUENOTE_ROOT and is readable."
        : action === "archive"
          ? "Ensure the note exists inside BLUENOTE_ROOT and the archive path is writable."
          : "Ensure BLUENOTE_ROOT points to a readable managed root."

  throw new UsageError(message, {
    hint,
    cause: error,
  })
}

function collectMarkdownFiles(rootPath: string, currentPath: string, files: string[]): void {
  for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
    const entryPath = path.join(currentPath, entry.name)

    if (entry.isDirectory()) {
      collectMarkdownFiles(rootPath, entryPath, files)
      continue
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(assertPathInsideRoot(rootPath, entryPath))
    }
  }
}

function deriveDescription(body: string, fallbackTitle: string): string {
  const firstNonEmptyLine = body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return firstNonEmptyLine ?? fallbackTitle
}

function keyFromNotePath(notePath: string): string {
  return path.basename(notePath, ".md")
}

function assertUniqueNoteKeys(rootPath: string, notePaths: readonly string[]): void {
  const firstRelativePathByKey = new Map<string, string>()

  for (const notePath of notePaths) {
    const key = keyFromNotePath(notePath)
    const relativePath = toRootRelativePath(rootPath, notePath)
    const firstRelativePath = firstRelativePathByKey.get(key)

    if (firstRelativePath !== undefined) {
      throw new UsageError(
        `Found duplicate note key '${key}' for '${firstRelativePath}' and '${relativePath}'. Note basenames must be globally unique across the notes tree.`,
        {
          hint: "Rename or remove one of the duplicate note files so each note basename/key is unique under notes/.",
        },
      )
    }

    firstRelativePathByKey.set(key, relativePath)
  }
}

function buildSidecar(frontmatter: NoteFrontmatter, relativePath: string, body: string, archivedAt: string | null): NoteSidecar {
  return {
    key: frontmatter.id,
    title: frontmatter.title,
    description: deriveDescription(body, frontmatter.title),
    relativePath,
    createdAt: frontmatter.createdAt,
    updatedAt: frontmatter.updatedAt,
    archivedAt,
    namingVersion: NOTE_NAMING_VERSION,
  }
}

function buildParsedNote(sidecar: NoteSidecar, plainNote: PlainNote): ParsedNote {
  return {
    body: plainNote.body,
    sourcePath: plainNote.sourcePath,
    frontmatter: {
      id: sidecar.key,
      schemaVersion: NOTE_SCHEMA_VERSION,
      title: sidecar.title,
      mode: NOTE_MODE,
      tags: [],
      createdAt: sidecar.createdAt,
      updatedAt: sidecar.updatedAt,
      ...(sidecar.archivedAt === null ? {} : { archivedAt: sidecar.archivedAt }),
    },
  }
}

export function createNoteRepository(rootPath: string): NoteRepository {
  const normalizedRootPath = path.resolve(rootPath)
  const sidecars = createSidecarRepository(normalizedRootPath)

  return {
    create(input) {
      assertCreateFrontmatterIsSupported(input.frontmatter)

      const notePath = getInboxNotePath(normalizedRootPath, input.frontmatter.id)
      const relativePath = toRootRelativePath(normalizedRootPath, notePath)
      const sidecarPath = sidecars.getSidecarPath(input.frontmatter.id)

      if (existsSync(notePath) || existsSync(sidecarPath)) {
        throw new UsageError(`Could not create note '${relativePath}'.`, {
          hint: "A note with the same path/key already exists. Use a different id or remove/archive the existing note first.",
        })
      }

      const markdown = serializePlainNote({
        body: input.body,
        sourcePath: relativePath,
      })
      const sidecar = buildSidecar(input.frontmatter, relativePath, input.body, input.frontmatter.archivedAt ?? null)

      try {
        mkdirSync(path.dirname(notePath), { recursive: true })
        writeFileSync(notePath, markdown, "utf8")
        sidecars.write(sidecar)
      } catch (error) {
        if (existsSync(notePath)) {
          rmSync(notePath, { force: true })
        }

        wrapRepositoryError("create", relativePath, error)
      }

      return {
        notePath,
        relativePath,
      }
    },

    read(notePath) {
      const normalizedNotePath = assertPathInsideRoot(normalizedRootPath, notePath)
      const relativePath = toRootRelativePath(normalizedRootPath, normalizedNotePath)
      const key = keyFromNotePath(normalizedNotePath)
      let markdown: string

      try {
        markdown = readFileSync(normalizedNotePath, "utf8")
        const plainNote = parsePlainNote(markdown, relativePath)
        const sidecar = sidecars.read(key)

        if (path.normalize(sidecar.relativePath) !== path.normalize(relativePath)) {
          throw new UsageError(
            `Note metadata for '${sidecar.key}' points to '${sidecar.relativePath}' instead of '${relativePath}'.`,
            {
              hint: "Rebuild or repair the note sidecar so its relativePath matches the note file.",
            },
          )
        }

        return buildParsedNote(sidecar, plainNote)
      } catch (error) {
        if (error instanceof UsageError && error.message.startsWith("Note metadata for '")) {
          throw error
        }

        wrapRepositoryError("read", relativePath, error)
      }
    },

    readRaw(notePath) {
      const normalizedNotePath = assertPathInsideRoot(normalizedRootPath, notePath)
      const relativePath = toRootRelativePath(normalizedRootPath, normalizedNotePath)

      try {
        return readFileSync(normalizedNotePath, "utf8")
      } catch (error) {
        wrapRepositoryError("read", relativePath, error)
      }
    },

    archive(notePath, archivedAt) {
      const normalizedNotePath = assertPathInsideRoot(normalizedRootPath, notePath)
      const currentRelativePath = toRootRelativePath(normalizedRootPath, normalizedNotePath)
      const existing = this.read(normalizedNotePath)
      const existingSidecar = sidecars.read(existing.frontmatter.id)
      const archivedNotePath = getArchiveNotePath(normalizedRootPath, existing.frontmatter.id)
      const archivedRelativePath = toRootRelativePath(normalizedRootPath, archivedNotePath)
      const markdown = serializePlainNote({
        body: existing.body,
        sourcePath: archivedRelativePath,
      })
      const archivedSidecar: NoteSidecar = {
        ...existingSidecar,
        relativePath: archivedRelativePath,
        archivedAt,
      }
      let wroteArchivedCopy = false
      let removedSourceNote = false

      try {
        mkdirSync(path.dirname(archivedNotePath), { recursive: true })

        if (archivedNotePath !== normalizedNotePath && existsSync(archivedNotePath)) {
          throw new Error(`Archive destination already exists: ${archivedRelativePath}.`)
        }

        writeFileSync(archivedNotePath, markdown, "utf8")
        wroteArchivedCopy = true

        if (archivedNotePath !== normalizedNotePath) {
          rmSync(normalizedNotePath)
          removedSourceNote = true
        }

        sidecars.write(archivedSidecar)
      } catch (error) {
        const rollbackErrors: unknown[] = []

        if (removedSourceNote && archivedNotePath !== normalizedNotePath) {
          try {
            writeFileSync(
              normalizedNotePath,
              serializePlainNote({
                body: existing.body,
                sourcePath: currentRelativePath,
              }),
              "utf8",
            )
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError)
          }
        }

        if (wroteArchivedCopy && archivedNotePath !== normalizedNotePath && existsSync(archivedNotePath)) {
          try {
            rmSync(archivedNotePath, { force: true })
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError)
          }
        }

        if (rollbackErrors.length > 0) {
          wrapRepositoryError(
            "archive",
            currentRelativePath,
            new AggregateError([error, ...rollbackErrors], "Archive failed and rollback also failed."),
          )
        }

        wrapRepositoryError("archive", currentRelativePath, error)
      }

      return {
        notePath: archivedNotePath,
        relativePath: archivedRelativePath,
      }
    },

    list() {
      return this.listNotePaths().map((record) => this.read(record.notePath))
    },

    listNotePaths() {
      const notesPath = getNotesPath(normalizedRootPath)
      const notePaths: string[] = []

      try {
        collectMarkdownFiles(normalizedRootPath, notesPath, notePaths)
      } catch (error) {
        wrapRepositoryError("list", NOTES_RELATIVE_PATH, error)
      }

      notePaths.sort((left, right) => left.localeCompare(right))
      assertUniqueNoteKeys(normalizedRootPath, notePaths)

      return notePaths.map((notePath) => ({
        notePath,
        relativePath: toRootRelativePath(normalizedRootPath, notePath),
      }))
    },
  }
}
