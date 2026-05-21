import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readFile, rm } from "node:fs/promises"

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
