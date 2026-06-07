import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { createCliRenderer } from "@opentui/core"

import { createNote } from "../src/core/create-note"
import { initRoot } from "../src/core/init-root"
import { createDefaultWorkspaceController, getTuiBootstrapInfo, routeWorkspaceKey, startTuiWorkspace } from "../src/tui/app"
import { createLatestOpenedNoteRepository } from "../src/tui/latest-opened-note"

const moduleRef = await import("@opentui/core")

if (typeof moduleRef.createCliRenderer !== "function") {
  throw new Error("@opentui/core did not expose createCliRenderer")
}

const info = getTuiBootstrapInfo()
if (info.status !== "tui-workspace-ready") {
  throw new Error(`Expected TUI workspace ready status, received ${info.status}`)
}

if (info.followUp !== "hardening-follow-up") {
  throw new Error(`Expected hardening follow-up metadata, received ${info.followUp}`)
}

const rootPath = await mkdtemp(path.join(os.tmpdir(), "bluenote-smoke-opentui-"))
try {
  initRoot({ override: rootPath })
  const note = createNote({
    override: rootPath,
    type: "draft",
    title: "Smoke OpenTUI Draft",
    body: "OpenTUI smoke body",
  })
  createLatestOpenedNoteRepository(rootPath).write({
    relativePath: note.relativePath,
    openedAt: new Date().toISOString(),
  })

  const controller = createDefaultWorkspaceController({ rootPath, cleanupStaleAtomicTemps: () => {} })
  const renderer = await createCliRenderer({ testing: true, consoleMode: "disabled", exitOnCtrlC: false })

  try {
    const running = await startTuiWorkspace({ renderer, controller })
    assert.equal(controller.getState().screen, "editor")
    assert.equal(controller.getState().editor?.note.relativePath, note.relativePath)
    assert.equal(renderer.isDestroyed, false)

    assert.deepEqual(routeWorkspaceKey("\u0003", controller, running.destroy), { handled: true, exit: true })
    assert.equal(renderer.isDestroyed, true)
  } finally {
    if (!renderer.isDestroyed) {
      renderer.destroy()
    }
  }
} finally {
  await rm(rootPath, { recursive: true, force: true })
}

console.log(`OpenTUI smoke check passed for ${info.appName} (${info.status}; follow-up: ${info.followUp}).`)
