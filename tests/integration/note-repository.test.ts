import test from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spyOn } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

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

test("listing notes rejects duplicate basenames across the notes tree", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const inboxDuplicatePath = path.join(rootPath, "notes", "inbox", "shared-note.md")
    const journalDuplicatePath = path.join(rootPath, "notes", "journal", "project-a", "shared-note.md")

    await writeFile(inboxDuplicatePath, "Inbox copy.\n", "utf8")
    await mkdir(path.dirname(journalDuplicatePath), { recursive: true })
    await writeFile(journalDuplicatePath, "Journal copy.\n", "utf8")

    assert.throws(
      () => repository.listNotePaths(),
      /duplicate note key 'shared-note'.*notes[\\/]inbox[\\/]shared-note\.md.*notes[\\/]journal[\\/]project-a[\\/]shared-note\.md/i,
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("create keeps a pre-existing note file when sidecar persistence fails", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const notePath = getInboxNotePath(rootPath, FIXED_FRONTMATTER.id)
    const stateNotesPath = getStateNotesPath(rootPath)

    await writeFile(notePath, "Existing body.\n", "utf8")
    await rm(stateNotesPath, { recursive: true, force: true })
    await writeFile(stateNotesPath, "not-a-directory", "utf8")

    assert.throws(
      () =>
        repository.create({
          frontmatter: FIXED_FRONTMATTER,
          body: "Replacement body.\n",
        }),
      /Could not create note 'notes[\\/]inbox[\\/]note-123\.md'\./,
    )

    assert.equal(await readFile(notePath, "utf8"), "Replacement body.\n")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("create rejects unsupported frontmatter fields instead of silently dropping them", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)

    assert.throws(
      () =>
        repository.create({
          frontmatter: {
            ...FIXED_FRONTMATTER,
            schemaVersion: 2,
            mode: "rich",
            tags: ["project"],
          },
          body: "Hello from BlueNote.\n",
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true)
        assert.match((error as Error).message, /only supports schemaVersion=1, mode='plain', and an empty tags array/i)
        return true
      },
    )
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

test("archive preserves the original failure when sidecar rollback also fails", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Archive me.\n",
    })
    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    const originalWriteFileSync = fs.writeFileSync
    const originalRmSync = fs.rmSync
    const sourceRemovalFailure = new Error("simulated source removal failure")
    const rollbackWriteFailure = new Error("simulated sidecar rollback failure")

    const writeMock = spyOn(fs, "writeFileSync").mockImplementation((...args: Parameters<typeof fs.writeFileSync>) => {
      const [targetPath, data] = args

      if (
        path.resolve(String(targetPath)) === path.resolve(sidecarPath) &&
        typeof data === "string" &&
        data.includes('"archivedAt": null')
      ) {
        throw rollbackWriteFailure
      }

      return originalWriteFileSync(...args)
    })

    const rmMock = spyOn(fs, "rmSync").mockImplementation((...args: Parameters<typeof fs.rmSync>) => {
      const [targetPath] = args

      if (path.resolve(String(targetPath)) === path.resolve(created.notePath)) {
        throw sourceRemovalFailure
      }

      return originalRmSync(...args)
    })

    try {
      assert.throws(
        () => repository.archive(created.notePath, "2026-05-21T12:30:00.000Z"),
        (error: unknown) => {
          assert.equal(error instanceof Error, true)
          assert.match((error as Error).message, /Could not archive note 'notes[\\/]inbox[\\/]note-123\.md'\./)
          assert.equal((error as Error).cause instanceof AggregateError, true)
          const aggregateCause = (error as Error).cause as AggregateError
          assert.equal(aggregateCause.errors.length, 2)
          assert.equal(aggregateCause.errors[0], sourceRemovalFailure)
          assert.equal(aggregateCause.errors[1] instanceof Error, true)
          assert.match((aggregateCause.errors[1] as Error).message, /Could not write sidecar '.state[\\/]notes[\\/]note-123\.json'\./)
          assert.equal((aggregateCause.errors[1] as Error).cause, rollbackWriteFailure)
          assert.match(aggregateCause.message, /rollback/i)
          return true
        },
      )
    } finally {
      writeMock.mockRestore()
      rmMock.mockRestore()
    }

    await access(created.notePath)
    await assert.rejects(() => access(getArchiveNotePath(rootPath, "note-123")))

    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))
    assert.equal(sidecar.relativePath, path.join("notes", "archive", "note-123.md"))
    assert.equal(sidecar.archivedAt, "2026-05-21T12:30:00.000Z")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
