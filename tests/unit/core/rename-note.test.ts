import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"

import { UsageError } from "../../../src/core/errors"
import { renameNote } from "../../../src/core/rename-note"

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

test("renameNote renames the key, file, and sidecar and reports the previous and new key", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-rename-note-"))
  const relativePath = path.join("notes", "inbox", "original-note.md")

  try {
    await writePlainNoteWithSidecar(rootPath, {
      key: "original-note",
      title: "Original Title",
      description: "Original Title Body before rename.",
      relativePath,
      body: "# Original Title\n\nBody before rename.\n",
    })

    const summary = renameNote({
      override: rootPath,
      selector: "original-note",
      title: "Renamed Title",
      body: "# Renamed Title\n\nBody after rename.\n",
      updatedAt: "2026-05-21T12:45:00.000Z",
      randomSource: () => 10,
    })

    assert.equal(summary.previousKey, "original-note")
    assert.equal(summary.key, "renamed-title-00000a")
    assert.equal(summary.previousRelativePath, relativePath)
    assert.equal(summary.relativePath, path.join("notes", "inbox", "renamed-title-00000a.md"))

    await assert.rejects(() => access(path.join(rootPath, relativePath)))
    await assert.rejects(() => access(path.join(rootPath, ".data", "notes", "original-note.json")))

    const sidecar = JSON.parse(
      await readFile(path.join(rootPath, ".data", "notes", "renamed-title-00000a.json"), "utf8"),
    ) as {
      description: string
      key: string
      relativePath: string
      title: string
      updatedAt: string
    }

    assert.equal(sidecar.key, "renamed-title-00000a")
    assert.equal(sidecar.title, "Renamed Title")
    assert.equal(sidecar.relativePath, path.join("notes", "inbox", "renamed-title-00000a.md"))
    assert.equal(sidecar.description, "# Renamed Title Body after rename.")
    assert.equal(sidecar.updatedAt, "2026-05-21T12:45:00.000Z")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("renameNote fails cleanly when the generated target key collides", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-rename-note-collision-"))

  try {
    await writePlainNoteWithSidecar(rootPath, {
      key: "original-note",
      title: "Original Title",
      description: "Original Title Body before rename.",
      relativePath: path.join("notes", "inbox", "original-note.md"),
      body: "# Original Title\n\nBody before rename.\n",
    })
    await writePlainNoteWithSidecar(rootPath, {
      key: "renamed-title-00000a",
      title: "Occupied Title",
      description: "Occupied body.",
      relativePath: path.join("notes", "journal", "renamed-title-00000a.md"),
      body: "Occupied body.\n",
    })

    assert.throws(
      () =>
        renameNote({
          override: rootPath,
          selector: "original-note",
          title: "Renamed Title",
          body: "# Renamed Title\n\nBody after rename.\n",
          updatedAt: "2026-05-21T12:45:00.000Z",
          randomSource: () => 10,
        }),
      (error) => {
        assert.ok(error instanceof UsageError)
        assert.match(error.message, /Could not rename note 'notes[\\/]inbox[\\/]original-note\.md'\./)
        assert.match(error.hint ?? "", /generated key already exists/i)
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("renameNote leaves a recovery artifact behind when rename staging fails", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-rename-note-recovery-"))

  try {
    await writePlainNoteWithSidecar(rootPath, {
      key: "original-note",
      title: "Original Title",
      description: "Original Title Body before rename.",
      relativePath: path.join("notes", "inbox", "original-note.md"),
      body: "# Original Title\n\nBody before rename.\n",
    })

    assert.throws(
      () =>
        renameNote({
          override: rootPath,
          selector: "original-note",
          title: "Renamed Title",
          body: "# Renamed Title\n\nBody after rename.\n",
          updatedAt: "2026-05-21T12:45:00.000Z",
          randomSource: () => 10,
          hooks: {
            onRecoveryArtifactStaged: () => {
              throw new Error("boom during staging")
            },
          },
        }),
      (error) => {
        assert.ok(error instanceof UsageError)
        assert.match(error.message, /Could not rename note 'notes[\\/]inbox[\\/]original-note\.md'\./)
        return true
      },
    )

    const recoveryPath = path.join(rootPath, ".data", "recovery")
    let entries: string[] = []

    try {
      entries = (await readdir(recoveryPath)).filter((entry) => entry.endsWith(".json")).sort()
    } catch {
      entries = []
    }

    assert.equal(entries.length, 1)

    const recoveryArtifact = JSON.parse(await readFile(path.join(recoveryPath, entries[0]), "utf8")) as {
      nextKey: string
      previousKey: string
    }

    assert.equal(recoveryArtifact.previousKey, "original-note")
    assert.equal(recoveryArtifact.nextKey, "renamed-title-00000a")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
