import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

import * as showNoteModule from "../../../src/core/show-note"
import { SelectorNotFoundError } from "../../../src/core/errors"
import { loadNoteDetail } from "../../../src/tui/data/note-detail-adapter"
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

test("detail adapter loads a selected note suitable for main-pane rendering using the core show service", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-note-detail-")

  try {
    const initResult = harness.run(["init"])
    assert.equal(initResult.exitCode, 0)

    await writeIndexedNote(harness.rootPath, {
      key: "detail-note",
      title: "Detail Note",
      description: "Detail summary",
      relativePath: path.join("notes", "inbox", "detail-note.md"),
      body: "Detail body.\nSecond line.\n",
    })

    const rebuildResult = harness.run(["rebuild"])
    assert.equal(rebuildResult.exitCode, 0)

    const showNoteSpy = spyOn(showNoteModule, "showNote")

    try {
      const result = loadNoteDetail({ selector: "detail-note", override: harness.rootPath, env: {}, cwd: "/" })

      assert.equal(result.ok, true)
      if (!result.ok) {
        throw new Error("expected note detail result to be ok")
      }

      assert.equal(showNoteSpy.mock.calls.length, 1)
      assert.deepEqual(showNoteSpy.mock.calls[0]?.[0], {
        selector: "detail-note",
        override: harness.rootPath,
        env: {},
        cwd: "/",
      })
      assert.deepEqual(result.note, {
        key: "detail-note",
        selector: "detail-note",
        title: "Detail Note",
        description: "Detail summary",
        relativePath: "notes/inbox/detail-note.md",
        body: "Detail body.\nSecond line.\n",
      })
    } finally {
      showNoteSpy.mockRestore()
    }
  } finally {
    await harness.cleanup()
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
