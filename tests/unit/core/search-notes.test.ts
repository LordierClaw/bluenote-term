import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { IndexUnavailableError } from "../../../src/core/errors"
import { listNotes } from "../../../src/core/list-notes"
import { searchNotes } from "../../../src/core/search-notes"
import { rebuildIndexStore } from "../../../src/index/index-store"
import { parseNoteFile } from "../../../src/storage/frontmatter"

const NOTE_ALPHA = parseNoteFile(
  `---\nid: note-alpha\nschemaVersion: 1\ntitle: Alpha Note\nmode: plain\ntags: [alpha]\ncreatedAt: 2026-05-21T10:15:00.000Z\nupdatedAt: 2026-05-21T10:15:00.000Z\n---\nAlpha body mentions project comet.\n`,
  path.join("notes", "inbox", "alpha.md"),
)

const NOTE_BETA = parseNoteFile(
  `---\nid: note-beta\nschemaVersion: 1\ntitle: Beta Nebula Note\nmode: plain\ntags: [beta]\ncreatedAt: 2026-05-21T11:15:00.000Z\nupdatedAt: 2026-05-21T11:15:00.000Z\n---\nBeta body mentions nebula launch plans.\n`,
  path.join("notes", "journal", "beta.md"),
)

test("searchNotes returns ranked matches with title and path snippets from derived indexes", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-search-notes-"))

  try {
    rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA, NOTE_BETA],
    })

    const results = searchNotes("nebula", { override: rootPath })

    assert.deepEqual(results.map((result) => result.id), ["note-beta"])
    assert.equal(results[0]?.title, "Beta Nebula Note")
    assert.match(results[0]?.titleSnippet ?? "", /Beta Nebula Note/)
    assert.match(results[0]?.pathSnippet ?? "", /notes[\\/]journal[\\/]beta\.md/)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("listNotes prefers derived index summaries when available", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-list-notes-index-"))

  try {
    rebuildIndexStore({
      rootPath,
      notes: [NOTE_ALPHA],
    })

    const summaries = listNotes({ override: rootPath })

    assert.deepEqual(summaries, [
      {
        id: "note-alpha",
        title: "Alpha Note",
        relativePath: path.join("notes", "inbox", "alpha.md"),
      },
    ])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("searchNotes returns actionable rebuild guidance when derived indexes are missing", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-search-notes-missing-index-"))

  try {
    assert.throws(
      () => searchNotes("comet", { override: rootPath }),
      (error) => {
        assert.ok(error instanceof IndexUnavailableError)
        assert.equal(error.message, "Derived indexes are unavailable.")
        assert.equal(error.hint, "Run bn rebuild to recreate .bluenote artifacts from note files.")
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
