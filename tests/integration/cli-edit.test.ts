import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import { noteMarkdown } from "../helpers/note-fixtures"

async function writePlainNoteWithSidecar(
  rootPath: string,
  {
    key,
    title,
    description,
    relativePath,
    body,
  }: {
    key: string
    title: string
    description: string
    relativePath: string
    body: string
  },
) {
  const notePath = path.join(rootPath, relativePath)
  const sidecarPath = path.join(rootPath, ".state", "notes", `${key}.json`)

  await mkdir(path.dirname(notePath), { recursive: true })
  await mkdir(path.dirname(sidecarPath), { recursive: true })
  await writeFile(notePath, body, "utf8")
  await writeFile(
    sidecarPath,
    JSON.stringify(
      {
        key,
        title,
        description,
        relativePath,
        createdAt: "2026-05-21T10:15:00.000Z",
        updatedAt: "2026-05-21T10:15:00.000Z",
        archivedAt: null,
        namingVersion: 1,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  )
}

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
    assert.equal(
      showResult.stdout,
      [
        "Title: Edited Note",
        "Key: edit-note",
        `Path: ${relativePath.replaceAll(path.sep, "/")}`,
        "Description: Updated body with zebra tokens.",
        "",
        "Updated body with zebra tokens.",
        "",
      ].join("\n"),
    )

    const searchResult = harness.run(["search", "zebra tokens"])
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout, /edit-note\s+Edited Note\s+notes[\\/]inbox[\\/]edit-note\.md/)
  } finally {
    await harness.cleanup()
  }
})

test("bn edit resolves a sidecar-backed note by key", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-edit-key-")
  const relativePath = path.join("notes", "journal", "edit-with-key.md")
  const updatedBody = "Updated sidecar body.\n"

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "edit-with-key",
      title: "Editable Sidecar Note",
      description: "Original sidecar body.",
      relativePath,
      body: "Original sidecar body.\n",
    })
    const editorScriptPath = await harness.writeFakeEditorScript(updatedBody)

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)
    assert.equal(rebuildResult.stderr, "")

    const editResult = harness.run(["edit", "edit-with-key"], { EDITOR: editorScriptPath })

    assert.equal(editResult.exitCode, 0)
    assert.equal(editResult.stderr, "")
    assert.match(editResult.stdout, /Edited note: notes[\\/]journal[\\/]edit-with-key\.md/)

    const showResult = harness.run(["show", "edit-with-key"])
    assert.equal(showResult.exitCode, 0)
    assert.match(showResult.stdout, /^Title: Editable Sidecar Note\nKey: edit-with-key\nPath: notes[\\/]journal[\\/]edit-with-key\.md\nDescription: Original sidecar body\.\n\nUpdated sidecar body\.\n$/)
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
