import path from "node:path"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

import { STATE_NOTES_DIRECTORY } from "../config/root"
import { UsageError } from "../core/errors"
import { assertPathInsideRoot } from "../platform/path-safety"
import type { NoteSidecar } from "./sidecar-schema"
import { validateNoteSidecar } from "./sidecar-schema"

export interface SidecarRepository {
  getSidecarPath(key: string): string
  read(key: string): NoteSidecar
  write(sidecar: NoteSidecar): string
}

function wrapSidecarRepositoryError(action: "read" | "write", relativePath: string, error: unknown): never {
  const message = action === "read" ? `Could not read sidecar '${relativePath}'.` : `Could not write sidecar '${relativePath}'.`
  const hint =
    action === "read"
      ? "Ensure the sidecar exists inside BLUENOTE_ROOT/.state/notes and is readable."
      : "Ensure BLUENOTE_ROOT points to a writable directory path."

  throw new UsageError(message, {
    hint,
    cause: error,
  })
}

export function createSidecarRepository(rootPath: string): SidecarRepository {
  const normalizedRootPath = path.resolve(rootPath)
  const normalizedStateNotesPath = path.join(normalizedRootPath, STATE_NOTES_DIRECTORY)

  function getSidecarPath(key: string): string {
    return assertPathInsideRoot(normalizedStateNotesPath, path.join(normalizedStateNotesPath, `${key}.json`))
  }

  return {
    getSidecarPath,

    read(key) {
      const sidecarPath = getSidecarPath(key)
      let rawJson: string

      try {
        rawJson = readFileSync(sidecarPath, "utf8")
      } catch (error) {
        wrapSidecarRepositoryError("read", path.join(STATE_NOTES_DIRECTORY, `${key}.json`), error)
      }

      let parsed: unknown

      try {
        parsed = JSON.parse(rawJson)
      } catch (error) {
        throw new UsageError(`Could not parse sidecar '${path.join(STATE_NOTES_DIRECTORY, `${key}.json`)}'.`, {
          hint: "Ensure sidecar files contain valid JSON metadata.",
          cause: error,
        })
      }

      return validateNoteSidecar(parsed, path.join(STATE_NOTES_DIRECTORY, `${key}.json`))
    },

    write(sidecar) {
      const canonicalSidecar = validateNoteSidecar(sidecar, path.join(STATE_NOTES_DIRECTORY, "<unknown>.json"))
      const sidecarPath = getSidecarPath(canonicalSidecar.key)

      try {
        mkdirSync(path.dirname(sidecarPath), { recursive: true })
        writeFileSync(sidecarPath, JSON.stringify(canonicalSidecar, null, 2) + "\n", "utf8")
      } catch (error) {
        wrapSidecarRepositoryError("write", path.join(STATE_NOTES_DIRECTORY, `${canonicalSidecar.key}.json`), error)
      }

      return sidecarPath
    },
  }
}
