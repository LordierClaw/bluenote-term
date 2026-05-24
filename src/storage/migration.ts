import path from "node:path"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"

import { AppError, IndexValidationFailedError, UsageError } from "../core/errors"
import { createNoteDescription } from "../domain/note-description"
import { createNoteKey } from "../domain/note-key"
import { rebuildIndexes, type RebuildIndexesSummary } from "../core/rebuild-indexes"
import type { IndexedNoteRecord } from "../index/index-store"
import { assertPathInsideRoot } from "../platform/path-safety"
import { parseNoteFile } from "./frontmatter"
import { createNoteRepository } from "./note-repository"
import type { ParsedNote } from "./note-schema"
import { normalizePlainNoteBody } from "./plain-note"
import { createSidecarRepository } from "./sidecar-repository"
import { ensureManagedRoot, getStateNotesPath } from "./root-layout"

export interface StorageFormatSummary {
  kind: "empty-root" | "old-format" | "new-format" | "mixed-format"
  legacyNoteCount: number
  plainNoteCount: number
  sidecarCount: number
}

export interface MigrateLegacyStorageTestHooks {
  rebuildIndexes?: (rootPath: string) => RebuildIndexesSummary
}

export interface MigrateLegacyStorageOptions {
  rootPath: string
  migratedAt: string
  randomSource?: () => number
  testHooks?: MigrateLegacyStorageTestHooks
}

export interface MigrateLegacyStorageResult {
  status: "noop" | "migrated"
  reason?: "empty-root" | "new-format"
  rootPath: string
  migratedNoteCount: number
  keyMap: Record<string, string>
}

interface LegacyMigrationCandidate {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  previousRelativePath: string
}

interface RecoveryKeyMapNote {
  previousId: string
  nextKey: string
  previousRelativePath: string
  nextRelativePath: string
}

function listSidecarKeys(rootPath: string): string[] {
  const sidecarDirectoryPath = getStateNotesPath(rootPath)

  if (!existsSync(sidecarDirectoryPath)) {
    return []
  }

  return readdirSync(sidecarDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.basename(entry.name, ".json"))
    .sort((left, right) => left.localeCompare(right))
}

function looksLikeLegacyFrontmatterNote(rawNote: string): boolean {
  const normalized = normalizePlainNoteBody(rawNote)
  return /^---\n[\s\S]*\n---\n?/.test(normalized)
}

function readLegacyMigrationCandidates(rootPath: string): {
  legacyNoteCount: number
  plainNoteCount: number
  candidates: LegacyMigrationCandidate[]
} {
  const repository = createNoteRepository(rootPath)
  const records = repository.listNotePaths()
  const candidates: LegacyMigrationCandidate[] = []
  let legacyNoteCount = 0
  let plainNoteCount = 0

  for (const record of records) {
    const rawNote = repository.readRaw(record.notePath)

    if (!looksLikeLegacyFrontmatterNote(rawNote)) {
      plainNoteCount += 1
      continue
    }

    const parsed = parseNoteFile(rawNote, record.relativePath)
    legacyNoteCount += 1
    candidates.push({
      id: parsed.frontmatter.id,
      title: parsed.frontmatter.title,
      body: parsed.body,
      createdAt: parsed.frontmatter.createdAt,
      updatedAt: parsed.frontmatter.updatedAt,
      archivedAt: parsed.frontmatter.archivedAt ?? null,
      previousRelativePath: record.relativePath,
    })
  }

  candidates.sort((left, right) => left.id.localeCompare(right.id))

  return { legacyNoteCount, plainNoteCount, candidates }
}

function hasSafeNewFormatState(rootPath: string): boolean {
  const repository = createNoteRepository(rootPath)
  const sidecars = createSidecarRepository(rootPath)
  const records = repository.listNotePaths()
  const sidecarKeys = listSidecarKeys(rootPath)

  if (records.length === 0 || sidecarKeys.length !== records.length) {
    return false
  }

  const seenKeys = new Set<string>()

  try {
    for (const record of records) {
      const key = path.basename(record.relativePath, ".md")
      const sidecar = sidecars.read(key)

      if (sidecar.relativePath !== record.relativePath || seenKeys.has(key)) {
        return false
      }

      seenKeys.add(key)
    }
  } catch {
    return false
  }

  return sidecarKeys.every((key) => seenKeys.has(key))
}

