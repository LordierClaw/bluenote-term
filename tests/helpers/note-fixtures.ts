import { serializeNoteFile } from "../../src/storage/frontmatter"

export type NoteFixtureInput = {
  id: string
  title: string
  body?: string
  createdAt?: string
  updatedAt?: string
  archivedAt?: string
  tags?: string[]
}

export function noteMarkdown({
  id,
  title,
  body = "",
  createdAt = "2026-05-21T10:15:00.000Z",
  updatedAt = createdAt,
  archivedAt,
  tags = [],
}: NoteFixtureInput): string {
  return serializeNoteFile({
    frontmatter: {
      id,
      schemaVersion: 1,
      title,
      mode: "plain",
      tags,
      createdAt,
      updatedAt,
      ...(archivedAt ? { archivedAt } : {}),
    },
    body,
    sourcePath: "tests/fixtures/generated.md",
  })
}
