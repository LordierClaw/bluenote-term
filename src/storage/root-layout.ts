import path from "node:path"
import { mkdirSync } from "node:fs"

export const MANAGED_ROOT_LAYOUT = [
  "notes/inbox",
  "notes/journal",
  "notes/archive",
  "scratches",
  "templates",
  ".bluenote",
  ".bluenote/recovery",
  ".bluenote/tmp",
  ".bluenote/logs",
] as const

export function ensureManagedRoot(rootPath: string): string {
  const normalizedRootPath = path.resolve(rootPath)

  for (const relativePath of MANAGED_ROOT_LAYOUT) {
    mkdirSync(path.join(normalizedRootPath, relativePath), { recursive: true })
  }

  return normalizedRootPath
}
