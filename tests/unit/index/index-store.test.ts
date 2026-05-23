import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

// @ts-expect-error sql.js does not ship TypeScript declarations in this project.
import initSqlJs from "sql.js"

import { IndexUnavailableError } from "../../../src/core/errors"
import { createSearchDocuments } from "../../../src/index/search-documents"
import { loadIndexStore, rebuildIndexStore } from "../../../src/index/index-store"

const NOTE_ALPHA = {
  key: "note-alpha",
  title: "Alpha Note",
  description: "Alpha summary",
  body: "Alpha body mentions project comet.\n",
  relativePath: path.join("notes", "inbox", "note-alpha.md"),
  createdAt: "2026-05-21T10:15:00.000Z",
  updatedAt: "2026-05-21T10:15:00.000Z",
  archivedAt: null,
}

const NOTE_BETA = {
  key: "note-beta",
  title: "Beta Note",
  description: "Nebula planning note",
  body: "Beta body mentions launch windows.\n",
  relativePath: path.join("notes", "journal", "note-beta.md"),
  createdAt: "2026-05-21T11:15:00.000Z",
  updatedAt: "2026-05-21T11:15:00.000Z",
  archivedAt: null,
}

const NOTE_ARCHIVED = {
  key: "note-archived",
  title: "Archived Note",
  description: "Archived nebula summary",
  body: "Archived body mentions hidden comet trails.\n",
  relativePath: path.join("notes", "archive", "note-archived.md"),
  createdAt: "2026-05-21T12:15:00.000Z",
  updatedAt: "2026-05-21T12:15:00.000Z",
  archivedAt: "2026-05-22T09:30:00.000Z",
}

test("rebuildIndexStore writes rebuildable derived artifacts under .state and preserves sidecar metadata", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-"))

  try {
    const result = rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA, NOTE_BETA],
    })

    assert.equal(result.noteCount, 2)
    assert.equal(result.metadataDatabasePath, path.join(rootPath, ".state", "metadata.sqlite"))
    assert.equal(result.searchIndexPath, path.join(rootPath, ".state", "search-index.json"))

    await access(result.metadataDatabasePath)
    await access(result.searchIndexPath)

    const store = loadIndexStore(rootPath)
    const summaries = store.listSummaries()

    assert.deepEqual(summaries, [
      {
        key: "note-alpha",
        id: "note-alpha",
        title: "Alpha Note",
        description: "Alpha summary",
        relativePath: path.join("notes", "inbox", "note-alpha.md"),
        createdAt: "2026-05-21T10:15:00.000Z",
        updatedAt: "2026-05-21T10:15:00.000Z",
        archivedAt: null,
      },
      {
        key: "note-beta",
        id: "note-beta",
        title: "Beta Note",
        description: "Nebula planning note",
        relativePath: path.join("notes", "journal", "note-beta.md"),
        createdAt: "2026-05-21T11:15:00.000Z",
        updatedAt: "2026-05-21T11:15:00.000Z",
        archivedAt: null,
      },
    ])

    assert.deepEqual(store.search("comet").map((result) => result.key), ["note-alpha"])
    assert.deepEqual(store.search("Nebula planning").map((result) => result.key), ["note-beta"])
    assert.deepEqual(
      store.search("note-beta").map((result) => result.key).includes("note-beta"),
      true,
    )
    assert.deepEqual(
      store.search("journal/note-beta").map((result) => result.key).includes("note-beta"),
      true,
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("derived artifacts can be deleted and recreated from canonical note index records", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-rebuild-"))

  try {
    const initial = rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA],
    })

    await rm(initial.metadataDatabasePath, { force: true })
    await rm(initial.searchIndexPath, { force: true })

    const recreated = rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA],
    })

    await access(recreated.metadataDatabasePath)
    await access(recreated.searchIndexPath)

    const store = loadIndexStore(rootPath)
    assert.deepEqual(store.search("Alpha summary").map((result) => result.key), ["note-alpha"])
    assert.deepEqual(createSearchDocuments([NOTE_ALPHA]), [
      {
        id: "note-alpha",
        key: "note-alpha",
        title: "Alpha Note",
        description: "Alpha summary",
        body: "Alpha body mentions project comet.\n",
        relativePath: path.join("notes", "inbox", "note-alpha.md"),
      },
    ])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("loadIndexStore preserves archived metadata in derived artifacts without surfacing archived notes as active results", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-archived-"))
  const SQL = await initSqlJs()

  try {
    const rebuilt = rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA, NOTE_ARCHIVED],
    })

    const store = loadIndexStore(rootPath)
    assert.deepEqual(store.listSummaries().map((summary) => summary.key), ["note-alpha"])
    assert.deepEqual(store.search("hidden").map((result) => result.key), [])

    const metadataBytes = new Uint8Array(await readFile(rebuilt.metadataDatabasePath))
    const db = new SQL.Database(metadataBytes)

    try {
      const archivedRows = db.exec(`
        SELECT key, archivedAt
        FROM notes
        WHERE key = 'note-archived'
      `)

      assert.deepEqual(archivedRows[0]?.values ?? [], [["note-archived", NOTE_ARCHIVED.archivedAt]])
    } finally {
      db.close()
    }
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("loadIndexStore wraps corrupt metadata artifacts as IndexUnavailableError with rebuild hint", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-corrupt-metadata-"))

  try {
    const rebuilt = rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA],
    })

    await writeFile(rebuilt.metadataDatabasePath, "not-a-sqlite-database", "utf8")

    let caughtError: unknown
    try {
      loadIndexStore(rootPath)
      assert.fail("Expected loadIndexStore to throw for corrupt metadata artifacts")
    } catch (error) {
      caughtError = error
    }

    assert.ok(caughtError instanceof IndexUnavailableError)
    assert.equal(caughtError.message, "Derived indexes are unavailable.")
    assert.equal(caughtError.hint, "Run bn rebuild to recreate .state artifacts from note files and sidecars.")
    assert.notEqual(caughtError.cause, undefined)
    assert.equal(caughtError.cause instanceof IndexUnavailableError, false)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("loadIndexStore wraps corrupt search artifacts as IndexUnavailableError with rebuild hint", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-corrupt-search-"))

  try {
    const rebuilt = rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA],
    })

    await writeFile(rebuilt.searchIndexPath, "{not-valid-json", "utf8")

    let caughtError: unknown
    try {
      loadIndexStore(rootPath)
      assert.fail("Expected loadIndexStore to throw for corrupt search artifacts")
    } catch (error) {
      caughtError = error
    }

    assert.ok(caughtError instanceof IndexUnavailableError)
    assert.equal(caughtError.message, "Derived indexes are unavailable.")
    assert.equal(caughtError.hint, "Run bn rebuild to recreate .state artifacts from note files and sidecars.")
    assert.notEqual(caughtError.cause, undefined)
    assert.equal(caughtError.cause instanceof IndexUnavailableError, false)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
