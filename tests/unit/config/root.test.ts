import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

import { UsageError } from "../../../src/core/errors"
import { resolveBlueNoteRoot } from "../../../src/config/root"

test("default root resolves to ~/.bluenote when no override is provided", () => {
  const resolvedRoot = resolveBlueNoteRoot({
    env: {},
    homeDir: "/tmp/test-home",
    cwd: "/tmp/working-directory",
  })

  assert.equal(resolvedRoot, path.resolve("/tmp/test-home", ".bluenote"))
})

test("BLUENOTE_ROOT environment override is honored", () => {
  const resolvedRoot = resolveBlueNoteRoot({
    env: { BLUENOTE_ROOT: "/var/tmp/custom-root" },
    homeDir: "/tmp/test-home",
    cwd: "/tmp/working-directory",
  })

  assert.equal(resolvedRoot, path.resolve("/var/tmp/custom-root"))
})

test("relative override paths resolve to absolute paths", () => {
  const resolvedRoot = resolveBlueNoteRoot({
    override: "./relative-root",
    env: {},
    homeDir: "/tmp/test-home",
    cwd: "/tmp/working-directory",
  })

  assert.equal(resolvedRoot, path.resolve("/tmp/working-directory", "relative-root"))
})

test("empty explicit override is rejected instead of silently resolving to cwd", () => {
  assert.throws(
    () => resolveBlueNoteRoot({
      override: "",
      env: {},
      homeDir: "/tmp/test-home",
      cwd: "/tmp/working-directory",
    }),
    (error: unknown) => {
      assert.ok(error instanceof UsageError)
      assert.match(error.message, /must not be empty/)
      return true
    },
  )
})

test("empty BLUENOTE_ROOT environment override is rejected instead of silently resolving to cwd", () => {
  assert.throws(
    () => resolveBlueNoteRoot({
      env: { BLUENOTE_ROOT: "" },
      homeDir: "/tmp/test-home",
      cwd: "/tmp/working-directory",
    }),
    (error: unknown) => {
      assert.ok(error instanceof UsageError)
      assert.match(error.message, /must not be empty/)
      return true
    },
  )
})
