import path from "node:path"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"

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
  list(): ParsedNote[]
}

const DEFAULT_INBOX_RELATIVE_PATH = path.join("notes", "inbox")
const NOTES_RELATIVE_PATH = "notes"

function wrapRepositoryError(action: "create" | "read" | "list", relativePath: string, error: unknown): never {
  const message =
    action === "create"
      ? `Could not create note '${relativePath}'.`
      : action === "read"
        ? `Could not read note '${relativePath}'.`
        : `Could not list notes in '${relativePath}'.`
  const hint =
    action === "create"
      ? "Ensure BLUENOTE_ROOT points to a writable directory path."
      : action === "read"
        ? "Ensure the note exists inside BLUENOTE_ROOT and is readable."
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

    list() {
      const notesPath = assertPathInsideRoot(normalizedRootPath, path.join(normalizedRootPath, NOTES_RELATIVE_PATH))
      const notePaths: string[] = []

      try {
        collectMarkdownFiles(normalizedRootPath, notesPath, notePaths)
      } catch (error) {
        wrapRepositoryError("list", NOTES_RELATIVE_PATH, error)
      }

      notePaths.sort((left, right) => left.localeCompare(right))

      return notePaths.map((notePath) => this.read(notePath))
    },
  }
}