export function detectStorageFormat(rootPath: string): StorageFormatSummary {
  const managedRootPath = ensureManagedRoot(rootPath)
  const { legacyNoteCount, plainNoteCount } = readLegacyMigrationCandidates(managedRootPath)
  const sidecarCount = listSidecarKeys(managedRootPath).length

  if (legacyNoteCount === 0 && plainNoteCount === 0 && sidecarCount === 0) {
    return {
      kind: "empty-root",
      legacyNoteCount,
      plainNoteCount,
      sidecarCount,
    }
  }

  if (legacyNoteCount > 0 && plainNoteCount === 0 && sidecarCount === 0) {
    return {
      kind: "old-format",
      legacyNoteCount,
      plainNoteCount,
      sidecarCount,
    }
  }

  if (legacyNoteCount === 0 && plainNoteCount > 0 && sidecarCount > 0 && hasSafeNewFormatState(managedRootPath)) {
    return {
      kind: "new-format",
      legacyNoteCount,
      plainNoteCount,
      sidecarCount,
    }
  }

  return {
    kind: "mixed-format",
    legacyNoteCount,
    plainNoteCount,
    sidecarCount,
  }
}

function formatRecoveryDirectoryName(migratedAt: string): string {
  return `migrate-${migratedAt.replace(/[:.]/g, "-")}`
}

function getRecoveryDirectoryPath(rootPath: string, migratedAt: string): string {
  return assertPathInsideRoot(rootPath, path.join(rootPath, ".state", "recovery", formatRecoveryDirectoryName(migratedAt)))
}

function writeRecoverySnapshot(rootPath: string, migratedAt: string, candidates: readonly LegacyMigrationCandidate[]): string {
  const recoveryPath = getRecoveryDirectoryPath(rootPath, migratedAt)

  mkdirSync(recoveryPath, { recursive: true })

  for (const candidate of candidates) {
    const sourcePath = assertPathInsideRoot(rootPath, path.join(rootPath, candidate.previousRelativePath))
    const destinationPath = assertPathInsideRoot(recoveryPath, path.join(recoveryPath, candidate.previousRelativePath))
    mkdirSync(path.dirname(destinationPath), { recursive: true })
    copyFileSync(sourcePath, destinationPath)
  }

  return recoveryPath
}

function buildMigratedRelativePath(previousRelativePath: string, key: string): string {
  return path.join(path.dirname(previousRelativePath), `${key}.md`)
}

