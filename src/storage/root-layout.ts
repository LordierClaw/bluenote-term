import path from "node:path"
import { mkdirSync } from "node:fs"

import {
  STATE_COMPLETIONS_DIRECTORY,
  STATE_DIRECTORY,
  STATE_LOGS_DIRECTORY,
  STATE_NOTES_DIRECTORY,
  STATE_RECOVERY_DIRECTORY,
  STATE_TMP_DIRECTORY,
} from "../config/root"
import { UsageError } from "../core/errors"
import { assertPathInsideRoot } from "../platform/path-safety"

export const MANAGED_ROOT_LAYOUT = [
  "notes/inbox",
  "notes/journal",
  "notes/archive",
  "scratches",
  "templates",
  STATE_DIRECTORY,
  STATE_NOTES_DIRECTORY,
  STATE_RECOVERY_DIRECTORY,
  STATE_COMPLETIONS_DIRECTORY,
  STATE_TMP_DIRECTORY,
  STATE_LOGS_DIRECTORY,
] as const

const NOTES_DIRECTORY = "notes"
const INBOX_DIRECTORY = path.join(NOTES_DIRECTORY, "inbox")
const ARCHIVE_DIRECTORY = path.join(NOTES_DIRECTORY, "archive")

export function getNotesPath(rootPath: string): string {
  return assertPathInsideRoot(rootPath, path.join(path.resolve(rootPath), NOTES_DIRECTORY))
}

export function getInboxPath(rootPath: string): string {
  return assertPathInsideRoot(rootPath, path.join(path.resolve(rootPath), INBOX_DIRECTORY))
}

export function getArchivePath(rootPath: string): string {
  return assertPathInsideRoot(rootPath, path.join(path.resolve(rootPath), ARCHIVE_DIRECTORY))
}

export function getStateNotesPath(rootPath: string): string {
  return assertPathInsideRoot(rootPath, path.join(path.resolve(rootPath), STATE_NOTES_DIRECTORY))
}

export function getInboxNotePath(rootPath: string, key: string): string {
  const inboxPath = getInboxPath(rootPath)

  return assertPathInsideRoot(inboxPath, path.join(inboxPath, `${key}.md`))
}

export function getArchiveNotePath(rootPath: string, key: string): string {
  const archivePath = getArchivePath(rootPath)

  return assertPathInsideRoot(archivePath, path.join(archivePath, `${key}.md`))
}

export function ensureManagedRoot(rootPath: string): string {
  const normalizedRootPath = path.resolve(rootPath)

  try {
    for (const relativePath of MANAGED_ROOT_LAYOUT) {
      mkdirSync(path.join(normalizedRootPath, relativePath), { recursive: true })
    }
  } catch (error) {
    throw new UsageError(`Could not initialize BlueNote root at '${normalizedRootPath}'.`, {
      hint: "Ensure BLUENOTE_ROOT points to a writable directory path.",
      cause: error,
    })
  }

  return normalizedRootPath
}
