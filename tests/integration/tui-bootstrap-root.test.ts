import { test } from "bun:test"
import assert from "node:assert/strict"

import { getTuiAppState } from "../../src/tui/app"
import { createManagedRootHarness } from "../helpers/cli"

test("getTuiAppState returns a structured empty state when the managed root is missing", () => {
  const state = getTuiAppState({ override: "/tmp/bluenote-missing-root", env: {}, cwd: "/" })

  assert.equal(state.bootstrap.status, "missing-root")
  assert.deepEqual(state.noteBrowser, {
    status: "empty",
    notes: [],
    selectedNote: null,
    emptyState: {
      code: "ROOT_NOT_INITIALIZED",
      message: "BlueNote root is not initialized.",
      hint: "Run 'bn init' first.",
    },
  })
})

test("getTuiAppState preloads the first available note when the managed root is ready", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-bootstrap-root-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    assert.equal(harness.run(["new", "--title", "Alpha Note"]).exitCode, 0)
    assert.equal(harness.run(["new", "--title", "Beta Note"]).exitCode, 0)

    const state = getTuiAppState({ override: harness.rootPath, env: {}, cwd: "/" })

    assert.equal(state.bootstrap.status, "ready")
    assert.equal(state.noteBrowser.status, "ready")
    assert.equal(state.noteBrowser.notes.length >= 2, true)
    assert.notEqual(state.noteBrowser.selectedNote, null)

    if (state.noteBrowser.status !== "ready" || state.noteBrowser.selectedNote === null) {
      throw new Error("expected a ready note browser state with a selected note")
    }

    assert.equal(state.noteBrowser.selectedNote.selector, state.noteBrowser.notes[0]?.selector)
    assert.equal(state.noteBrowser.selectedNote.title, state.noteBrowser.notes[0]?.title)
    assert.equal(state.noteBrowser.selectedNote.relativePath, state.noteBrowser.notes[0]?.relativePath)
    assert.equal(typeof state.noteBrowser.selectedNote.body, "string")
  } finally {
    await harness.cleanup()
  }
})
