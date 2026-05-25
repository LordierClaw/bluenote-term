import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"

import * as listNotesModule from "../../../src/core/list-notes"
import { RootNotInitializedError } from "../../../src/core/errors"
import { loadNoteList } from "../../../src/tui/data/note-list-adapter"

test("list adapter returns note summaries suitable for sidebar rendering using the core list service", () => {
  const listNotesSpy = spyOn(listNotesModule, "listNotes").mockReturnValue([
    {
      key: "legacy-alpha-id",
      title: "Alpha Note",
      description: "Alpha summary",
      relativePath: "notes/inbox/alpha-note.md",
    },
    {
      key: "legacy-beta-id",
      title: "Beta Note",
      description: "Beta summary",
      relativePath: "notes/journal/beta-note.md",
    },
  ])

  try {
    const result = loadNoteList({ override: "/tmp/bluenote-root", env: {}, cwd: "/" })

    assert.equal(result.ok, true)
    if (!result.ok) {
      throw new Error("expected note list result to be ok")
    }

    assert.equal(listNotesSpy.mock.calls.length, 1)
    assert.deepEqual(listNotesSpy.mock.calls[0]?.[0], {
      override: "/tmp/bluenote-root",
      env: {},
      cwd: "/",
    })
    assert.deepEqual(result.notes, [
      {
        key: "legacy-alpha-id",
        selector: "notes/inbox/alpha-note.md",
        title: "Alpha Note",
        description: "Alpha summary",
        relativePath: "notes/inbox/alpha-note.md",
      },
      {
        key: "legacy-beta-id",
        selector: "notes/journal/beta-note.md",
        title: "Beta Note",
        description: "Beta summary",
        relativePath: "notes/journal/beta-note.md",
      },
    ])
  } finally {
    listNotesSpy.mockRestore()
  }
})

test("list adapter surfaces missing-root errors in a predictable tui-friendly shape", () => {
  const listNotesSpy = spyOn(listNotesModule, "listNotes").mockImplementation(() => {
    throw new RootNotInitializedError("BlueNote root is not initialized.", {
      hint: "Run 'bn init' first.",
    })
  })

  try {
    const result = loadNoteList({ override: "/tmp/missing-root", env: {}, cwd: "/" })

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "ROOT_NOT_INITIALIZED",
        message: "BlueNote root is not initialized.",
        hint: "Run 'bn init' first.",
      },
    })
    assert.equal(listNotesSpy.mock.calls.length, 1)
  } finally {
    listNotesSpy.mockRestore()
  }
})
