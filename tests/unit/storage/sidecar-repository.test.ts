import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

import { InvalidFrontmatterError } from "../../../src/core/errors"
import { createSidecarRepository } from "../../../src/storage/sidecar-repository"

const FIXED_SIDECAR = {
  key: "note-work-24-abc123",
  title: "Note Work #24",
  description: "Meeting notes about rollout risks.",
  relativePath: "notes/inbox/note-work-24-abc123.md",
  createdAt: "2026-05-24T12:00:00.000Z",
  updatedAt: "2026-05-24T12:10:00.000Z",
  archivedAt: null,
  namingVersion: 1,
} as const

test("sidecar repository writes and reads sidecars under .state/notes", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-sidecar-repository-"))

  try {
    const repository = createSidecarRepository(rootPath)
    const sidecarPath = repository.write(FIXED_SIDECAR)

    assert.equal(sidecarPath, path.join(rootPath, ".state", "notes", "note-work-24-abc123.json"))

    const sidecarJson = await readFile(sidecarPath, "utf8")
    assert.deepEqual(JSON.parse(sidecarJson), FIXED_SIDECAR)

    assert.deepEqual(repository.read(FIXED_SIDECAR.key), FIXED_SIDECAR)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("sidecar repository rejects missing required sidecar fields when writing", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-sidecar-repository-invalid-write-"))

  try {
    const repository = createSidecarRepository(rootPath)

    assert.throws(
      () =>
        repository.write({
          key: "note-work-24-abc123",
          title: "Note Work #24",
          description: "Meeting notes about rollout risks.",
          createdAt: "2026-05-24T12:00:00.000Z",
          updatedAt: "2026-05-24T12:10:00.000Z",
          archivedAt: null,
          namingVersion: 1,
        } as never),
      (error: unknown) => {
        assert.ok(error instanceof InvalidFrontmatterError)
        assert.match(error.message, /relativePath/i)
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("sidecar repository rejects invalid stored sidecars", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-sidecar-repository-invalid-read-"))

  try {
    const repository = createSidecarRepository(rootPath)
    const sidecarPath = path.join(rootPath, ".state", "notes", "note-work-24-abc123.json")

    await mkdir(path.dirname(sidecarPath), { recursive: true })
    await writeFile(
      sidecarPath,
      JSON.stringify({
        key: "note-work-24-abc123",
        title: "Note Work #24",
        description: "Meeting notes about rollout risks.",
        relativePath: "notes/inbox/note-work-24-abc123.md",
        createdAt: "2026-05-24T12:00:00.000Z",
        updatedAt: "not-a-timestamp",
        archivedAt: null,
        namingVersion: 1,
      }),
      "utf8",
    )

    assert.throws(
      () => repository.read("note-work-24-abc123"),
      (error: unknown) => {
        assert.ok(error instanceof InvalidFrontmatterError)
        assert.match(error.message, /updatedAt/i)
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
