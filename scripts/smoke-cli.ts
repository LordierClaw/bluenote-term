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
  assert.match(helpResult.stdout, /Usage: bluenote-term \[options\]/)
  assert.match(helpResult.stdout, /Launch the BlueNote terminal UI workspace/)
  assert.match(helpResult.stdout, /bluenote <command>/)
  assert.match(helpResult.stdout, /--check-daemon/)
  assert.match(helpResult.stdout, /--probe-tui-runtime/)
  assert.doesNotMatch(helpResult.stdout, /(^|\n)\s*(new|list|archive|delete|rebuild|ai)(\s|$)/m)

  for (const command of ["init", "new", "list", "show", "search", "edit", "archive", "delete", "rebuild", "ai"]) {
    const result = runBinCli([command], { rootPath: managedRoot })
    assert.equal(result.exitCode, 1)
    assert.equal(result.stdout, "")
    assert.equal(result.stderr, `Use bluenote ${command}; bluenote-term is TUI-only.\n`)
  }

  console.log("TUI-only CLI smoke check passed.")
} finally {
  if (shouldCleanup) {
    await rm(managedRoot, { recursive: true, force: true })
  }
}
