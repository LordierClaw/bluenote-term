import { test } from "bun:test"
import assert from "node:assert/strict"

import { createManagedRootHarness } from "../helpers/cli"
import {
  createTuiRuntime,
  dispatchTuiKey,
  renderTuiRuntime,
} from "../../src/tui/app"
import { loadNoteDetail } from "../../src/tui/data/note-detail-adapter"


test("tui keyflow covers note-navigation-note transitions, stale selection fallback, help, refresh, editor save/discard, and guarded quit", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-keyflow-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    const alphaCreate = harness.run(["new", "--title", "Alpha Note"])
    const betaCreate = harness.run(["new", "--title", "Beta Note"])
    assert.equal(alphaCreate.exitCode, 0)
    assert.equal(betaCreate.exitCode, 0)

    const alphaKeyMatch = alphaCreate.stdout.match(/Key: (alpha-note-[a-z0-9]{6})/u)
    const betaKeyMatch = betaCreate.stdout.match(/Key: (beta-note-[a-z0-9]{6})/u)
    assert.ok(alphaKeyMatch)
    assert.ok(betaKeyMatch)
    const alphaKey = alphaKeyMatch[1]
    const betaKey = betaKeyMatch[1]

    let runtime = createTuiRuntime({ override: harness.rootPath, env: {}, cwd: "/" })
    assert.equal(runtime.shellState.selectedNoteSelector, runtime.appState.noteBrowser.notes[0]?.selector ?? null)

    runtime = dispatchTuiKey(runtime, "?")
    assert.equal(runtime.shellState.helpVisible, true)
    assert.match(renderTuiRuntime(runtime).frame, /HELP/u)

    runtime = dispatchTuiKey(runtime, "ArrowDown")
    runtime = dispatchTuiKey(runtime, "Enter")
    assert.equal(runtime.shellState.selectedNoteSelector, betaKey)
    assert.equal(runtime.shellState.mode, "note")
    assert.equal(runtime.shellState.focusRegion, "main")

    runtime = dispatchTuiKey(runtime, "Escape")
    assert.equal(runtime.shellState.mode, "navigation")
    assert.equal(runtime.shellState.focusRegion, "sidebar")
    assert.equal(runtime.shellState.selectedNoteSelector, betaKey)

    runtime = dispatchTuiKey(runtime, "k")
    assert.equal(runtime.shellState.selectedNoteSelector, alphaKey)

    runtime = dispatchTuiKey(runtime, "Enter")
    assert.equal(runtime.shellState.mode, "note")
    assert.equal(runtime.shellState.focusRegion, "main")
    assert.equal(runtime.shellState.selectedNoteSelector, alphaKey)

    runtime = dispatchTuiKey(runtime, "Escape")
    runtime = dispatchTuiKey(runtime, "ArrowDown")
    assert.equal(runtime.shellState.mode, "navigation")
    assert.equal(runtime.shellState.selectedNoteSelector, betaKey)

    assert.equal(harness.run(["delete", betaKey, "--force"]).exitCode, 0)
    runtime = dispatchTuiKey(runtime, "Enter")
    assert.equal(runtime.shellState.mode, "note")
    runtime = dispatchTuiKey(runtime, "Escape")
    runtime = dispatchTuiKey(runtime, "r")
    assert.equal(runtime.shellState.selectedNoteSelector, betaKey)
    assert.equal(runtime.appState.noteBrowser.selectedNote?.selector, alphaKey)
    assert.equal(runtime.appState.noteBrowser.notes.some((note) => note.selector === betaKey), false)

    runtime = dispatchTuiKey(runtime, "Enter")
    assert.equal(runtime.shellState.mode, "note")
    assert.equal(runtime.shellState.selectedNoteSelector, betaKey)
    assert.equal(runtime.appState.noteBrowser.selectedNote?.selector, alphaKey)
    assert.match(renderTuiRuntime(runtime).regions.main, /Alpha Note/u)

    runtime = dispatchTuiKey(runtime, "Escape")
    assert.equal(runtime.shellState.mode, "navigation")
    assert.equal(runtime.shellState.focusRegion, "sidebar")
    assert.equal(runtime.shellState.selectedNoteSelector, betaKey)

    runtime = dispatchTuiKey(runtime, "Enter")
    runtime = dispatchTuiKey(runtime, "i")
    runtime = dispatchTuiKey(runtime, "!")
    assert.equal(runtime.shellState.mode, "editor")
    assert.equal(runtime.shellState.editorDirty, true)

    const blockedQuit = dispatchTuiKey(runtime, "q")
    assert.equal(blockedQuit.quitRequested, false)
    assert.match(blockedQuit.shellState.transientMessage?.text ?? "", /Unsaved changes/u)

    runtime = dispatchTuiKey(runtime, "Ctrl+D")
    assert.equal(runtime.shellState.editorDirty, false)
    assert.equal(runtime.editorSession?.buffer.lines.join("\n"), runtime.editorSession?.persistedBody)

    runtime = dispatchTuiKey(runtime, "q")
    assert.equal(runtime.quitRequested, true)

    runtime = createTuiRuntime({ override: harness.rootPath, env: {}, cwd: "/" })
    assert.equal(runtime.appState.noteBrowser.notes.some((note) => note.title === "Gamma Note"), false)

    const gammaCreate = harness.run(["new", "--title", "Gamma Note"])
    assert.equal(gammaCreate.exitCode, 0)

    assert.equal(runtime.appState.noteBrowser.notes.some((note) => note.title === "Gamma Note"), false)
    runtime = dispatchTuiKey(runtime, "r")
    assert.equal(runtime.appState.noteBrowser.notes.some((note) => note.title === "Gamma Note"), true)

    runtime = dispatchTuiKey(runtime, "ArrowDown")
    runtime = dispatchTuiKey(runtime, "Enter")
    runtime = dispatchTuiKey(runtime, "e")
    runtime = dispatchTuiKey(runtime, "!")
    runtime = dispatchTuiKey(runtime, "Ctrl+S")
    assert.equal(runtime.shellState.editorDirty, false)

    const savedSelector = runtime.shellState.selectedNoteSelector
    assert.ok(savedSelector)
    const savedNote = loadNoteDetail({ override: harness.rootPath, env: {}, cwd: "/", selector: savedSelector })
    assert.equal(savedNote.ok, true)

    if (!savedNote.ok) {
      throw new Error("expected saved note detail to load")
    }

    assert.match(savedNote.note.body, /^!/u)
  } finally {
    await harness.cleanup()
  }
})
