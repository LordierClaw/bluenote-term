import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

import { createNoteRepository } from "../../src/storage/note-repository"
import {
  ensureManagedRoot,
  getArchiveNotePath,
  getInboxNotePath,
  getStateNotesPath,
} from "../../src/storage/root-layout"

const FIXED_FRONTMATTER = {
  id: "note-123",
  schemaVersion: 1,
  title: "Example title",
  mode: "plain",
  tags: [],
  createdAt: "2026-05-21T10:15:00.000Z",
  updatedAt: "2026-05-21T10:15:00.000Z",
}

test("creating a note writes a plain markdown file and matching sidecar", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Hello from BlueNote.\n",
    })

    assert.equal(created.notePath, getInboxNotePath(rootPath, "note-123"))
    assert.equal(created.relativePath, path.join("notes", "inbox", "note-123.md"))

    const markdown = await readFile(created.notePath, "utf8")
    assert.equal(markdown, "Hello from BlueNote.\n")
    assert.doesNotMatch(markdown, /^---/)

    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))

    assert.deepEqual(sidecar, {
      key: "note-123",
      title: "Example title",
      description: "Hello from BlueNote.",
      relativePath: path.join("notes", "inbox", "note-123.md"),
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T10:15:00.000Z",
      archivedAt: null,
      namingVersion: 1,
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("reading and listing notes joins plain file bodies with sidecar metadata", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const notePath = getInboxNotePath(rootPath, "manual-note")
    const sidecarPath = path.join(getStateNotesPath(rootPath), "manual-note.json")

    await writeFile(notePath, "Manual body line.\nSecond line.\n", "utf8")
    await writeFile(
      sidecarPath,
      JSON.stringify(
        {
          key: "manual-note",
          title: "Manual Note",
          description: "Manual body line.",
          relativePath: path.join("notes", "inbox", "manual-note.md"),
          createdAt: "2026-05-21T10:15:00.000Z",
          updatedAt: "2026-05-21T11:15:00.000Z",
          archivedAt: null,
          namingVersion: 1,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    )

    const loaded = repository.read(notePath)
    assert.equal(loaded.body, "Manual body line.\nSecond line.\n")
    assert.equal(loaded.sourcePath, path.join("notes", "inbox", "manual-note.md"))
    assert.deepEqual(loaded.frontmatter, {
      id: "manual-note",
      schemaVersion: 1,
      title: "Manual Note",
      mode: "plain",
      tags: [],
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T11:15:00.000Z",
    })

    const listed = repository.list()
    assert.equal(listed.length, 1)
    assert.deepEqual(listed[0], loaded)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("archived notes preserve the key while moving the note path", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Archive me.\n",
    })

    const archived = repository.archive(created.notePath, "2026-05-21T12:30:00.000Z")

    assert.equal(archived.notePath, getArchiveNotePath(rootPath, "note-123"))
    assert.equal(archived.relativePath, path.join("notes", "archive", "note-123.md"))
    await assert.rejects(() => access(created.notePath))

    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))

    assert.equal(sidecar.key, "note-123")
    assert.equal(sidecar.relativePath, path.join("notes", "archive", "note-123.md"))
    assert.equal(sidecar.archivedAt, "2026-05-21T12:30:00.000Z")

    const loaded = repository.read(archived.notePath)
    assert.equal(loaded.frontmatter.id, "note-123")
    assert.equal(loaded.frontmatter.archivedAt, "2026-05-21T12:30:00.000Z")
    assert.equal(loaded.sourcePath, path.join("notes", "archive", "note-123.md"))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
