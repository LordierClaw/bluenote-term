import { test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { ensureManagedRoot } from "../../../src/storage/root-layout"
import { writeStateManifest } from "../../../src/storage/state-manifest"
import { getTuiBootstrapInfo } from "../../../src/tui/app"

test("getTuiBootstrapInfo no longer reports the scaffold-only status string", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-app-missing-"))

  try {
    const bootstrap = getTuiBootstrapInfo({ override: rootPath, env: {}, cwd: "/" })

    assert.notEqual(bootstrap.status, "scaffold-ready")
    assert.equal(bootstrap.status, "missing-root")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("getTuiBootstrapInfo includes the phase 3 tui shell marker in the app bootstrap object", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-app-ready-"))

  try {
    const managedRootPath = ensureManagedRoot(rootPath)
    writeStateManifest(managedRootPath)

    const bootstrap = getTuiBootstrapInfo({ override: rootPath, env: {}, cwd: "/" })

    assert.equal(bootstrap.appName, "BlueNote")
    assert.equal(bootstrap.status, "ready")
    assert.equal(bootstrap.rootPath, path.resolve(rootPath))
    assert.equal(bootstrap.nextPhase, "phase-3-tui-shell")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})
