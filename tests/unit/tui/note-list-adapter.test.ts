import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

import * as listNotesModule from "../../../src/core/list-notes"
import { RootNotInitializedError } from "../../../src/core/errors"
import { loadNoteList } from "../../../src/tui/data/note-list-adapter"
import { createManagedRootHarness } from "../../helpers/cli"
import { sidecarJson } from "../../helpers/note-fixtures"

async function writeIndexedNote(
  rootPath: string,
  note: {
    key: string
    title: string
    description: string
    relativePath: string
    body: string
  },
) {
  const notePath = path.join(rootPath, note.relativePath)
  const sidecarPath = path.join(rootPath, ".state", "notes", `${note.key}.json`)

  await mkdir(path.dirname(notePath), { recursive: true })
  await mkdir(path.dirname(sidecarPath), { recursive: true })
  await writeFile(notePath, note.body, "utf8")
  await writeFile(
    sidecarPath,
    sidecarJson({
      key: note.key,
      title: note.title,
      description: note.description,
      relativePath: note.relativePath,
    }),
    "utf8",
  )
}

test("list adapter returns note summaries suitable for sidebar rendering using the core list service", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-note-list-")

  try {
    const initResult = harness.run(["init"])
    assert.equal(initResult.exitCode, 0)

    await writeIndexedNote(harness.rootPath, {
      key: "alpha-note",
      title: "Alpha Note",
      description: "Alpha summary",
      relativePath: path.join("notes", "inbox", "alpha-note.md"),
      body: "Alpha body.\n",
    })
    await writeIndexedNote(harness.rootPath, {
      key: "beta-note",
      title: "Beta Note",
      description: "Beta summary",
      relativePath: path.join("notes", "journal", "beta-note.md"),
      body: "Beta body.\n",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const listNotesSpy = spyOn(listNotesModule, "listNotes")

    try {
      const result = loadNoteList({ override: harness.rootPath, env: {}, cwd: "/" })

      assert.equal(result.ok, true)
      if (!result.ok) {
        throw new Error("expected note list result to be ok")
      }

      assert.equal(listNotesSpy.mock.calls.length, 1)
      assert.deepEqual(listNotesSpy.mock.calls[0]?.[0], {
        override: harness.rootPath,
        env: {},
        cwd: "/",
      })
      assert.deepEqual(result.notes, [
        {
          key: "alpha-note",
          selector: "alpha-note",
          title: "Alpha Note",
          description: "Alpha summary",
          relativePath: "notes/inbox/alpha-note.md",
        },
        {
          key: "beta-note",
          selector: "beta-note",
          title: "Beta Note",
          description: "Beta summary",
          relativePath: "notes/journal/beta-note.md",
        },
      ])
    } finally {
      listNotesSpy.mockRestore()
    }
  } finally {
    await harness.cleanup()
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
