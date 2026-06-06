import { describe, test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { createAppConfigRepository } from "../../../src/storage/app-config-repository"
import { createLatestOpenedNoteRepository } from "../../../src/tui/latest-opened-note"
import { ensureManagedRoot } from "../../../src/storage/root-layout"

async function withManagedRoot(name: string, callback: (rootPath: string) => Promise<void> | void): Promise<void> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), name))
  try {
    await callback(ensureManagedRoot(tempRoot))
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
}

describe("latest-opened TUI state", () => {
  test("reads default latestOpenedNoteTtlDays of 7 when .data/config.json is absent", async () => {
    await withManagedRoot("bluenote-app-config-default-", (rootPath) => {
      const config = createAppConfigRepository(rootPath).read()

      assert.equal(config.latestOpenedNoteTtlDays, 7)
    })
  })

  test("writes and reads latest-opened state with relativePath and openedAt", async () => {
    await withManagedRoot("bluenote-latest-opened-state-", (rootPath) => {
      const repository = createLatestOpenedNoteRepository(rootPath)
      const state = {
        relativePath: "note/work/example.md",
        openedAt: "2026-06-06T00:00:00.000Z",
      }

      repository.write(state)

      assert.deepEqual(repository.read(), state)
    })
  })
})
