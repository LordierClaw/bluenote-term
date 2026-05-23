import path from "node:path"
import { mkdirSync } from "node:fs"

import { STATE_DIRECTORY, STATE_NOTES_DIRECTORY } from "../config/root"
import { UsageError } from "../core/errors"

export const MANAGED_ROOT_LAYOUT = [
  "notes/inbox",
  "notes/journal",
  "notes/archive",
  "scratches",
  "templates",
  STATE_DIRECTORY,
  STATE_NOTES_DIRECTORY,
] as const

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
