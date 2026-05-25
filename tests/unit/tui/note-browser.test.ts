import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"

import * as noteDetailAdapterModule from "../../../src/tui/data/note-detail-adapter"
import * as noteListAdapterModule from "../../../src/tui/data/note-list-adapter"
import { loadInitialNoteBrowserState } from "../../../src/tui/adapters/note-browser"

test("note browser loads sidebar notes and eagerly selects the first note detail", () => {
  const listSpy = spyOn(noteListAdapterModule, "loadNoteList").mockReturnValue({
    ok: true,
    notes: [
      {
        key: "alpha-key",
        selector: "notes/inbox/alpha-note.md",
        title: "Alpha Note",
        description: "Alpha summary",
        relativePath: "notes/inbox/alpha-note.md",
      },
      {
        key: "beta-key",
        selector: "notes/inbox/beta-note.md",
        title: "Beta Note",
        description: "Beta summary",
        relativePath: "notes/inbox/beta-note.md",
      },
    ],
  })
  const detailSpy = spyOn(noteDetailAdapterModule, "loadNoteDetail").mockReturnValue({
    ok: true,
    note: {
      key: "alpha-key",
      selector: "notes/inbox/alpha-note.md",
      title: "Alpha Note",
      description: "Alpha summary",
      relativePath: "notes/inbox/alpha-note.md",
      body: "Alpha body.\n",
    },
  })

  try {
    const result = loadInitialNoteBrowserState({ override: "/tmp/bluenote-root", env: {}, cwd: "/" })

    assert.equal(result.status, "ready")
    assert.deepEqual(result.notes.map((note) => note.selector), [
      "notes/inbox/alpha-note.md",
      "notes/inbox/beta-note.md",
    ])
    assert.equal(result.selectedNote?.selector, "notes/inbox/alpha-note.md")
    assert.equal(detailSpy.mock.calls.length, 1)
    assert.deepEqual(detailSpy.mock.calls[0]?.[0], {
      selector: "notes/inbox/alpha-note.md",
      override: "/tmp/bluenote-root",
      env: {},
      cwd: "/",
    })
  } finally {
    listSpy.mockRestore()
    detailSpy.mockRestore()
  }
})

test("note browser returns a structured empty state when the root is missing", () => {
  const listSpy = spyOn(noteListAdapterModule, "loadNoteList").mockReturnValue({
    ok: false,
    error: {
      code: "ROOT_NOT_INITIALIZED",
      message: "BlueNote root is not initialized.",
      hint: "Run 'bn init' first.",
    },
  })
  const detailSpy = spyOn(noteDetailAdapterModule, "loadNoteDetail")

  try {
    const result = loadInitialNoteBrowserState({ override: "/tmp/missing-root", env: {}, cwd: "/" })

    assert.deepEqual(result, {
      status: "empty",
      notes: [],
      selectedNote: null,
      emptyState: {
        code: "ROOT_NOT_INITIALIZED",
        message: "BlueNote root is not initialized.",
        hint: "Run 'bn init' first.",
      },
    })
    assert.equal(detailSpy.mock.calls.length, 0)
  } finally {
    listSpy.mockRestore()
    detailSpy.mockRestore()
  }
})
