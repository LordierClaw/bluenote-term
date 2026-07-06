import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { writeFileSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"

import {
  createBlueNoteCore,
  createDirtyRecordRepository,
  initRoot,
  createNote,
  createSidecarRepository,
  readStateManifest,
} from "@lordierclaw/bluenote-core"
import { editNote } from "../../../packages/term/src/core/edit-note"

function fixedClock(iso: string) {
  return { now: () => new Date(iso) }
}

describe("editNote", () => {
  test("marks body-only terminal CLI edits dirty for sync clients", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-term-edit-sync-dirty-"))

    try {
      initRoot({ override: rootPath })
      const created = createNote({
        override: rootPath,
        type: "normal",
        destinationFolder: "note",
        title: "Terminal CLI Sync Edit",
        body: "Original terminal CLI body",
        clock: fixedClock("2026-05-26T10:00:00.000Z"),
      })
      createBlueNoteCore({ rootPath }).sync.link({
        mode: "seed-empty-server-from-local",
        serverUrl: "https://sync.example.test/api",
        workspaceId: "workspace-term-edit-test",
      })
      const noteId = createSidecarRepository(rootPath).read(created.key).noteId
      assert.ok(noteId)

      const editedBody = "Edited from terminal CLI sync path.\n"
      editNote({
        override: rootPath,
        selector: created.key,
        env: { ...process.env, EDITOR: "test-editor" },
        clock: fixedClock("2026-05-26T10:03:00.000Z"),
        launcher(command) {
          writeFileSync(command.at(-1) ?? "", editedBody, "utf8")
          return { exitCode: 0 }
        },
      })

      const manifest = readStateManifest(rootPath)
      assert.ok(manifest.workspaceId)
      const records = createDirtyRecordRepository(rootPath, { role: "client", workspaceId: manifest.workspaceId }).listDirtyRecords()
      const editedRecord = records.find((record) => record.entityType === "note" && record.entityId === noteId)
      assert.equal(editedRecord?.dirtyType, "upsert")
      assert.equal(editedRecord?.markedAt, "2026-05-26T10:03:00.000Z")
      assert.equal(editedRecord?.metadata?.key, created.key)
      assert.equal(editedRecord?.metadata?.description, "Edited from terminal CLI sync path.")
    } finally {
      await rm(rootPath, { recursive: true, force: true })
    }
  })
})
