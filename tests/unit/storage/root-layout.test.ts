import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, stat } from "node:fs/promises"

import { ensureManagedRoot, MANAGED_ROOT_LAYOUT } from "../../../src/storage/root-layout"

test("ensureManagedRoot creates the full managed root layout", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-root-layout-"))

  try {
    const resolvedRoot = await ensureManagedRoot(tempRoot)

    assert.equal(resolvedRoot, path.resolve(tempRoot))

    for (const relativePath of MANAGED_ROOT_LAYOUT) {
      const fullPath = path.join(tempRoot, relativePath)
      const stats = await stat(fullPath)
      assert.equal(stats.isDirectory(), true, `${relativePath} should be a directory`)
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
