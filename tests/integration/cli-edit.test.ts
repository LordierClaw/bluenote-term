import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"

test("bn edit <selector> launches the editor for the resolved note and rebuilds derived state", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-edit-")
  const relativePath = path.join("notes", "inbox", "edit-note.md")
  const initialMarkdown = noteMarkdown({ id: "edit-note", title: "Editable Note", body: "Original body.\n" })
  const updatedMarkdown = noteMarkdown({
    id: "edit-note",
    title: "Edited Note",
    body: "Updated body with zebra tokens.\n",
    updatedAt: "2026-05-21T11:45:00.000Z",
  })

  try {
    await harness.writeNote(relativePath, initialMarkdown)
    const editorScriptPath = await harness.writeFakeEditorScript(updatedMarkdown)

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)
    assert.equal(rebuildResult.stderr, "")

    const editResult = harness.run(["edit", "edit-note"], { EDITOR: editorScriptPath })

    assert.equal(editResult.exitCode, 0)
    assert.equal(editResult.stderr, "")
    assert.match(editResult.stdout, /Edited note: notes[\\/]inbox[\\/]edit-note\.md/)

    const showResult = harness.run(["show", "edit-note"])
    assert.equal(showResult.exitCode, 0)
    assert.equal(showResult.stdout, updatedMarkdown)

    const searchResult = harness.run(["search", "zebra tokens"])
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout, /edit-note\s+Edited Note\s+notes[\\/]inbox[\\/]edit-note\.md/)
  } finally {
    await harness.cleanup()
  }
})

test("bn edit fails when $EDITOR is unset even if the parent environment defines it", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-edit-missing-editor-")
  const originalEditor = process.env.EDITOR

  try {
    await harness.writeNote(
      path.join("notes", "inbox", "present.md"),
      noteMarkdown({ id: "present-note", title: "Present Note", body: "Visible body.\n" }),
    )

    process.env.EDITOR = "/bin/true"
    const result = harness.run(["edit", "present-note"], { EDITOR: undefined })

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /EDITOR is not set/)
  } finally {
    if (originalEditor === undefined) {
      delete process.env.EDITOR
    } else {
      process.env.EDITOR = originalEditor
    }
    await harness.cleanup()
  }
})
