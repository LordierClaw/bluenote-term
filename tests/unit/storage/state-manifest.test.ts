import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readFile, rm } from "node:fs/promises"

import { STORAGE_SCHEMA_VERSION } from "../../../src/config/root"
import {
  createDefaultStateManifest,
  readStateManifest,
  writeStateManifest,
} from "../../../src/storage/state-manifest"

test("createDefaultStateManifest returns the current storage schema version", () => {
  assert.deepEqual(createDefaultStateManifest(), {
    schemaVersion: STORAGE_SCHEMA_VERSION,
  })
})

test("writeStateManifest stores manifest.json under .state and readStateManifest loads it", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-state-manifest-"))

  try {
    const manifestPath = await writeStateManifest(rootPath)
    assert.equal(manifestPath, path.join(rootPath, ".state", "manifest.json"))

    const manifestJson = await readFile(manifestPath, "utf8")
    assert.deepEqual(JSON.parse(manifestJson), {
      schemaVersion: STORAGE_SCHEMA_VERSION,
    })

    assert.deepEqual(await readStateManifest(rootPath), {
      schemaVersion: STORAGE_SCHEMA_VERSION,
    })
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
