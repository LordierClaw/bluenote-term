import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, stat } from "node:fs/promises"

import { runCli } from "../tests/helpers/cli"

const managedRoot = process.env.BLUENOTE_ROOT ?? (await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-cli-")))
const shouldCleanup = process.env.BLUENOTE_ROOT === undefined

try {
  const helpResult = runCli(["--help"], { rootPath: managedRoot })
  assert.equal(helpResult.exitCode, 0)
  assert.equal(helpResult.stderr, "")
  assert.match(helpResult.stdout, /BlueNote v/)
  assert.match(helpResult.stdout, /archive/)

  const initResult = runCli(["init"], { rootPath: managedRoot })
  assert.equal(initResult.exitCode, 0)
  assert.equal(initResult.stderr, "")
  assert.match(initResult.stdout, new RegExp(`Initialized BlueNote root: ${managedRoot.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`))

  for (const relativePath of ["notes", ".bluenote"]) {
    const stats = await stat(path.join(managedRoot, relativePath))
    assert.equal(stats.isDirectory(), true, `${relativePath} should exist after smoke init`)
  }

  console.log("CLI smoke check passed.")
} finally {
  if (shouldCleanup) {
    await rm(managedRoot, { recursive: true, force: true })
  }
}
