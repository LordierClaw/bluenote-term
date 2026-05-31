import { InvalidFrontmatterError } from "../core/errors"
import {
  assertKnownFields,
  assertNumberField,
  assertRequiredFields,
  assertStringField,
  assertTimestampField,
  isRecord,
} from "./note-schema"

export interface NoteSidecar {
  key: string
  title: string
  description: string
  relativePath: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  namingVersion: number
}

const REQUIRED_SIDECAR_FIELDS = [
  "key",
  "title",
  "description",
  "relativePath",
  "createdAt",
  "updatedAt",
  "archivedAt",
  "namingVersion",
] as const

function assertArchivedAtField(record: Record<string, unknown>, sourcePath: string): string | null {
  const value = record.archivedAt

  if (value === null) {
    return null
  }

  return assertTimestampField(record, "archivedAt", sourcePath, "sidecar metadata")
}

function assertDescriptionField(record: Record<string, unknown>, sourcePath: string): string {
  const value = record.description

  if (typeof value !== "string") {
    throw new InvalidFrontmatterError(`Invalid sidecar metadata in ${sourcePath}: 'description' must be a string.`)
  }

  return value
}

export function validateNoteSidecar(sidecar: unknown, sourcePath: string): NoteSidecar {
  const validationKind = "sidecar metadata"

  if (!isRecord(sidecar)) {
    throw new InvalidFrontmatterError(`Invalid ${validationKind} in ${sourcePath}: expected a JSON object.`)
  }

  assertKnownFields(sidecar, REQUIRED_SIDECAR_FIELDS, sourcePath, validationKind)
  assertRequiredFields(sidecar, REQUIRED_SIDECAR_FIELDS, sourcePath, validationKind)

  return {
    key: assertStringField(sidecar, "key", sourcePath, validationKind),
    title: assertStringField(sidecar, "title", sourcePath, validationKind),
    description: assertDescriptionField(sidecar, sourcePath),
    relativePath: assertStringField(sidecar, "relativePath", sourcePath, validationKind),
    createdAt: assertTimestampField(sidecar, "createdAt", sourcePath, validationKind),
    updatedAt: assertTimestampField(sidecar, "updatedAt", sourcePath, validationKind),
    archivedAt: assertArchivedAtField(sidecar, sourcePath),
    namingVersion: assertNumberField(sidecar, "namingVersion", sourcePath, validationKind),
  }
}