function writeRecoveryKeyMap(
  recoveryPath: string,
  migratedAt: string,
  notes: readonly RecoveryKeyMapNote[],
): void {
  writeFileSync(
    path.join(recoveryPath, "key-map.json"),
    JSON.stringify(
      {
        migratedAt,
        notes,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  )
}

function clearDerivedIndexes(rootPath: string): void {
  const indexPaths = [
    path.join(rootPath, ".state", "metadata.sqlite"),
    path.join(rootPath, ".state", "search-index.json"),
  ]

  for (const indexPath of indexPaths) {
    if (existsSync(indexPath)) {
      rmSync(indexPath, { force: true })
    }
  }
}

function rollbackMigrationArtifacts(
  rootPath: string,
  migratedRelativePaths: readonly string[],
  migratedKeys: readonly string[],
): void {
  const sidecars = createSidecarRepository(rootPath)

  for (const relativePath of migratedRelativePaths) {
    const notePath = assertPathInsideRoot(rootPath, path.join(rootPath, relativePath))

    if (existsSync(notePath)) {
      rmSync(notePath, { force: true })
    }
  }

  for (const key of migratedKeys) {
    const sidecarPath = sidecars.getSidecarPath(key)

    if (existsSync(sidecarPath)) {
      rmSync(sidecarPath, { force: true })
    }
  }
}

export function migrateLegacyStorage(options: MigrateLegacyStorageOptions): MigrateLegacyStorageResult {
  const rootPath = ensureManagedRoot(options.rootPath)
  const format = detectStorageFormat(rootPath)

  if (format.kind === "empty-root") {
    return {
      status: "noop",
      reason: "empty-root",
      rootPath,
      migratedNoteCount: 0,
      keyMap: {},
    }
  }

  if (format.kind === "new-format") {
    return {
      status: "noop",
      reason: "new-format",
      rootPath,
      migratedNoteCount: 0,
      keyMap: {},
    }
  }

  if (format.kind === "mixed-format") {
    throw new UsageError("Cannot migrate a mixed-format BlueNote root.", {
      hint: "Resolve the mixed state manually before retrying bn migrate.",
    })
  }

  const { candidates } = readLegacyMigrationCandidates(rootPath)
  const recoveryPath = writeRecoverySnapshot(rootPath, options.migratedAt, candidates)
  const existingKeys = new Set<string>(candidates.map((candidate) => path.basename(candidate.previousRelativePath, ".md")))
  const keyMap: Record<string, string> = {}
  const recoveryNotes: RecoveryKeyMapNote[] = []
  const migratedRelativePaths: string[] = []
  const migratedKeys: string[] = []
  const sidecars = createSidecarRepository(rootPath)

  try {
    for (const candidate of candidates) {
      const key = createNoteKey(candidate.title, {
        isUnique: (proposedKey) => !existingKeys.has(proposedKey),
        randomSource: options.randomSource,
      })
      const nextRelativePath = buildMigratedRelativePath(candidate.previousRelativePath, key)
      const nextNotePath = assertPathInsideRoot(rootPath, path.join(rootPath, nextRelativePath))
      const previousNotePath = assertPathInsideRoot(rootPath, path.join(rootPath, candidate.previousRelativePath))

      existingKeys.add(key)
      mkdirSync(path.dirname(nextNotePath), { recursive: true })
      writeFileSync(nextNotePath, normalizePlainNoteBody(candidate.body), "utf8")
      migratedRelativePaths.push(nextRelativePath)

      sidecars.write({
        key,
        title: candidate.title,
        description: createNoteDescription(candidate.body),
        relativePath: nextRelativePath,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
        archivedAt: candidate.archivedAt,
        namingVersion: 1,
      })
      migratedKeys.push(key)

      unlinkSync(previousNotePath)
      keyMap[candidate.id] = key
      recoveryNotes.push({
        previousId: candidate.id,
        nextKey: key,
        previousRelativePath: candidate.previousRelativePath,
        nextRelativePath,
      })
    }

    writeRecoveryKeyMap(recoveryPath, options.migratedAt, recoveryNotes)

    const rebuildSummary = options.testHooks?.rebuildIndexes
      ? options.testHooks.rebuildIndexes(rootPath)
      : rebuildIndexes({ override: rootPath })

    if (rebuildSummary.validationErrors.length > 0) {
      throw new IndexValidationFailedError(
        ["Migrated legacy storage, but derived indexes could not be rebuilt.", ...rebuildSummary.validationErrors].join("\n"),
        {
          hint: "Run bn rebuild after fixing the reported validation errors.",
        },
      )
    }

    return {
      status: "migrated",
      rootPath,
      migratedNoteCount: candidates.length,
      keyMap,
    }
  } catch (error) {
    const rollbackErrors: unknown[] = []

    try {
      rollbackMigrationArtifacts(rootPath, migratedRelativePaths, migratedKeys)
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }

    try {
      clearDerivedIndexes(rootPath)
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }

    for (const candidate of candidates) {
      const currentPath = assertPathInsideRoot(rootPath, path.join(rootPath, candidate.previousRelativePath))
      const snapshotPath = assertPathInsideRoot(recoveryPath, path.join(recoveryPath, candidate.previousRelativePath))

      if (existsSync(currentPath) || !existsSync(snapshotPath)) {
        continue
      }

      try {
        mkdirSync(path.dirname(currentPath), { recursive: true })
        renameSync(snapshotPath, currentPath)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }

    if (rollbackErrors.length > 0) {
      throw new UsageError("Legacy storage migration failed and rollback also failed.", {
        hint: "Inspect .state/recovery/ and fix the reported filesystem issues before retrying bn migrate.",
        cause: new AggregateError([error, ...rollbackErrors], "Migration failed and rollback also failed."),
      })
    }

    if (error instanceof AppError) {
      throw error
    }

    throw new UsageError("Legacy storage migration failed after rollback.", {
      hint: "Rollback succeeded. Fix the underlying filesystem or index error, then retry bn migrate.",
      cause: error,
    })
  }
}
