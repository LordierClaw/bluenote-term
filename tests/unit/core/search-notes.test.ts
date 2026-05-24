import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { IndexUnavailableError } from "../../../src/core/errors"
import { listNotes } from "../../../src/core/list-notes"
import { searchNotes } from "../../../src/core/search-notes"
import { rebuildIndexStore, type IndexedNoteRecord } from "../../../src/index/index-store"

const MATCH_NOTES: IndexedNoteRecord[] = [
  {
    key: "moonbeam-title",
    title: "Moonbeam Launch",
    description: "Status review",
    body: "Quiet body text.\n",
    relativePath: path.join("notes", "inbox", "moonbeam-title.md"),
    createdAt: "2026-05-21T10:15:00.000Z",
    updatedAt: "2026-05-21T10:15:00.000Z",
    archivedAt: null,
  },
  {
    key: "description-match",
    title: "Status Review",
    description: "Moonbeam rollout checklist",
    body: "General body text.\n",
    relativePath: path.join("notes", "inbox", "description-match.md"),
    createdAt: "2026-05-21T10:16:00.000Z",
    updatedAt: "2026-05-21T10:16:00.000Z",
    archivedAt: null,
  },
  {
    key: "content-match",
    title: "Incident Notes",
    description: "Body-only reference",
    body: "First line stays quiet.\nSecond line mentions moonbeam during deployment.\nThird line closes out.\n",
    relativePath: path.join("notes", "journal", "content-match.md"),
    createdAt: "2026-05-21T10:17:00.000Z",
    updatedAt: "2026-05-21T10:17:00.000Z",
    archivedAt: null,
  },
  {
    key: "moonbeam-utility",
    title: "Utility Note",
    description: "Helper index",
    body: "Plain helper text only.\n",
    relativePath: path.join("notes", "archive", "moonbeam-utility.md"),
    createdAt: "2026-05-21T10:18:00.000Z",
    updatedAt: "2026-05-21T10:18:00.000Z",
    archivedAt: null,
  },
]

test("searchNotes returns one grouped match per note with ranked source labels", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-search-notes-"))

  try {
    rebuildIndexStore({ rootPath, notes: MATCH_NOTES })

    const results = searchNotes("moonbeam", { override: rootPath })

    assert.deepEqual(results.map((result) => result.key), [
      "moonbeam-title",
      "description-match",
      "content-match",
      "moonbeam-utility",
    ])
    assert.deepEqual(results.map((result) => result.match.label), [
      "title",
      "description",
      "content line 2",
      "key/path",
    ])
    assert.equal(results[2]?.match.excerpt, "...Second line mentions moonbeam during deployment....")
    assert.equal(results[0]?.relativePath, path.join("notes", "inbox", "moonbeam-title.md"))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("listNotes prefers derived index summaries when available", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-list-notes-index-"))

  try {
    rebuildIndexStore({ rootPath, notes: [MATCH_NOTES[0]] })

    const summaries = listNotes({ override: rootPath })

    assert.deepEqual(summaries, [
      {
        key: "moonbeam-title",
        title: "Moonbeam Launch",
        description: "Status review",
        relativePath: path.join("notes", "inbox", "moonbeam-title.md"),
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
        assert.equal(error.hint, "Run bn rebuild to recreate .state artifacts from note files and sidecars.")
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
