import path from "node:path"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

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
}

const DEFAULT_INBOX_RELATIVE_PATH = path.join("notes", "inbox")

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

      mkdirSync(inboxPath, { recursive: true })
      writeFileSync(notePath, markdown, "utf8")

      return {
        notePath,
        relativePath,
      }
    },

    read(notePath) {
      const normalizedNotePath = assertPathInsideRoot(normalizedRootPath, notePath)
      const relativePath = toRootRelativePath(normalizedRootPath, normalizedNotePath)
      const markdown = readFileSync(normalizedNotePath, "utf8")

      return parseNoteFile(markdown, relativePath)
    },
  }
}
