import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { access, mkdir, mkdtemp, rm } from "node:fs/promises"

import { archiveNote } from "../../../src/core/archive-note"
import { createNoteRepository } from "../../../src/storage/note-repository"

async function writeNote(rootPath: string, relativePath: string, markdown: string) {
  const notePath = path.join(rootPath, relativePath)
  await mkdir(path.dirname(notePath), { recursive: true })
  await Bun.write(notePath, markdown)
}

test("archiveNote moves a selected note into notes/archive and stamps archivedAt", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-archive-note-"))
  const archivedAt = "2026-05-21T12:30:00.000Z"
  const originalRelativePath = path.join("notes", "inbox", "archive-me.md")

  try {
    await writeNote(
      rootPath,
      originalRelativePath,
      `---\nid: archive-me\nschemaVersion: 1\ntitle: Archive Me\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nReady to archive.\n`,
    )

    const summary = archiveNote({
      override: rootPath,
      selector: "archive-me",
      clock: {
        now() {
          return new Date(archivedAt)
        },
      },
    })

    assert.equal(summary.rootPath, rootPath)
    assert.equal(summary.archivedAt, archivedAt)
    assert.equal(summary.relativePath, path.join("notes", "archive", "archive-me.md"))
    assert.equal(summary.notePath, path.join(rootPath, "notes", "archive", "archive-me.md"))

    await assert.rejects(() => access(path.join(rootPath, originalRelativePath)))
    await access(summary.notePath)

    const repository = createNoteRepository(rootPath)
    const archivedNote = repository.read(summary.notePath)
    assert.equal(archivedNote.frontmatter.archivedAt, archivedAt)
    assert.equal(archivedNote.frontmatter.id, "archive-me")
    assert.equal(archivedNote.sourcePath, path.join("notes", "archive", "archive-me.md"))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("archiveNote fails preflight when rebuild validation would already fail and does not move the note", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-archive-note-"))

  try {
    await writeNote(
      rootPath,
      path.join("notes", "inbox", "archive-me.md"),
      `---\nid: archive-me\nschemaVersion: 1\ntitle: Archive Me\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nReady to archive.\n`,
    )
    await writeNote(
      rootPath,
      path.join("notes", "inbox", "duplicate-a.md"),
      `---\nid: duplicate-note\nschemaVersion: 1\ntitle: Duplicate A\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:16:00.000Z\nupdatedAt: 2026-05-21T10:16:00.000Z\n---\nFirst duplicate.\n`,
    )
    await writeNote(
      rootPath,
      path.join("notes", "inbox", "duplicate-b.md"),
      `---\nid: duplicate-note\nschemaVersion: 1\ntitle: Duplicate B\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:17:00.000Z\nupdatedAt: 2026-05-21T10:17:00.000Z\n---\nSecond duplicate.\n`,
    )

    assert.throws(
      () =>
        archiveNote({
          override: rootPath,
          selector: "archive-me",
        }),
      /Validation failed before archiving notes[\\/]inbox[\\/]archive-me\.md\.[\s\S]*Duplicate note id 'duplicate-note'/,
    )

    const repository = createNoteRepository(rootPath)
    const original = repository.read(path.join(rootPath, "notes", "inbox", "archive-me.md"))
    assert.equal(original.frontmatter.archivedAt, undefined)
    assert.equal(original.sourcePath, path.join("notes", "inbox", "archive-me.md"))
    await assert.rejects(() => access(path.join(rootPath, "notes", "archive", "archive-me.md")))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("archiveNote rejects notes that are already stored under notes/archive", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-archive-note-"))

  try {
    await writeNote(
      rootPath,
      path.join("notes", "archive", "already-archived.md"),
      `---\nid: already-archived\nschemaVersion: 1\ntitle: Already Archived\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\narchivedAt: 2026-05-21T11:00:00.000Z\n---\nAlready archived.\n`,
    )

    assert.throws(
      () =>
        archiveNote({
          override: rootPath,
          selector: "already-archived",
        }),
      /Note 'notes[\\/]archive[\\/]already-archived\.md' is already archived\./,
    )

    const repository = createNoteRepository(rootPath)
    const archived = repository.read(path.join(rootPath, "notes", "archive", "already-archived.md"))
    assert.equal(archived.frontmatter.archivedAt, "2026-05-21T11:00:00.000Z")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("archiveNote rejects notes whose frontmatter already has archivedAt", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-archive-note-"))

  try {
    await writeNote(
      rootPath,
      path.join("notes", "inbox", "archived-flag.md"),
      `---\nid: archived-flag\nschemaVersion: 1\ntitle: Archived Flag\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\narchivedAt: 2026-05-21T11:00:00.000Z\n---\nAlready archived in metadata.\n`,
    )

    assert.throws(
      () =>
        archiveNote({
          override: rootPath,
          selector: "archived-flag",
        }),
      /Note 'notes[\\/]inbox[\\/]archived-flag\.md' is already archived\./,
    )

    const repository = createNoteRepository(rootPath)
    const original = repository.read(path.join(rootPath, "notes", "inbox", "archived-flag.md"))
    assert.equal(original.frontmatter.archivedAt, "2026-05-21T11:00:00.000Z")
    await assert.rejects(() => access(path.join(rootPath, "notes", "archive", "archived-flag.md")))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("archiveNote fails when notes/archive already contains the same basename", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-archive-note-"))

  try {
    await writeNote(
      rootPath,
      path.join("notes", "inbox", "duplicate.md"),
      `---\nid: duplicate-source\nschemaVersion: 1\ntitle: Duplicate Source\nmode: plain\ntags: []\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nSource note.\n`,
    )
    await writeNote(
      rootPath,
      path.join("notes", "archive", "duplicate.md"),
      `---\nid: duplicate-archived\nschemaVersion: 1\ntitle: Existing Archived Note\nmode: plain\ntags: []\ncreatedAt: 2026-05-20T10:15:00.000Z\nupdatedAt: 2026-05-20T10:15:00.000Z\narchivedAt: 2026-05-20T11:00:00.000Z\n---\nArchived first.\n`,
    )

    assert.throws(
      () =>
        archiveNote({
          override: rootPath,
          selector: "duplicate-source",
        }),
      /Could not archive note 'notes[\\/]inbox[\\/]duplicate\.md'\./,
    )

    const repository = createNoteRepository(rootPath)
    const archivedExisting = repository.read(path.join(rootPath, "notes", "archive", "duplicate.md"))
    assert.equal(archivedExisting.frontmatter.id, "duplicate-archived")

    const original = repository.read(path.join(rootPath, "notes", "inbox", "duplicate.md"))
    assert.equal(original.frontmatter.id, "duplicate-source")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
