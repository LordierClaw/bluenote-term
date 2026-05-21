import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { access, mkdtemp, rm, writeFile } from "node:fs/promises"

import { IndexUnavailableError } from "../../../src/core/errors"
import { createSearchDocuments } from "../../../src/index/search-documents"
import { loadIndexStore, rebuildIndexStore } from "../../../src/index/index-store"
import { parseNoteFile } from "../../../src/storage/frontmatter"

const NOTE_ALPHA = parseNoteFile(
  `---\nid: note-alpha\nschemaVersion: 1\ntitle: Alpha Note\nmode: plain\ntags: [alpha]\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nAlpha body mentions project comet.\n`,
  path.join("notes", "inbox", "alpha.md"),
)

const NOTE_BETA = parseNoteFile(
  `---\nid: note-beta\nschemaVersion: 1\ntitle: Beta Note\nmode: plain\ntags: [beta]\ncreatedAt: 2026-05-21T11:15:00.000Z\nupdatedAt: 2026-05-21T11:15:00.000Z\n---\nBeta body mentions nebula plans.\n`,
  path.join("notes", "journal", "beta.md"),
)

test("rebuildIndexStore writes rebuildable derived artifacts under .bluenote", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-"))

  try {
    const result = await rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA, NOTE_BETA],
    })

    assert.equal(result.noteCount, 2)
    assert.equal(result.metadataDatabasePath, path.join(rootPath, ".bluenote", "metadata.sqlite"))
    assert.equal(result.searchIndexPath, path.join(rootPath, ".bluenote", "search-index.json"))

    await access(result.metadataDatabasePath)
    await access(result.searchIndexPath)

    const store = await loadIndexStore(rootPath)
    const summaries = store.listSummaries()
    const searchResults = store.search("nebula")

    assert.deepEqual(
      summaries.map((summary) => summary.id),
      ["note-alpha", "note-beta"],
    )
    assert.deepEqual(searchResults.map((result) => result.id), ["note-beta"])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("derived artifacts can be deleted and recreated from note files", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-rebuild-"))

  try {
    const initial = await rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA],
    })

    await rm(initial.metadataDatabasePath, { force: true })
    await rm(initial.searchIndexPath, { force: true })

    const recreated = await rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA],
    })

    await access(recreated.metadataDatabasePath)
    await access(recreated.searchIndexPath)

    const store = await loadIndexStore(rootPath)
    assert.deepEqual(store.search("project comet").map((result) => result.id), ["note-alpha"])
    assert.deepEqual(createSearchDocuments([NOTE_ALPHA]).map((document) => document.id), ["note-alpha"])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("loadIndexStore wraps corrupt metadata artifacts as IndexUnavailableError with rebuild hint", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-corrupt-metadata-"))

  try {
    const rebuilt = await rebuildIndexStore({
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
    assert.equal(caughtError.hint, "Run bn rebuild to recreate .bluenote artifacts from note files.")
    assert.notEqual(caughtError.cause, undefined)
    assert.equal(caughtError.cause instanceof IndexUnavailableError, false)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("loadIndexStore wraps corrupt search artifacts as IndexUnavailableError with rebuild hint", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-index-store-corrupt-search-"))

  try {
    const rebuilt = await rebuildIndexStore({
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
    assert.equal(caughtError.hint, "Run bn rebuild to recreate .bluenote artifacts from note files.")
    assert.notEqual(caughtError.cause, undefined)
    assert.equal(caughtError.cause instanceof IndexUnavailableError, false)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
