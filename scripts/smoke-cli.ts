import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { runBinCli } from "../tests/helpers/cli"

const managedRoot = process.env.BLUENOTE_ROOT ?? (await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-cli-")))
const shouldCleanup = process.env.BLUENOTE_ROOT === undefined

try {
  const helpResult = runBinCli(["--help"], { rootPath: managedRoot })
  assert.equal(helpResult.exitCode, 0)
  assert.equal(helpResult.stderr, "")
  assert.match(helpResult.stdout, /BlueNote v0\.1\.0/)
  assert.match(helpResult.stdout, /bn <command> \[options\]/)
  assert.match(helpResult.stdout, /\n  init\s+Initialize the managed BlueNote root/)
  assert.match(helpResult.stdout, /\n  new\s+\[--title <title>\] \[--path note\/<folder>\] \[--clipboard\] <body>/)

  const initResult = runBinCli(["init"], { rootPath: managedRoot })
  assert.equal(initResult.exitCode, 0)
  assert.equal(initResult.stderr, "")
  assert.match(initResult.stdout, /Initialized BlueNote root:/)

  const newResult = runBinCli(["new", "Smoke CLI body"], { rootPath: managedRoot })
  assert.equal(newResult.exitCode, 0)
  assert.equal(newResult.stderr, "")
  assert.match(newResult.stdout, /^Created note\nKey: .+\nPath: draft\/.+\.md\n$/)

  console.log("Full CLI smoke check passed.")
} finally {
  if (shouldCleanup) {
    await rm(managedRoot, { recursive: true, force: true })
  }
}
