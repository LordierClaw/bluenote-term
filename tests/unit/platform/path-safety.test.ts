import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

import {
  assertPathInsideRoot,
  toRootRelativePath,
} from "../../../src/platform/path-safety"

test("path safety helper rejects paths escaping the managed root", () => {
  const rootPath = path.resolve("/tmp/bluenote-root")
  const escapingPath = path.resolve(rootPath, "../outside.md")

  assert.throws(
    () => assertPathInsideRoot(rootPath, escapingPath),
    /outside the managed root/,
  )
})

test("path safety helper accepts paths inside the managed root", () => {
  const rootPath = path.resolve("/tmp/bluenote-root")
  const targetPath = path.resolve(rootPath, "notes/inbox/note.md")

  assert.equal(assertPathInsideRoot(rootPath, targetPath), targetPath)
  assert.equal(toRootRelativePath(rootPath, targetPath), path.join("notes", "inbox", "note.md"))
})
