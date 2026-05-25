import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"

import * as showNoteModule from "../../../src/core/show-note"
import { SelectorNotFoundError } from "../../../src/core/errors"
import { loadNoteDetail } from "../../../src/tui/data/note-detail-adapter"

test("detail adapter loads a selected note suitable for main-pane rendering using the core show service", () => {
  const showNoteSpy = spyOn(showNoteModule, "showNote").mockReturnValue({
    key: "legacy-detail-id",
    title: "Detail Note",
    description: "Detail summary",
    relativePath: "notes/inbox/detail-note.md",
    body: "Detail body.\nSecond line.\n",
  })

  try {
    const result = loadNoteDetail({
      selector: "notes/inbox/detail-note.md",
      override: "/tmp/bluenote-root",
      env: {},
      cwd: "/",
    })

    assert.equal(result.ok, true)
    if (!result.ok) {
      throw new Error("expected note detail result to be ok")
    }

    assert.equal(showNoteSpy.mock.calls.length, 1)
    assert.deepEqual(showNoteSpy.mock.calls[0]?.[0], {
      selector: "notes/inbox/detail-note.md",
      override: "/tmp/bluenote-root",
      env: {},
      cwd: "/",
    })
    assert.deepEqual(result.note, {
      key: "legacy-detail-id",
      selector: "notes/inbox/detail-note.md",
      title: "Detail Note",
      description: "Detail summary",
      relativePath: "notes/inbox/detail-note.md",
      body: "Detail body.\nSecond line.\n",
    })
  } finally {
    showNoteSpy.mockRestore()
  }
})

test("detail adapter returns a tui-friendly error when no selector is available", () => {
  const showNoteSpy = spyOn(showNoteModule, "showNote")

  try {
    const result = loadNoteDetail({ selector: "   ", override: "/tmp/root", env: {}, cwd: "/" })

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "USAGE_ERROR",
        message: "No note is currently selected.",
        hint: "Select a note from the sidebar before opening it.",
      },
    })
    assert.equal(showNoteSpy.mock.calls.length, 0)
  } finally {
    showNoteSpy.mockRestore()
  }
})

test("detail adapter surfaces missing-note errors in a predictable tui-friendly shape", () => {
  const showNoteSpy = spyOn(showNoteModule, "showNote").mockImplementation(() => {
    throw new SelectorNotFoundError("Could not find a note matching selector 'missing-note'.", {
      hint: "Use bn list to inspect available notes.",
    })
  })

  try {
    const result = loadNoteDetail({ selector: "missing-note", override: "/tmp/root", env: {}, cwd: "/" })

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "SELECTOR_NOT_FOUND",
        message: "Could not find a note matching selector 'missing-note'.",
        hint: "Use bn list to inspect available notes.",
      },
    })
    assert.equal(showNoteSpy.mock.calls.length, 1)
  } finally {
    showNoteSpy.mockRestore()
  }
})
