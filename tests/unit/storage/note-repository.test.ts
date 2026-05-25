import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

import { UsageError } from "../../../src/core/errors"
import { parsePlainNote } from "../../../src/storage/plain-note"
import { createNoteRepository } from "../../../src/storage/note-repository"

const FIXED_FRONTMATTER = {
  id: "note-123",
  schemaVersion: 1,
  title: "Example title",
  mode: "plain",
  tags: [],
  createdAt: "2026-05-21T10:15:00.000Z",
  updatedAt: "2026-05-21T10:15:00.000Z",
}

test("repository writes a new note to notes/inbox", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-"))

  try {
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Hello from BlueNote.\n",
    })

    assert.equal(created.relativePath, path.join("notes", "inbox", "note-123.md"))
    assert.equal(created.notePath, path.join(rootPath, "notes", "inbox", "note-123.md"))

    const loaded = repository.read(created.notePath)
    assert.deepEqual(loaded.frontmatter, FIXED_FRONTMATTER)
    assert.equal(loaded.body, "Hello from BlueNote.\n")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("note file contains the canonical plain-note body", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-frontmatter-"))

  try {
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "A body line.\nAnother line.\n",
    })

    const markdown = await readFile(created.notePath, "utf8")
    const parsedNote = parsePlainNote(markdown, created.relativePath)

    assert.equal(parsedNote.body, "A body line.\nAnother line.\n")
    assert.equal(markdown, "A body line.\nAnother line.\n")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("repository wraps note creation filesystem failures in a UsageError", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-create-error-"))
  const blockedRoot = path.join(tempRoot, "blocked-root")

  try {
    await writeFile(blockedRoot, "not a directory")

    const repository = createNoteRepository(blockedRoot)

    assert.throws(
      () => repository.create({ frontmatter: FIXED_FRONTMATTER, body: "" }),
      (error) => {
        assert.ok(error instanceof UsageError)
        assert.match(error.message, /Could not create note 'notes[\\/]inbox[\\/]note-123\.md'\./)
        assert.equal(error.hint, "Ensure BLUENOTE_ROOT points to a writable directory path.")

        return true
      },
    )
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("repository wraps note read filesystem failures in a UsageError", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-read-error-"))

  try {
    const repository = createNoteRepository(rootPath)

    assert.throws(
      () => repository.read(path.join(rootPath, "notes", "inbox", "missing.md")),
      (error) => {
        assert.ok(error instanceof UsageError)
        assert.match(error.message, /Could not read note 'notes[\\/]inbox[\\/]missing\.md'\./)
        assert.equal(error.hint, "Ensure the note exists inside BLUENOTE_ROOT and is readable.")

        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("repository archive rolls back the destination file when removing the source fails", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-archive-rollback-"))
  const inboxPath = path.join(rootPath, "notes", "inbox")
  const archivePath = path.join(rootPath, "notes", "archive")
  const sourcePath = path.join(inboxPath, "note-123.md")
  const archivedPath = path.join(archivePath, "note-123.md")

  try {
    await mkdir(inboxPath, { recursive: true })
    await mkdir(archivePath, { recursive: true })
    await writeFile(
      sourcePath,
      `---\nid: note-123\nschemaVersion: 1\ntitle: Example title\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nHello from BlueNote.\n`,
      "utf8",
    )

    const repository = createNoteRepository(rootPath)
    const originalRmSync = fs.rmSync
    const sourceRemovalFailure = new Error("simulated source removal failure")
    const rmMock = spyOn(fs, "rmSync").mockImplementation((...args: Parameters<typeof fs.rmSync>) => {
      const [targetPath] = args

      if (path.resolve(String(targetPath)) === path.resolve(sourcePath)) {
        throw sourceRemovalFailure
      }

      return originalRmSync(...args)
    })

    try {
      assert.throws(
        () => repository.archive(sourcePath, "2026-05-21T12:30:00.000Z"),
        (error) => {
          assert.ok(error instanceof UsageError)
          assert.match(error.message, /Could not archive note 'notes[\\/]inbox[\\/]note-123\.md'\./)
          assert.equal(error.hint, "Ensure the note exists inside BLUENOTE_ROOT and the archive path is writable.")
          assert.equal(error.cause, sourceRemovalFailure)
          return true
        },
      )
    } finally {
      rmMock.mockRestore()
    }

    await access(sourcePath)
    await assert.rejects(() => access(archivedPath))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
