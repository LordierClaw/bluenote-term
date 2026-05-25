import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"

import type { ParsedNote } from "../../../src/storage/note-schema"
import type { NoteSidecar } from "../../../src/storage/sidecar-schema"
import * as noteRepositoryModule from "../../../src/storage/note-repository"
import * as sidecarRepositoryModule from "../../../src/storage/sidecar-repository"
import { showNote } from "../../../src/core/show-note"

test("showNote reuses the selected parsed body when sidecar metadata exists", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-show-note-"))
  const sidecarPath = path.join(rootPath, ".state", "notes", "alpha-key.json")
  await mkdir(path.dirname(sidecarPath), { recursive: true })
  await writeFile(sidecarPath, "{}", "utf8")

  const selectedNote: ParsedNote = {
    body: "Alpha body.\nSecond line.\n",
    sourcePath: "notes/inbox/alpha-key.md",
    frontmatter: {
      id: "alpha-key",
      schemaVersion: 1,
      title: "Alpha Note",
      mode: "plain",
      tags: [],
      createdAt: "2026-05-25T00:00:00.000Z",
      updatedAt: "2026-05-25T00:00:00.000Z",
    },
  }
  const sidecar: NoteSidecar = {
    key: "alpha-key",
    title: "Alpha Note",
    description: "Alpha summary",
    relativePath: "notes/inbox/alpha-key.md",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    archivedAt: null,
    namingVersion: 1,
  }

  const repository = {
    list: () => [selectedNote],
    readRaw: () => {
      throw new Error("showNote should not read raw note contents when selectNote already returned the parsed body")
    },
  }
  const sidecars = {
    getSidecarPath: () => sidecarPath,
    read: () => sidecar,
  }

  const repositorySpy = spyOn(noteRepositoryModule, "createNoteRepository").mockReturnValue(repository as never)
  const sidecarSpy = spyOn(sidecarRepositoryModule, "createSidecarRepository").mockReturnValue(sidecars as never)

  try {
    const result = showNote({ selector: "alpha-key", override: rootPath, env: {}, cwd: "/" })

    assert.deepEqual(result, {
      key: "alpha-key",
      title: "Alpha Note",
      description: "Alpha summary",
      relativePath: "notes/inbox/alpha-key.md",
      body: "Alpha body.\nSecond line.\n",
    })
  } finally {
    repositorySpy.mockRestore()
    sidecarSpy.mockRestore()
    await rm(rootPath, { recursive: true, force: true })
  }
})
