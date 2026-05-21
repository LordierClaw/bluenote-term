import path from "node:path"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"

import { UsageError } from "../core/errors"
import { assertPathInsideRoot, toRootRelativePath } from "../platform/path-safety"
import { parseNoteFile, serializeNoteFile } from "./frontmatter"
import type { NoteFrontmatter, ParsedNote } from "./note-schema"

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

const DEFAULT_INBOX_RELATIVE_PATH = path.join("notes", "inbox")
const DEFAULT_ARCHIVE_RELATIVE_PATH = path.join("notes", "archive")
const NOTES_RELATIVE_PATH = "notes"

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

export function createNoteRepository(rootPath: string): NoteRepository {
  const normalizedRootPath = path.resolve(rootPath)

  return {
    create(input) {
      const inboxPath = assertPathInsideRoot(normalizedRootPath, path.join(normalizedRootPath, DEFAULT_INBOX_RELATIVE_PATH))
      const notePath = assertPathInsideRoot(inboxPath, path.join(inboxPath, `${input.frontmatter.id}.md`))
      const relativePath = toRootRelativePath(normalizedRootPath, notePath)
      const markdown = serializeNoteFile({
        frontmatter: input.frontmatter,
        body: input.body,
        sourcePath: relativePath,
      })

      try {
        mkdirSync(inboxPath, { recursive: true })
        writeFileSync(notePath, markdown, "utf8")
      } catch (error) {
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
      let markdown: string

      try {
        markdown = readFileSync(normalizedNotePath, "utf8")
      } catch (error) {
        wrapRepositoryError("read", relativePath, error)
      }

      return parseNoteFile(markdown, relativePath)
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
      const archiveDirectoryPath = assertPathInsideRoot(
        normalizedRootPath,
        path.join(normalizedRootPath, DEFAULT_ARCHIVE_RELATIVE_PATH),
      )
      const archivedNotePath = assertPathInsideRoot(archiveDirectoryPath, path.join(archiveDirectoryPath, path.basename(normalizedNotePath)))
      const archivedRelativePath = toRootRelativePath(normalizedRootPath, archivedNotePath)
      const markdown = serializeNoteFile({
        frontmatter: {
          ...existing.frontmatter,
          archivedAt,
        },
        body: existing.body,
        sourcePath: archivedRelativePath,
      })
      let wroteArchivedCopy = false

      try {
        mkdirSync(archiveDirectoryPath, { recursive: true })

        if (archivedNotePath !== normalizedNotePath && existsSync(archivedNotePath)) {
          throw new Error(`Archive destination already exists: ${archivedRelativePath}.`)
        }

        writeFileSync(archivedNotePath, markdown, "utf8")
        wroteArchivedCopy = true

        if (archivedNotePath !== normalizedNotePath) {
          rmSync(normalizedNotePath)
        }
      } catch (error) {
        if (wroteArchivedCopy && archivedNotePath !== normalizedNotePath && existsSync(archivedNotePath)) {
          rmSync(archivedNotePath, { force: true })
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
      const notesPath = assertPathInsideRoot(normalizedRootPath, path.join(normalizedRootPath, NOTES_RELATIVE_PATH))
      const notePaths: string[] = []

      try {
        collectMarkdownFiles(normalizedRootPath, notesPath, notePaths)
      } catch (error) {
        wrapRepositoryError("list", NOTES_RELATIVE_PATH, error)
      }

      notePaths.sort((left, right) => left.localeCompare(right))

      return notePaths.map((notePath) => ({
        notePath,
        relativePath: toRootRelativePath(normalizedRootPath, notePath),
      }))
    },
  }
}
