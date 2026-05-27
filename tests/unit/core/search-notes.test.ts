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

test("searchNotes does not include fuzzy subsequence-only matches", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-search-notes-no-fuzzy-"))

  try {
    rebuildIndexStore({
      rootPath,
      notes: [
        {
          key: "a-big-cat",
          title: "A Big Cat",
          description: "Feline reference",
          body: "This line mentions a-big-cat but not the compact query.\n",
          relativePath: path.join("notes", "inbox", "a-big-cat.md"),
          createdAt: "2026-05-21T10:19:00.000Z",
          updatedAt: "2026-05-21T10:19:00.000Z",
          archivedAt: null,
        },
      ],
    })

    assert.deepEqual(searchNotes("abc", { override: rootPath }), [])
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("searchNotes includes title, path, and body matches that contain numeric query", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-search-notes-numeric-"))

  try {
    rebuildIndexStore({
      rootPath,
      notes: [
        {
          key: "receipt-title",
          title: "Receipt 123",
          description: "Purchase record",
          body: "No numeric content here.\n",
          relativePath: path.join("notes", "inbox", "receipt-title.md"),
          createdAt: "2026-05-21T10:19:00.000Z",
          updatedAt: "2026-05-21T10:19:00.000Z",
          archivedAt: null,
        },
        {
          key: "meeting-path",
          title: "Meeting Notes",
          description: "Planning notes",
          body: "No numeric content here.\n",
          relativePath: path.join("notes", "meetings", "meeting-123.md"),
          createdAt: "2026-05-21T10:20:00.000Z",
          updatedAt: "2026-05-21T10:20:00.000Z",
          archivedAt: null,
        },
        {
          key: "body-match",
          title: "Body Only",
          description: "Reference note",
          body: "First line stays quiet.\nTracking code 123 appears here.\n",
          relativePath: path.join("notes", "inbox", "body-match.md"),
          createdAt: "2026-05-21T10:21:00.000Z",
          updatedAt: "2026-05-21T10:21:00.000Z",
          archivedAt: null,
        },
      ],
    })

    const results = searchNotes("123", { override: rootPath })

    assert.deepEqual(results.map((result) => result.key), ["receipt-title", "body-match", "meeting-path"])
    assert.deepEqual(results.map((result) => result.match.label), ["title", "content line 2", "key/path"])
    assert.equal(results[1]?.match.excerpt, "...Tracking code 123 appears here....")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("searchNotes finds arbitrary substring contains matches that MiniSearch token search misses", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-search-notes-substring-"))

  try {
    rebuildIndexStore({
      rootPath,
      notes: [
        {
          key: "alpha-project",
          title: "Alpha Project",
          description: "Substring fixture",
          body: "Body contains foobar for substring search.\n",
          relativePath: path.join("notes", "inbox", "alpha-project.md"),
          createdAt: "2026-05-21T10:22:00.000Z",
          updatedAt: "2026-05-21T10:22:00.000Z",
          archivedAt: null,
        },
      ],
    })

    assert.deepEqual(searchNotes("pha", { override: rootPath }).map((result) => result.key), ["alpha-project"])
    const bodyResults = searchNotes("oba", { override: rootPath })
    assert.deepEqual(bodyResults.map((result) => result.key), ["alpha-project"])
    assert.equal(bodyResults[0]?.match.label, "content line 1")
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
        assert.equal(error.hint, "Run bn rebuild to recreate .data artifacts from note files and sidecars.")
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
