import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"

import { UsageError } from "../../../src/core/errors"
import { migrateLegacyAppStateToData } from "../../../src/storage/app-state-migration"

async function createTempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

test("migrateLegacyAppStateToData copies legacy manifest and note sidecars when data is absent", async () => {
  const rootPath = await createTempRoot("bluenote-app-state-migration-copy-")

  try {
    await mkdir(path.join(rootPath, ".state", "notes"), { recursive: true })
    await writeFile(path.join(rootPath, ".state", "manifest.json"), JSON.stringify({ schemaVersion: 2 }), "utf8")
    await writeFile(path.join(rootPath, ".state", "notes", "alpha.json"), JSON.stringify({ title: "Alpha" }), "utf8")
    await writeFile(path.join(rootPath, ".state", "notes", "beta.json"), JSON.stringify({ title: "Beta" }), "utf8")

    const result = migrateLegacyAppStateToData(rootPath)

    assert.equal(result.status, "migrated")
    assert.equal(result.migratedFileCount, 3)
    assert.equal(result.legacyStatePath, path.join(path.resolve(rootPath), ".state"))
    assert.equal(result.dataStatePath, path.join(path.resolve(rootPath), ".data"))
    assert.equal(await readFile(path.join(rootPath, ".data", "manifest.json"), "utf8"), JSON.stringify({ schemaVersion: 2 }))
    assert.equal(await readFile(path.join(rootPath, ".data", "notes", "alpha.json"), "utf8"), JSON.stringify({ title: "Alpha" }))
    assert.equal(await readFile(path.join(rootPath, ".data", "notes", "beta.json"), "utf8"), JSON.stringify({ title: "Beta" }))
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyAppStateToData leaves Markdown notes byte-for-byte untouched", async () => {
  const rootPath = await createTempRoot("bluenote-app-state-migration-markdown-")

  try {
    const notePath = path.join(rootPath, "notes", "inbox", "alpha.md")
    const markdown = "# Alpha\n\nPreserve me exactly.\n"
    await mkdir(path.dirname(notePath), { recursive: true })
    await mkdir(path.join(rootPath, ".state", "notes"), { recursive: true })
    await writeFile(notePath, markdown, "utf8")
    await writeFile(path.join(rootPath, ".state", "notes", "alpha.json"), JSON.stringify({ title: "Alpha" }), "utf8")

    const before = await readFile(notePath, "utf8")
    migrateLegacyAppStateToData(rootPath)
    const after = await readFile(notePath, "utf8")

    assert.equal(after, before)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyAppStateToData skips stale derived legacy artifacts", async () => {
  const rootPath = await createTempRoot("bluenote-app-state-migration-derived-")

  try {
    await mkdir(path.join(rootPath, ".state", "notes"), { recursive: true })
    await writeFile(path.join(rootPath, ".state", "manifest.json"), "{}", "utf8")
    await writeFile(path.join(rootPath, ".state", "metadata.sqlite"), "sqlite", "utf8")
    await writeFile(path.join(rootPath, ".state", "search-index.json"), "{}", "utf8")

    migrateLegacyAppStateToData(rootPath)

    assert.equal(await exists(path.join(rootPath, ".data", "manifest.json")), true)
    assert.equal(await exists(path.join(rootPath, ".data", "metadata.sqlite")), false)
    assert.equal(await exists(path.join(rootPath, ".data", "search-index.json")), false)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyAppStateToData is idempotent when run twice", async () => {
  const rootPath = await createTempRoot("bluenote-app-state-migration-idempotent-")

  try {
    await mkdir(path.join(rootPath, ".state", "notes"), { recursive: true })
    await writeFile(path.join(rootPath, ".state", "manifest.json"), "{}", "utf8")
    await writeFile(path.join(rootPath, ".state", "notes", "alpha.json"), "{\"ok\":true}", "utf8")

    const first = migrateLegacyAppStateToData(rootPath)
    const second = migrateLegacyAppStateToData(rootPath)

    assert.equal(first.status, "migrated")
    assert.equal(first.migratedFileCount, 2)
    assert.equal(second.status, "noop")
    assert.equal(second.migratedFileCount, 0)
    assert.equal(await readFile(path.join(rootPath, ".data", "notes", "alpha.json"), "utf8"), "{\"ok\":true}")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyAppStateToData allows data plus empty or stale legacy state with no conflict", async () => {
  const rootPath = await createTempRoot("bluenote-app-state-migration-stale-")

  try {
    await mkdir(path.join(rootPath, ".data", "notes"), { recursive: true })
    await mkdir(path.join(rootPath, ".state"), { recursive: true })
    await writeFile(path.join(rootPath, ".state", "metadata.sqlite"), "sqlite", "utf8")
    await writeFile(path.join(rootPath, ".state", "search-index.json"), "{}", "utf8")

    const result = migrateLegacyAppStateToData(rootPath)

    assert.equal(result.status, "noop")
    assert.equal(result.migratedFileCount, 0)
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("migrateLegacyAppStateToData throws UsageError for conflicting app state files", async () => {
  const rootPath = await createTempRoot("bluenote-app-state-migration-conflict-")

  try {
    await mkdir(path.join(rootPath, ".data", "notes"), { recursive: true })
    await mkdir(path.join(rootPath, ".state", "notes"), { recursive: true })
    await writeFile(path.join(rootPath, ".data", "notes", "foo.json"), "{\"title\":\"Data\"}", "utf8")
    await writeFile(path.join(rootPath, ".state", "notes", "foo.json"), "{\"title\":\"State\"}", "utf8")

    assert.throws(
      () => migrateLegacyAppStateToData(rootPath),
      (error) => {
        assert.ok(error instanceof UsageError)
        assert.equal(error.message, "Cannot migrate legacy .state because .data already contains conflicting app state.")
        assert.equal(
          error.hint,
          "Review .state and .data, keep the desired BlueNote metadata under .data, then retry.",
        )
        return true
      },
    )
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
