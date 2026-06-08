import { test, spyOn } from "bun:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

import { createNoteRepository } from "../../src/storage/note-repository"
import { UsageError } from "../../src/core/errors"
import { sidecarJson } from "../helpers/note-fixtures"
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
    assert.equal(created.relativePath, "note/note-123.md")

    const markdown = await readFile(created.notePath, "utf8")
    assert.equal(markdown, "Hello from BlueNote.\n")
    assert.doesNotMatch(markdown, /^---/)

    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))

    assert.deepEqual(sidecar, {
      type: "normal",
      key: "note-123",
      title: "Example title",
      description: "Hello from BlueNote.",
      relativePath: "note/note-123.md",
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T10:15:00.000Z",
      archivedAt: null,
      namingVersion: 1,
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("creating a note succeeds from a fresh root without pre-created notes directories", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-fresh-root-"))

  try {
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Hello from a fresh root.\n",
    })

    assert.equal(created.notePath, getInboxNotePath(rootPath, "note-123"))
    assert.equal(await readFile(created.notePath, "utf8"), "Hello from a fresh root.\n")

    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    assert.equal(JSON.parse(await readFile(sidecarPath, "utf8")).relativePath, "note/note-123.md")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("creating a normal note rejects hidden note-folder destinations", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-hidden-destination-"))

  try {
    ensureManagedRoot(rootPath)
    await mkdir(path.join(rootPath, "note", ".hidden"), { recursive: true })
    const repository = createNoteRepository(rootPath)

    assert.throws(
      () =>
        repository.create({
          frontmatter: FIXED_FRONTMATTER,
          body: "Hidden body.\n",
          destination: { type: "normal", folderRelativePath: "note/.hidden" },
        }),
      (error: unknown) => {
        assert.ok(error instanceof UsageError)
        assert.match(error.message, /Could not create note 'note\/\.hidden\/note-123\.md'/)
        return true
      },
    )

    await assert.rejects(() => access(path.join(rootPath, "note", ".hidden", "note-123.md")))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("syncEditedNote updates the plain markdown body and aligned sidecar metadata", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-sync-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Original body.\n",
    })

    const synced = repository.syncEditedNote(created.notePath, {
      title: "Updated title",
      body: "Updated body.\nSecond line.\n",
      updatedAt: "2026-05-21T12:30:00.000Z",
    })

    assert.deepEqual(synced, created)

    const markdown = await readFile(created.notePath, "utf8")
    assert.equal(markdown, "Updated body.\nSecond line.\n")
    assert.doesNotMatch(markdown, /^---/)

    const sidecar = JSON.parse(await readFile(path.join(getStateNotesPath(rootPath), "note-123.json"), "utf8"))
    assert.deepEqual(sidecar, {
      type: "normal",
      key: "note-123",
      title: "Updated title",
      description: "Updated body. Second line.",
      relativePath: "note/note-123.md",
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T12:30:00.000Z",
      archivedAt: null,
      namingVersion: 1,
    })

    const loaded = repository.read(created.notePath)
    assert.equal(loaded.body, "Updated body.\nSecond line.\n")
    assert.equal(loaded.frontmatter.title, "Updated title")
    assert.equal(loaded.frontmatter.updatedAt, "2026-05-21T12:30:00.000Z")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("rename refreshes derived description while preserving AI freshness metadata", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-rename-metadata-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Original body.\n",
    })
    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    const existingSidecar = JSON.parse(await readFile(sidecarPath, "utf8"))
    await writeFile(
      sidecarPath,
      JSON.stringify({
        ...existingSidecar,
        description: "Custom AI summary.",
        ai: {
          description: {
            lastProcessedAt: "2026-05-21T11:00:00.000Z",
          },
        },
      }, null, 2) + "\n",
      "utf8",
    )

    const renamed = repository.rename(created.notePath, {
      nextKey: "renamed-note",
      title: "Renamed Note",
      body: "Renamed body should replace stale summary.\n",
      updatedAt: "2026-05-21T12:30:00.000Z",
    })

    assert.equal(renamed.relativePath, "note/renamed-note.md")
    await assert.rejects(() => access(sidecarPath), { code: "ENOENT" })

    const renamedSidecar = JSON.parse(await readFile(path.join(getStateNotesPath(rootPath), "renamed-note.json"), "utf8"))
    assert.equal(renamedSidecar.title, "Renamed Note")
    assert.equal(renamedSidecar.description, "Renamed body should replace stale summary.")
    assert.deepEqual(renamedSidecar.ai, {
      description: {
        lastProcessedAt: "2026-05-21T11:00:00.000Z",
      },
    })
    assert.equal(renamedSidecar.relativePath, "note/renamed-note.md")
    assert.equal(renamedSidecar.createdAt, "2026-05-21T10:15:00.000Z")
    assert.equal(renamedSidecar.updatedAt, "2026-05-21T12:30:00.000Z")
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
      sidecarJson({
        key: "manual-note",
        title: "Manual Note",
        description: "Manual body line.",
        relativePath: "note/manual-note.md",
        updatedAt: "2026-05-21T11:15:00.000Z",
      }),
      "utf8",
    )

    const loaded = repository.read(notePath)
    assert.equal(loaded.body, "Manual body line.\nSecond line.\n")
    assert.equal(loaded.sourcePath, "note/manual-note.md")
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
    const inboxDuplicatePath = path.join(rootPath, "note", "shared-note.md")
    const journalDuplicatePath = path.join(rootPath, "note", "journal", "project-a", "shared-note.md")

    await writeFile(inboxDuplicatePath, "Inbox copy.\n", "utf8")
    await mkdir(path.dirname(journalDuplicatePath), { recursive: true })
    await writeFile(journalDuplicatePath, "Journal copy.\n", "utf8")

    assert.throws(
      () => repository.listNotePaths(),
      /duplicate note key 'shared-note'.*note[\\/]journal[\\/]project-a[\\/]shared-note\.md.*note[\\/]shared-note\.md/i,
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("create rejects an existing note key without mutating the existing note", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const notePath = getInboxNotePath(rootPath, FIXED_FRONTMATTER.id)
    const sidecarPath = path.join(getStateNotesPath(rootPath), `${FIXED_FRONTMATTER.id}.json`)

    await writeFile(notePath, "Existing body.\n", "utf8")
    await writeFile(
      sidecarPath,
      JSON.stringify({
        type: "normal",
        key: FIXED_FRONTMATTER.id,
        title: "Existing title",
        description: "Existing body.",
        relativePath: "note/note-123.md",
        createdAt: FIXED_FRONTMATTER.createdAt,
        updatedAt: FIXED_FRONTMATTER.updatedAt,
        archivedAt: null,
        namingVersion: 1,
      }) + "\n",
      "utf8",
    )

    assert.throws(
      () =>
        repository.create({
          frontmatter: FIXED_FRONTMATTER,
          body: "Replacement body.\n",
        }),
      /Could not create note 'note[\\/]note-123\.md'\./,
    )

    assert.equal(await readFile(notePath, "utf8"), "Existing body.\n")
    assert.equal(JSON.parse(await readFile(sidecarPath, "utf8")).title, "Existing title")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("create rejects unknown frontmatter fields instead of silently dropping them", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)

    assert.throws(
      () =>
        repository.create({
          frontmatter: {
            ...FIXED_FRONTMATTER,
            extraField: "should fail",
          } as unknown as (typeof FIXED_FRONTMATTER & { extraField: string }),
          body: "Hello from BlueNote.\n",
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true)
        assert.match((error as Error).message, /unknown field 'extraField'/i)
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("create rejects archivedAt on create input", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)

    assert.throws(
      () =>
        repository.create({
          frontmatter: {
            ...FIXED_FRONTMATTER,
            archivedAt: "2026-05-21T12:30:00.000Z",
          },
          body: "Hello from BlueNote.\n",
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true)
        assert.match((error as Error).message, /archivedAt/i)
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})


test("list and listNotePaths return empty results on a fresh root", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-fresh-root-"))

  try {
    const repository = createNoteRepository(rootPath)

    assert.deepEqual(repository.listNotePaths(), [])
    assert.deepEqual(repository.list(), [])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("create rejects duplicate basenames that already exist elsewhere in notes tree", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const existingNotePath = path.join(rootPath, "note", "journal", "project-a", `${FIXED_FRONTMATTER.id}.md`)

    await mkdir(path.dirname(existingNotePath), { recursive: true })
    await writeFile(existingNotePath, "Existing elsewhere.\n", "utf8")

    assert.throws(
      () =>
        repository.create({
          frontmatter: FIXED_FRONTMATTER,
          body: "Hello from BlueNote.\n",
        }),
      (error: unknown) => {
        assert.equal(error instanceof Error, true)
        assert.match((error as Error).message, /Could not create note 'note[\\/]note-123\.md'\./)
        assert.match(String((error as Error & { hint?: string }).hint), /same basename\/key already exists somewhere under note\//i)
        return true
      },
    )

    await assert.rejects(() => access(getInboxNotePath(rootPath, FIXED_FRONTMATTER.id)))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("archive migrates a legacy frontmatter note without an existing sidecar", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const legacyNotePath = getInboxNotePath(rootPath, "legacy-note")

    await writeFile(
      legacyNotePath,
      [
        "---",
        "id: legacy-note",
        "schemaVersion: 1",
        "title: Legacy Note",
        "mode: plain",
        "tags: []",
        "createdAt: 2026-05-21T10:15:00.000Z",
        "updatedAt: 2026-05-21T10:15:00.000Z",
        "---",
        "Legacy body.",
        "",
      ].join("\n"),
      "utf8",
    )

    const archived = repository.archive(legacyNotePath, "2026-05-21T12:30:00.000Z")

    assert.equal(archived.notePath, getArchiveNotePath(rootPath, "legacy-note"))
    assert.equal(archived.relativePath, ".data/archive/legacy-note.md")
    await assert.rejects(() => access(legacyNotePath))

    const archivedMarkdown = await readFile(archived.notePath, "utf8")
    assert.equal(archivedMarkdown, "Legacy body.\n")

    const sidecar = JSON.parse(await readFile(path.join(getStateNotesPath(rootPath), "legacy-note.json"), "utf8"))
    assert.deepEqual(sidecar, {
      type: "archived",
      key: "legacy-note",
      title: "Legacy Note",
      description: "Legacy body.",
      relativePath: ".data/archive/legacy-note.md",
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T12:30:00.000Z",
      archivedAt: "2026-05-21T12:30:00.000Z",
      namingVersion: 1,
    })

    const loaded = repository.read(archived.notePath)
    assert.deepEqual(loaded.frontmatter, {
      id: "legacy-note",
      schemaVersion: 1,
      title: "Legacy Note",
      mode: "plain",
      tags: [],
      createdAt: "2026-05-21T10:15:00.000Z",
      updatedAt: "2026-05-21T12:30:00.000Z",
      archivedAt: "2026-05-21T12:30:00.000Z",
    })
    assert.equal(loaded.body, "Legacy body.\n")
    assert.equal(loaded.sourcePath, ".data/archive/legacy-note.md")
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
    assert.equal(archived.relativePath, ".data/archive/note-123.md")
    await assert.rejects(() => access(created.notePath))

    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))

    assert.equal(sidecar.key, "note-123")
    assert.equal(sidecar.relativePath, ".data/archive/note-123.md")
    assert.equal(sidecar.archivedAt, "2026-05-21T12:30:00.000Z")

    const loaded = repository.read(archived.notePath)
    assert.equal(loaded.frontmatter.id, "note-123")
    assert.equal(loaded.frontmatter.archivedAt, "2026-05-21T12:30:00.000Z")
    assert.equal(loaded.sourcePath, ".data/archive/note-123.md")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("archive keeps sidecar metadata on the source note when source removal fails", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-note-repository-integration-"))

  try {
    ensureManagedRoot(rootPath)
    const repository = createNoteRepository(rootPath)
    const created = repository.create({
      frontmatter: FIXED_FRONTMATTER,
      body: "Archive me.\n",
    })
    const sidecarPath = path.join(getStateNotesPath(rootPath), "note-123.json")
    const originalRmSync = fs.rmSync
    const sourceRemovalFailure = new Error("simulated source removal failure")

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
          assert.match((error as Error).message, /Could not archive note 'note[\\/]note-123\.md'\./)
          assert.equal((error as Error).cause, sourceRemovalFailure)
          return true
        },
      )
    } finally {
      rmMock.mockRestore()
    }

    await access(created.notePath)
    await assert.rejects(() => access(getArchiveNotePath(rootPath, "note-123")))

    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"))
    assert.equal(sidecar.relativePath, "note/note-123.md")
    assert.equal(sidecar.archivedAt, null)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
