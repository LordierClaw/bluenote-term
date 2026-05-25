import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { runBinCli } from "../tests/helpers/cli"

const moduleRef = await import("@opentui/core")

if (typeof moduleRef.createCliRenderer !== "function") {
  throw new Error("@opentui/core did not expose createCliRenderer")
}

const providedRoot = process.env.BLUENOTE_ROOT
const managedRoot = providedRoot ?? (await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-opentui-")))
const shouldCleanup = providedRoot === undefined

try {
  if (providedRoot === undefined) {
    const initResult = runBinCli(["init"], { rootPath: managedRoot })
    assert.equal(initResult.exitCode, 0)
    assert.equal(initResult.stderr, "")
  }

  const result = runBinCli(["tui"], { rootPath: managedRoot })

  if (result.exitCode !== 0) {
    throw new Error(`bn tui failed during smoke check: ${result.stderr || `exit ${result.exitCode}`}`)
  }

  if (result.stderr.trim().length > 0) {
    throw new Error(`bn tui emitted unexpected stderr during smoke check: ${result.stderr}`)
  }

  const frame = result.stdout
  const renderedShellRegions = /=== SIDEBAR ===/u.test(frame) && /=== MAIN ===/u.test(frame) && /=== STATUS ===/u.test(frame)

  if (!renderedShellRegions) {
    throw new Error("bn tui did not render the expected shell regions during smoke check")
  }

  if (/BlueNote root missing/u.test(frame)) {
    if (!/Run 'bn init' first\./u.test(frame)) {
      throw new Error("missing-root shell startup did not include the init guidance")
    }

    console.log("OpenTUI smoke check passed for BlueNote (missing-root shell startup validated).")
  } else {
    if (!/MODE:/u.test(frame)) {
      throw new Error("ready shell startup did not render the expected status bar summary")
    }

    console.log("OpenTUI smoke check passed for BlueNote (ready shell startup validated).")
  }
} finally {
  if (shouldCleanup) {
    await rm(managedRoot, { recursive: true, force: true })
  }
}
