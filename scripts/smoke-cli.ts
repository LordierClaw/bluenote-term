import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, readFile, rm, stat, access } from "node:fs/promises"

import { assertManagedRootLayout, runBinCli } from "../tests/helpers/cli"

const managedRoot = process.env.BLUENOTE_ROOT ?? (await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-cli-")))
const shouldCleanup = process.env.BLUENOTE_ROOT === undefined

try {
  const helpResult = runBinCli(["--help"], { rootPath: managedRoot })
  assert.equal(helpResult.exitCode, 0)
  assert.equal(helpResult.stderr, "")
  assert.match(helpResult.stdout, /BlueNote v/)
  assert.match(helpResult.stdout, /archive/)
  assert.match(helpResult.stdout, /tui\s+Launch the Phase 3 TUI workspace/)

  const initResult = runBinCli(["init"], { rootPath: managedRoot })
  assert.equal(initResult.exitCode, 0)
  assert.equal(initResult.stderr, "")
  assert.match(initResult.stdout, new RegExp(`Initialized BlueNote root: ${managedRoot.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`))

  await assertManagedRootLayout(managedRoot)

  const manifestPath = path.join(managedRoot, ".state", "manifest.json")
  const manifestStats = await stat(manifestPath)
  assert.equal(manifestStats.isFile(), true, ".state/manifest.json should exist after smoke init")
  await assert.rejects(() => access(path.join(managedRoot, ".bluenote")), { code: "ENOENT" })

  const newResult = runBinCli(["new", "--title", "Smoke Note"], { rootPath: managedRoot })
  assert.equal(newResult.exitCode, 0)
  assert.equal(newResult.stderr, "")
  assert.match(newResult.stdout, /^Created note\nKey: smoke-note-[a-z0-9]{6}\nPath: notes\/inbox\/smoke-note-[a-z0-9]{6}\.md\n$/)

  const createdPathMatch = newResult.stdout.match(/^Created note\nKey: (smoke-note-[a-z0-9]{6})\nPath: (notes\/inbox\/(smoke-note-[a-z0-9]{6})\.md)\n$/)
  assert.notEqual(createdPathMatch, null)
  assert.equal(createdPathMatch?.[1], createdPathMatch?.[3])
  assert.equal(await readFile(path.join(managedRoot, createdPathMatch?.[2] ?? ""), "utf8"), "")

  const listResult = runBinCli(["list"], { rootPath: managedRoot })
  assert.equal(listResult.exitCode, 0)
  assert.equal(listResult.stderr, "")
  assert.match(listResult.stdout, /^Smoke Note\tsmoke-note-[a-z0-9]{6}\t\tnotes\/inbox\/smoke-note-[a-z0-9]{6}\.md\n$/)

  const showResult = runBinCli(["show", createdPathMatch?.[1] ?? ""], { rootPath: managedRoot })
  assert.equal(showResult.exitCode, 0)
  assert.equal(showResult.stderr, "")
  assert.match(showResult.stdout, /^Title: Smoke Note\nKey: smoke-note-[a-z0-9]{6}\nPath: notes\/inbox\/smoke-note-[a-z0-9]{6}\.md\nDescription: \n\n$/)

  console.log("CLI smoke check passed.")
} finally {
  if (shouldCleanup) {
    await rm(managedRoot, { recursive: true, force: true })
  }
}
