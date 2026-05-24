import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises"

import { UsageError } from "../../../src/core/errors"
import {
  ensureManagedRoot,
  getArchiveNotePath,
  getInboxNotePath,
  getNotesPath,
  getStateNotesPath,
  MANAGED_ROOT_LAYOUT,
} from "../../../src/storage/root-layout"

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

    await assert.rejects(access(path.join(tempRoot, ".bluenote")))
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("root layout helpers expose note and sidecar paths for repository storage", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-root-layout-helpers-"))

  try {
    const resolvedRoot = ensureManagedRoot(tempRoot)

    assert.equal(getNotesPath(resolvedRoot), path.join(resolvedRoot, "notes"))
    assert.equal(getStateNotesPath(resolvedRoot), path.join(resolvedRoot, ".state", "notes"))
    assert.equal(getInboxNotePath(resolvedRoot, "note-123"), path.join(resolvedRoot, "notes", "inbox", "note-123.md"))
    assert.equal(getArchiveNotePath(resolvedRoot, "note-123"), path.join(resolvedRoot, "notes", "archive", "note-123.md"))
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("ensureManagedRoot wraps filesystem failures in a UsageError", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-root-layout-error-"))
  const blockedRoot = path.join(tempRoot, "blocked-root")

  try {
    await writeFile(blockedRoot, "not a directory")

    assert.throws(
      () => ensureManagedRoot(blockedRoot),
      (error) => {
        assert.ok(error instanceof UsageError)
        assert.match(error.message, /Could not initialize BlueNote root at/)
        assert.equal(error.hint, "Ensure BLUENOTE_ROOT points to a writable directory path.")

        return true
      },
    )
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
