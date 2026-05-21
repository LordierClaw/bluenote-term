import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

import { UsageError } from "../../../src/core/errors"
import { parseNoteFile } from "../../../src/storage/frontmatter"
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

test("note file contains valid frontmatter and body", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-frontmatter-"))

  try {
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "A body line.\nAnother line.\n",
    })

    const markdown = await readFile(created.notePath, "utf8")
    const parsedNote = parseNoteFile(markdown, created.relativePath)

    assert.deepEqual(parsedNote.frontmatter, FIXED_FRONTMATTER)
    assert.equal(parsedNote.body, "A body line.\nAnother line.\n")
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
