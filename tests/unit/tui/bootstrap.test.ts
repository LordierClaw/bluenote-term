import { spyOn, test } from "bun:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

import { bootstrapTuiApp } from "../../../src/tui/bootstrap"
import { ensureManagedRoot } from "../../../src/storage/root-layout"
import * as stateManifest from "../../../src/storage/state-manifest"
import { writeStateManifest } from "../../../src/storage/state-manifest"

test("bootstrapTuiApp returns missing-root when no managed root is available", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-bootstrap-missing-"))

  try {
    const bootstrap = bootstrapTuiApp({ override: rootPath, env: {}, cwd: "/" })

    assert.equal(bootstrap.status, "missing-root")
    assert.equal(bootstrap.rootPath, path.resolve(rootPath))
    assert.equal(bootstrap.nextPhase, "phase-3-tui-shell")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("bootstrapTuiApp returns ready with the resolved managed root path", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-bootstrap-ready-"))

  try {
    const managedRootPath = ensureManagedRoot(rootPath)
    writeStateManifest(managedRootPath)

    const bootstrap = bootstrapTuiApp({ override: rootPath, env: {}, cwd: "/" })

    assert.equal(bootstrap.status, "ready")
    assert.equal(bootstrap.rootPath, path.resolve(rootPath))
    assert.equal(bootstrap.nextPhase, "phase-3-tui-shell")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("bootstrapTuiApp returns missing-root when only a state manifest exists without the managed root layout", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-bootstrap-manifest-only-"))

  try {
    writeStateManifest(rootPath)

    const bootstrap = bootstrapTuiApp({ override: rootPath, env: {}, cwd: "/" })

    assert.equal(bootstrap.status, "missing-root")
    assert.equal(bootstrap.rootPath, path.resolve(rootPath))
    assert.equal(bootstrap.nextPhase, "phase-3-tui-shell")
  } finally {
    await rm(rootPath, { recursive: true, force: true })
  }
})

test("bootstrapTuiApp rethrows unexpected manifest errors instead of masking them as missing-root", async () => {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-tui-bootstrap-error-"))
  const manifestSpy = spyOn(stateManifest, "readStateManifest").mockImplementation(() => {
    throw new Error("simulated unexpected manifest failure")
  })

  try {
    assert.throws(
      () => bootstrapTuiApp({ override: rootPath, env: {}, cwd: "/" }),
      /simulated unexpected manifest failure/u,
    )
  } finally {
    manifestSpy.mockRestore()
    await rm(rootPath, { recursive: true, force: true })
  }
})
