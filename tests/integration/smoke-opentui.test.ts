import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { createManagedRootHarness, runWorkspaceScript } from "../helpers/cli"

test("smoke-opentui script reports validated missing-root shell startup", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-opentui-missing-root-"))
  const missingRootPath = path.join(tempRoot, "missing-root")

  try {
    const result = runWorkspaceScript("scripts/smoke-opentui.ts", { rootPath: missingRootPath })

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /OpenTUI smoke check passed for BlueNote \(missing-root shell startup validated\)\./u)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test("smoke-opentui script reports validated ready shell startup", async () => {
  const harness = await createManagedRootHarness("bluenote-smoke-opentui-ready-")

  try {
    assert.equal(harness.runBin(["init"]).exitCode, 0)

    const result = harness.runScript("scripts/smoke-opentui.ts")

    assert.equal(result.exitCode, 0)
    assert.equal(result.stderr, "")
    assert.match(result.stdout, /OpenTUI smoke check passed for BlueNote \(ready shell startup validated\)\./u)
  } finally {
    await harness.cleanup()
  }
})
