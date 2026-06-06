import { toPortableRelativePath } from "../platform/path-safety"
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
  ai?: {
    description?: {
      lastProcessedAt?: string
    }
  }
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

const OPTIONAL_SIDECAR_FIELDS = ["ai"] as const
const AI_FIELDS = ["description"] as const
const AI_DESCRIPTION_FIELDS = ["lastProcessedAt"] as const

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

function validateAiMetadata(
  value: unknown,
  sourcePath: string,
  validationKind: string,
): NoteSidecar["ai"] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new InvalidFrontmatterError(`Invalid ${validationKind} in ${sourcePath}: 'ai' must be a JSON object.`)
  }

  assertKnownFields(value, AI_FIELDS, sourcePath, validationKind)

  if (value.description === undefined) {
    return undefined
  }

  if (!isRecord(value.description)) {
    throw new InvalidFrontmatterError(
      `Invalid ${validationKind} in ${sourcePath}: 'description' must be a JSON object.`,
    )
  }

  assertKnownFields(value.description, AI_DESCRIPTION_FIELDS, sourcePath, validationKind)

  if (value.description.lastProcessedAt === undefined) {
    return undefined
  }

  return {
    description: {
      lastProcessedAt: assertTimestampField(value.description, "lastProcessedAt", sourcePath, validationKind),
    },
  }
}

export function validateNoteSidecar(sidecar: unknown, sourcePath: string): NoteSidecar {
  const validationKind = "sidecar metadata"

  if (!isRecord(sidecar)) {
    throw new InvalidFrontmatterError(`Invalid ${validationKind} in ${sourcePath}: expected a JSON object.`)
  }

  assertKnownFields(sidecar, [...REQUIRED_SIDECAR_FIELDS, ...OPTIONAL_SIDECAR_FIELDS], sourcePath, validationKind)
  assertRequiredFields(sidecar, REQUIRED_SIDECAR_FIELDS, sourcePath, validationKind)
  const ai = validateAiMetadata(sidecar.ai, sourcePath, validationKind)

  return {
    key: assertStringField(sidecar, "key", sourcePath, validationKind),
    title: assertStringField(sidecar, "title", sourcePath, validationKind),
    description: assertDescriptionField(sidecar, sourcePath),
    relativePath: toPortableRelativePath(assertStringField(sidecar, "relativePath", sourcePath, validationKind)),
    createdAt: assertTimestampField(sidecar, "createdAt", sourcePath, validationKind),
    updatedAt: assertTimestampField(sidecar, "updatedAt", sourcePath, validationKind),
    archivedAt: assertArchivedAtField(sidecar, sourcePath),
    namingVersion: assertNumberField(sidecar, "namingVersion", sourcePath, validationKind),
    ...(ai === undefined ? {} : { ai }),
  }
}
