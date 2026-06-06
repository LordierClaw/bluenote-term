import { test } from "bun:test"
import assert from "node:assert/strict"

import { InvalidFrontmatterError } from "../../../src/core/errors"
import { validateNoteSidecar } from "../../../src/storage/sidecar-schema"

function canonicalSidecar() {
  return {
    key: "note-work-24-abc123",
    title: "Note Work #24",
    description: "Meeting notes about rollout risks.",
    relativePath: "notes/inbox/note-work-24-abc123.md",
    createdAt: "2026-05-24T12:00:00.000Z",
    updatedAt: "2026-05-24T12:10:00.000Z",
    archivedAt: null,
    namingVersion: 1,
  }
}

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

test("validateNoteSidecar accepts and preserves AI description freshness metadata", () => {
  const sidecar = validateNoteSidecar(
    {
      ...canonicalSidecar(),
      ai: { description: { lastProcessedAt: "2026-06-02T10:00:00.000Z" } },
    },
    ".state/notes/note-work-24-abc123.json",
  )

  assert.deepEqual(sidecar.ai, {
    description: { lastProcessedAt: "2026-06-02T10:00:00.000Z" },
  })
})

test("validateNoteSidecar still accepts existing sidecars with no AI metadata", () => {
  const sidecar = validateNoteSidecar(canonicalSidecar(), ".state/notes/note-work-24-abc123.json")

  assert.equal("ai" in sidecar, false)
})

test("validateNoteSidecar rejects invalid AI timestamps as sidecar metadata", () => {
  assert.throws(
    () =>
      validateNoteSidecar(
        {
          ...canonicalSidecar(),
          ai: { description: { lastProcessedAt: "not-a-timestamp" } },
        },
        ".state/notes/note-work-24-abc123.json",
      ),
    (error: unknown) => {
      assert.ok(error instanceof InvalidFrontmatterError)
      assert.match(error.message, /Invalid sidecar metadata/i)
      assert.match(error.message, /lastProcessedAt/i)
      assert.match(error.message, /ISO 8601 timestamp/i)
      return true
    },
  )
})

test("validateNoteSidecar rejects unknown nested AI fields", () => {
  assert.throws(
    () =>
      validateNoteSidecar(
        {
          ...canonicalSidecar(),
          ai: {
            description: {
              lastProcessedAt: "2026-06-02T10:00:00.000Z",
              model: "test-model",
            },
          },
        },
        ".state/notes/note-work-24-abc123.json",
      ),
    (error: unknown) => {
      assert.ok(error instanceof InvalidFrontmatterError)
      assert.match(error.message, /Invalid sidecar metadata/i)
      assert.match(error.message, /unknown field 'model'/i)
      return true
    },
  )
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
