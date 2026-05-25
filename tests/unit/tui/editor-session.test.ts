import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"

import * as editNoteModule from "../../../src/core/edit-note"
import { UsageError } from "../../../src/core/errors"
import {
  createEditorSession,
  discardEditorSession,
  saveEditorSession,
} from "../../../src/tui/adapters/editor-session"
import { insertText } from "../../../src/tui/editor/editor-buffer"

test("saving an edited buffer persists through the shared core edit flow and reloads the clean buffer", () => {
  const saveSpy = spyOn(editNoteModule, "persistEditedNote").mockReturnValue({
    rootPath: "/tmp/bluenote-root",
    notePath: "/tmp/bluenote-root/notes/inbox/alpha-note.md",
    relativePath: "notes/inbox/alpha-note.md",
    previousKey: "alpha-note",
    key: "alpha-note",
  })

  try {
    const session = {
      ...createEditorSession("alpha-note", "Alpha"),
      buffer: insertText(createEditorSession("alpha-note", "Alpha").buffer, "!"),
    }

    const result = saveEditorSession(session, { override: "/tmp/bluenote-root" })

    assert.equal(result.ok, true)

    if (!result.ok) {
      throw new Error("expected save to succeed")
    }

    assert.deepEqual(saveSpy.mock.calls[0]?.[0], {
      override: "/tmp/bluenote-root",
      selector: "alpha-note",
      body: "!Alpha",
    })
    assert.equal(result.session.persistedBody, "!Alpha")
    assert.equal(result.session.buffer.dirty, false)
    assert.equal(result.session.saveError, null)
  } finally {
    saveSpy.mockRestore()
  }
})

test("discard resets the dirty buffer back to the last loaded persisted content", () => {
  const dirtySession = {
    ...createEditorSession("alpha-note", "Alpha"),
    buffer: insertText(createEditorSession("alpha-note", "Alpha").buffer, "!"),
  }

  const discarded = discardEditorSession(dirtySession)

  assert.equal(discarded.persistedBody, "Alpha")
  assert.equal(discarded.buffer.dirty, false)
  assert.equal(discarded.buffer.lines.join("\n"), "Alpha")
  assert.equal(discarded.saveError, null)
})

test("failed saves keep the dirty buffer and surface a structured error state", () => {
  const saveSpy = spyOn(editNoteModule, "persistEditedNote").mockImplementation(() => {
    throw new UsageError("Could not update note 'notes/inbox/alpha-note.md'.", {
      hint: "Ensure the note and its sidecar are writable inside BLUENOTE_ROOT.",
    })
  })

  try {
    const session = {
      ...createEditorSession("alpha-note", "Alpha"),
      buffer: insertText(createEditorSession("alpha-note", "Alpha").buffer, "!"),
    }

    const result = saveEditorSession(session, { override: "/tmp/bluenote-root" })

    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "USAGE_ERROR",
        message: "Could not update note 'notes/inbox/alpha-note.md'.",
        hint: "Ensure the note and its sidecar are writable inside BLUENOTE_ROOT.",
      },
      session: {
        ...session,
        saveError: {
          code: "USAGE_ERROR",
          message: "Could not update note 'notes/inbox/alpha-note.md'.",
          hint: "Ensure the note and its sidecar are writable inside BLUENOTE_ROOT.",
        },
      },
    })
  } finally {
    saveSpy.mockRestore()
  }
})
