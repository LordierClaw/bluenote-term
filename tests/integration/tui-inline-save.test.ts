import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"

import { createManagedRootHarness } from "../helpers/cli"
import {
  createEditorSession,
  discardEditorSession,
  saveEditorSession,
} from "../../src/tui/adapters/editor-session"
import { insertText } from "../../src/tui/editor/editor-buffer"

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

test("inline editor save updates note metadata/indexes and can rename from the first markdown heading", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-inline-save-")
  const relativePath = path.join("notes", "inbox", "original-note.md")

  try {
    await writePlainNoteWithSidecar(harness.rootPath, {
      key: "original-note",
      title: "Original Title",
      description: "Original Title Body before rename.",
      relativePath,
      body: "# Original Title\n\nBody before rename.\n",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const saveResult = saveEditorSession(
      createEditorSession("original-note", "# Renamed Title\n\nBody after rename with nebula tokens.\n"),
      {
        override: harness.rootPath,
        randomSource: () => 10,
      },
    )

    assert.equal(saveResult.ok, true)

    if (!saveResult.ok) {
      throw new Error("expected save to succeed")
    }

    const newKey = saveResult.summary.key ?? ""
    assert.match(newKey, /^renamed-title-[a-z0-9]{6}$/)

    await assert.rejects(() => access(path.join(harness.rootPath, relativePath)))
    await assert.rejects(() => access(path.join(harness.rootPath, ".state", "notes", "original-note.json")))

    const newRelativePath = path.join("notes", "inbox", `${newKey}.md`)
    const savedBody = await readFile(path.join(harness.rootPath, newRelativePath), "utf8")
    assert.equal(savedBody, "# Renamed Title\n\nBody after rename with nebula tokens.\n")

    const sidecar = JSON.parse(await readFile(path.join(harness.rootPath, ".state", "notes", `${newKey}.json`), "utf8")) as {
      description: string
      relativePath: string
      title: string
      updatedAt: string
    }

    assert.equal(sidecar.title, "Renamed Title")
    assert.equal(sidecar.relativePath, newRelativePath)
    assert.equal(sidecar.description, "# Renamed Title … with nebula tokens.")
    assert.notEqual(sidecar.updatedAt, "2026-05-21T10:15:00.000Z")

    const showResult = harness.run(["show", newKey])
    assert.equal(showResult.exitCode, 0)
    assert.match(showResult.stdout, /Description: # Renamed Title … with nebula tokens\./)

    const searchResult = harness.run(["search", "nebula tokens"])
    assert.equal(searchResult.exitCode, 0)
    assert.match(searchResult.stdout, new RegExp(`key: ${harness.escapeForRegExp(newKey)}`))
  } finally {
    await harness.cleanup()
  }
})

test("inline editor discard restores the last persisted content after local edits", async () => {
  const session = createEditorSession("alpha-note", "Alpha")
  const dirtySession = {
    ...session,
    buffer: insertText(session.buffer, "!"),
  }

  const discarded = discardEditorSession(dirtySession)

  assert.equal(discarded.buffer.lines.join("\n"), "Alpha")
  assert.equal(discarded.buffer.dirty, false)
})
