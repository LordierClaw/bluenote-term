import { test } from "bun:test"
import assert from "node:assert/strict"

import { InvalidFrontmatterError } from "../../../src/core/errors"
import { validateNoteSidecar } from "../../../src/storage/sidecar-schema"

test("validateNoteSidecar accepts the canonical sidecar JSON shape", () => {
  const sidecar = validateNoteSidecar(
    {
      key: "note-work-24-abc123",
      title: "Note Work #24",
      description: "Meeting notes about rollout risks.",
      relativePath: "notes/inbox/note-work-24-abc123.md",
      createdAt: "2026-05-24T12:00:00.000Z",
      updatedAt: "2026-05-24T12:10:00.000Z",
      archivedAt: null,
      namingVersion: 1,
    },
    ".state/notes/note-work-24-abc123.json",
  )

  assert.deepEqual(sidecar, {
    key: "note-work-24-abc123",
    title: "Note Work #24",
    description: "Meeting notes about rollout risks.",
    relativePath: "notes/inbox/note-work-24-abc123.md",
    createdAt: "2026-05-24T12:00:00.000Z",
    updatedAt: "2026-05-24T12:10:00.000Z",
    archivedAt: null,
    namingVersion: 1,
  })
})

test("validateNoteSidecar rejects non-object sidecar input with a validation error", () => {
  assert.throws(
    () => validateNoteSidecar("not-an-object", ".state/notes/note-work-24-abc123.json"),
    (error: unknown) => {
      assert.ok(error instanceof InvalidFrontmatterError)
      assert.match(error.message, /expected a JSON object/i)
      return true
    },
  )
})

test("validateNoteSidecar rejects missing required fields", () => {
  assert.throws(
    () =>
      validateNoteSidecar(
        {
          key: "note-work-24-abc123",
          title: "Note Work #24",
          description: "Meeting notes about rollout risks.",
          createdAt: "2026-05-24T12:00:00.000Z",
          updatedAt: "2026-05-24T12:10:00.000Z",
          archivedAt: null,
          namingVersion: 1,
        },
        ".state/notes/note-work-24-abc123.json",
      ),
    (error: unknown) => {
      assert.ok(error instanceof InvalidFrontmatterError)
      assert.match(error.message, /relativePath/i)
      return true
    },
  )
})

test("validateNoteSidecar rejects invalid required fields", () => {
  assert.throws(
    () =>
      validateNoteSidecar(
        {
          key: "note-work-24-abc123",
          title: "Note Work #24",
          description: "Meeting notes about rollout risks.",
          relativePath: "notes/inbox/note-work-24-abc123.md",
          createdAt: "2026-05-24T12:00:00.000Z",
          updatedAt: "not-a-timestamp",
          archivedAt: null,
          namingVersion: "1",
        },
        ".state/notes/note-work-24-abc123.json",
      ),
    (error: unknown) => {
      assert.ok(error instanceof InvalidFrontmatterError)
      assert.match(error.message, /updatedAt|namingVersion/i)
      return true
    },
  )
})
