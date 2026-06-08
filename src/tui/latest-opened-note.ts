import path from "node:path"
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"

import { UsageError } from "../core/errors"
import type { Clock } from "../platform/clock"
import { assertPathInsideRoot } from "../platform/path-safety"
import { replaceFileAtomically } from "../storage/atomic-replace"
import { createAppConfigRepository } from "../storage/app-config-repository"
import { createSidecarRepository } from "../storage/sidecar-repository"
import { getStatePath } from "../storage/root-layout"
import type { TuiNote } from "./state"

export interface LatestOpenedNoteState {
  relativePath: string
  openedAt: string
}

export interface LatestOpenedNoteRepository {
  exists(): boolean
  read(): LatestOpenedNoteState | null
  write(state: LatestOpenedNoteState): string
}

export interface ResolveStartupNoteOptions {
  rootPath: string
  clock: Clock
  showNote: (selector: string) => TuiNote
  createDraft: () => { key: string }
}

function getLatestOpenedNotePath(rootPath: string): string {
  return path.join(getStatePath(rootPath), "latest-opened-note.json")
}

function temporaryPath(targetPath: string): string {
  return `${targetPath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
}

function cleanup(filePath: string): void {
  try {
    rmSync(filePath, { force: true })
  } catch {
    // best effort
  }
}

function normalizeLatestOpenedNoteState(input: unknown): LatestOpenedNoteState | null {
  if (typeof input !== "object" || input === null) {
    return null
  }

  const relativePath = (input as { relativePath?: unknown }).relativePath
  const openedAt = (input as { openedAt?: unknown }).openedAt
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    return null
  }
  if (typeof openedAt !== "string" || Number.isNaN(Date.parse(openedAt))) {
    return null
  }

  return { relativePath, openedAt }
}

export function createLatestOpenedNoteRepository(rootPath: string): LatestOpenedNoteRepository {
  const statePath = getLatestOpenedNotePath(rootPath)
  const relativeStatePath = path.relative(rootPath, statePath) || statePath

  return {
    exists() {
      return existsSync(statePath)
    },

    read() {
      if (!existsSync(statePath)) {
        return null
      }

      try {
        return normalizeLatestOpenedNoteState(JSON.parse(readFileSync(statePath, "utf8")))
      } catch {
        return null
      }
    },

    write(state) {
      const canonical = normalizeLatestOpenedNoteState(state)
      if (!canonical) {
        throw new UsageError(`Could not write latest-opened state '${relativeStatePath}'.`, {
          hint: "Latest-opened state requires relativePath and ISO openedAt fields.",
        })
      }

      const tempPath = temporaryPath(statePath)
      try {
        mkdirSync(path.dirname(statePath), { recursive: true })
        writeFileSync(tempPath, `${JSON.stringify(canonical, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
        replaceFileAtomically(tempPath, statePath)
        chmodSync(statePath, 0o600)
      } catch (error) {
        cleanup(tempPath)
        throw new UsageError(`Could not write latest-opened state '${relativeStatePath}'.`, {
          hint: "Ensure BLUENOTE_ROOT points to a writable directory path.",
          cause: error,
        })
      }
      return statePath
    },
  }
}

function latestOpenedPathExists(rootPath: string, relativePath: string): boolean {
  try {
    if (path.isAbsolute(relativePath)) {
      return false
    }
    const notePath = assertPathInsideRoot(rootPath, path.join(rootPath, relativePath))
    return existsSync(notePath)
  } catch {
    return false
  }
}

function isWithinTtl(openedAt: string, now: Date, ttlDays: number): boolean {
  const openedTime = Date.parse(openedAt)
  if (Number.isNaN(openedTime)) {
    return false
  }
  const ttlMs = ttlDays * 24 * 60 * 60 * 1000
  return now.getTime() - openedTime <= ttlMs
}

export function resolveStartupNote(options: ResolveStartupNoteOptions): TuiNote {
  const configRepository = createAppConfigRepository(options.rootPath)
  const config = configRepository.read()
  if (!configRepository.exists()) {
    configRepository.write(config)
  }
  const latest = createLatestOpenedNoteRepository(options.rootPath).read()

  if (
    latest
    && latestOpenedPathExists(options.rootPath, latest.relativePath)
    && isWithinTtl(latest.openedAt, options.clock.now(), config.latestOpenedNoteTtlDays)
  ) {
    try {
      return options.showNote(latest.relativePath)
    } catch {
      // fall through to draft fallback
    }
  }

  const draft = options.createDraft()
  markStartupDraftDescriptionFresh(options.rootPath, draft.key, options.clock.now().toISOString())
  return options.showNote(draft.key)
}

function markStartupDraftDescriptionFresh(rootPath: string, key: string, timestamp: string): void {
  try {
    const sidecars = createSidecarRepository(rootPath)
    const sidecar = sidecars.read(key)
    if (sidecar.type !== "draft") {
      return
    }
    sidecars.write({
      ...sidecar,
      ai: {
        ...sidecar.ai,
        description: {
          ...(sidecar.ai?.description ?? {}),
          lastProcessedAt: timestamp,
        },
      },
    })
  } catch {
    // Startup draft creation should not fail merely because optional AI freshness metadata cannot be written.
  }
}

export function recordLatestOpenedNote(rootPath: string, note: Pick<TuiNote, "relativePath">, clock: Clock): void {
  createLatestOpenedNoteRepository(rootPath).write({
    relativePath: note.relativePath,
    openedAt: clock.now().toISOString(),
  })
}
