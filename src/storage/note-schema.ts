import { InvalidFrontmatterError } from "../core/errors"

export interface NoteFrontmatter {
  id: string
  schemaVersion: number
  title: string
  mode: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface ParsedNote {
  frontmatter: NoteFrontmatter
  body: string
  sourcePath: string
}

const REQUIRED_FIELDS = [
  "id",
  "schemaVersion",
  "title",
  "mode",
  "tags",
  "createdAt",
  "updatedAt",
] as const

const REQUIRED_FIELD_SET = new Set<string>(REQUIRED_FIELDS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertStringField(record: Record<string, unknown>, field: keyof NoteFrontmatter, sourcePath: string): string {
  const value = record[field]

  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidFrontmatterError(`Invalid frontmatter in ${sourcePath}: '${field}' must be a non-empty string.`)
  }

  return value
}

function assertTimestampField(record: Record<string, unknown>, field: "createdAt" | "updatedAt", sourcePath: string): string {
  const value = assertStringField(record, field, sourcePath)

  try {
    if (new Date(value).toISOString() !== value) {
      throw new Error("timestamp mismatch")
    }
  } catch {
    throw new InvalidFrontmatterError(
      `Invalid frontmatter in ${sourcePath}: '${field}' must be an ISO 8601 timestamp.`,
    )
  }

  return value
}

function assertNumberField(record: Record<string, unknown>, field: keyof NoteFrontmatter, sourcePath: string): number {
  const value = record[field]

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new InvalidFrontmatterError(`Invalid frontmatter in ${sourcePath}: '${field}' must be a number.`)
  }

  return value
}

function assertTagsField(record: Record<string, unknown>, sourcePath: string): string[] {
  const value = record.tags

  if (!Array.isArray(value) || value.some((tag) => typeof tag !== "string")) {
    throw new InvalidFrontmatterError(`Invalid frontmatter in ${sourcePath}: 'tags' must be an array of strings.`)
  }

  return value
}

export function validateNoteFrontmatter(frontmatter: unknown, sourcePath: string): NoteFrontmatter {
  if (!isRecord(frontmatter)) {
    throw new InvalidFrontmatterError(`Invalid frontmatter in ${sourcePath}: expected a YAML object.`)
  }

  for (const field of Object.keys(frontmatter)) {
    if (!REQUIRED_FIELD_SET.has(field)) {
      throw new InvalidFrontmatterError(`Invalid frontmatter in ${sourcePath}: unknown field '${field}'.`)
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in frontmatter)) {
      throw new InvalidFrontmatterError(`Invalid frontmatter in ${sourcePath}: missing required field '${field}'.`)
    }
  }

  return {
    id: assertStringField(frontmatter, "id", sourcePath),
    schemaVersion: assertNumberField(frontmatter, "schemaVersion", sourcePath),
    title: assertStringField(frontmatter, "title", sourcePath),
    mode: assertStringField(frontmatter, "mode", sourcePath),
    tags: assertTagsField(frontmatter, sourcePath),
    createdAt: assertTimestampField(frontmatter, "createdAt", sourcePath),
    updatedAt: assertTimestampField(frontmatter, "updatedAt", sourcePath),
  }
}
