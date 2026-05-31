import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"

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
  const sidecarPath = path.join(rootPath, ".data", "notes", `${key}.json`)

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

test("bn edit <selector> updates sidecar metadata and rebuilds derived state after a body edit", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-edit-")
  const relativePath = "notes/journal/edit-with-key.md"
  const sidecarPath = path.join(harness.rootPath, ".data", "notes", "edit-with-key.json")
  const updatedBody = "Updated sidecar body with zebra tokens.\n"

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

    const sidecar = JSON.parse(await readFile(sidecarPath, "utf8")) as {
      createdAt: string
      description: string
      key: string
      relativePath: string
      title: string
      updatedAt: string
    }

    assert.equal(sidecar.key, "edit-with-key")
    assert.equal(sidecar.title, "Editable Sidecar Note")
    assert.equal(sidecar.relativePath, relativePath)
    assert.equal(sidecar.description, "Updated sidecar body with zebra tokens.")
    assert.equal(sidecar.createdAt, "2026-05-21T10:15:00.000Z")
    assert.notEqual(sidecar.updatedAt, "2026-05-21T10:15:00.000Z")

    const showResult = harness.run(["show", "edit-with-key"])
    assert.equal(showResult.exitCode, 0)
    assert.equal(
      showResult.stdout,
      [
        "Title: Editable Sidecar Note",
        "Key: edit-with-key",
        `Path: ${relativePath.replaceAll(path.sep, "/")}`,
        "Description: Updated sidecar body with zebra tokens.",
        "",
        "Updated sidecar body with zebra tokens.",
        "",
      ].join("\n"),
    )

    const searchResult = harness.run(["search", "zebra tokens"])
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout, /Editable Sidecar Note\n\s+key: edit-with-key\n\s+path: notes[\\/]journal[\\/]edit-with-key\.md\n\s+match: description/)
  } finally {
    await harness.cleanup()
  }
}, 20_000)

test("bn edit renames the note key, file, and sidecar when the markdown heading title changes", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-edit-rename-")
  const relativePath = "notes/inbox/original-note.md"
  const updatedBody = "# Renamed Title\n\nBody after rename with nebula tokens.\n"

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "original-note",
      title: "Original Title",
      description: "Original Title Body before rename.",
      relativePath,
      body: "# Original Title\n\nBody before rename.\n",
    })
    const editorScriptPath = await harness.writeFakeEditorScript(updatedBody)

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)
    assert.equal(rebuildResult.stderr, "")

    const editResult = harness.run(["edit", "original-note"], { EDITOR: editorScriptPath })

    assert.equal(editResult.exitCode, 0)
    assert.equal(editResult.stderr, "")
    assert.match(editResult.stdout, /Edited note: notes[\\/]inbox[\\/]renamed-title-[a-z0-9]{6}\.md/)
    const renamedKeyMatch = editResult.stdout.match(/Renamed key: original-note -> (renamed-title-[a-z0-9]{6})/)
    assert.ok(renamedKeyMatch)

    const newKey = renamedKeyMatch[1]
    const newRelativePath = `notes/inbox/${newKey}.md`

    await assert.rejects(() => access(path.join(harness.rootPath, relativePath)))
    await assert.rejects(() => access(path.join(harness.rootPath, ".data", "notes", "original-note.json")))

    const renamedSidecarPath = path.join(harness.rootPath, ".data", "notes", `${newKey}.json`)
    const renamedSidecar = JSON.parse(await readFile(renamedSidecarPath, "utf8")) as {
      key: string
      relativePath: string
      title: string
    }

    assert.equal(renamedSidecar.key, newKey)
    assert.equal(renamedSidecar.title, "Renamed Title")
    assert.equal(renamedSidecar.relativePath, newRelativePath)

    const showResult = harness.run(["show", newKey])
    assert.equal(showResult.exitCode, 0)
    assert.match(
      showResult.stdout,
      new RegExp(
        `^Title: Renamed Title\\nKey: ${harness.escapeForRegExp(newKey)}\\nPath: ${harness.escapeForRegExp(newRelativePath.replaceAll(path.sep, "/"))}\\nDescription: # Renamed Title … with nebula tokens\\.\\n\\n# Renamed Title\\n\\nBody after rename with nebula tokens\\.\\n$`,
      ),
    )
  } finally {
    await harness.cleanup()
  }
})

test("bn edit fails when $EDITOR is unset even if the parent environment defines it", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-edit-missing-editor-")
  const originalEditor = process.env.EDITOR

  try {
    await harness.writeNote(
      "notes/inbox/present.md",
      noteMarkdown({ id: "present-note", title: "Present Note", body: "Visible body.\n" }),
    )

    process.env.EDITOR = "/bin/true"
    const result = harness.run(["edit", "present"], { EDITOR: undefined })

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

test("bn edit requires a selector argument in <key|path> form", async () => {
  const harness = await createManagedRootHarness("bluenote-cli-edit-usage-")

  try {
    const result = harness.run(["edit"])

    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /Missing required selector for edit\./)
    assert.match(result.stderr, /Hint: Run bn edit <key\|path>\./)
  } finally {
    await harness.cleanup()
  }
})
