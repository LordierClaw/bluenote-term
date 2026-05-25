import { test } from "bun:test"
import assert from "node:assert/strict"

import { createInitialShellState } from "../../src/tui/shell/shell-state"
import { renderTuiApp } from "../../src/tui/app"
import { createManagedRootHarness } from "../helpers/cli"

test("renderTuiApp includes a helpful init instruction when the managed root is missing", () => {
  const rendered = renderTuiApp({ override: "/tmp/bluenote-render-missing-root", env: {}, cwd: "/" })

  assert.equal(rendered.bootstrap.status, "missing-root")
  assert.match(rendered.frame, /Run 'bn init' first\./u)
})

test("renderTuiApp includes sidebar, main note pane, and status bar regions for ready roots", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-render-ready-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    assert.equal(harness.run(["new", "--title", "Alpha Note"]).exitCode, 0)

    const rendered = renderTuiApp({ override: harness.rootPath, env: {}, cwd: "/" })

    assert.equal(rendered.bootstrap.status, "ready")
    assert.match(rendered.frame, /SIDEBAR/u)
    assert.match(rendered.frame, /MAIN/u)
    assert.match(rendered.frame, /STATUS/u)
    assert.match(rendered.regions.sidebar, /Alpha Note/u)
    assert.match(rendered.regions.main, /Alpha Note/u)
    assert.match(rendered.regions.statusBar, /MODE: navigation/u)
  } finally {
    await harness.cleanup()
  }
})

test("renderTuiApp shows the shell-selected note details in the main pane and status summary from shell state", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-render-selected-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    const alphaCreate = harness.run(["new", "--title", "Alpha Note"])
    const betaCreate = harness.run(["new", "--title", "Beta Note"])
    assert.equal(alphaCreate.exitCode, 0)
    assert.equal(betaCreate.exitCode, 0)

    const betaKeyMatch = betaCreate.stdout.match(/Key: (beta-note-[a-z0-9]{6})/u)
    assert.ok(betaKeyMatch)
    const betaKey = betaKeyMatch[1]

    const rendered = renderTuiApp(
      { override: harness.rootPath, env: {}, cwd: "/" },
      {
        ...createInitialShellState(),
        selectedNoteSelector: betaKey,
        focusRegion: "main",
        mode: "note",
        editorDirty: true,
        transientMessage: {
          level: "status",
          text: "Viewing Beta Note",
        },
      },
    )

    assert.match(rendered.regions.sidebar, new RegExp(`> Beta Note`, "u"))
    assert.match(rendered.regions.main, new RegExp(`notes\/.*${betaKey}\\.md`, "u"))
    assert.match(rendered.regions.main, /Beta Note/u)
    assert.doesNotMatch(rendered.regions.main, /Alpha Note/u)
    assert.match(rendered.regions.statusBar, /MODE: note/u)
    assert.match(rendered.regions.statusBar, /FOCUS: main/u)
    assert.match(rendered.regions.statusBar, /DIRTY: yes/u)
    assert.match(rendered.regions.statusBar, /Viewing Beta Note/u)
  } finally {
    await harness.cleanup()
  }
})

test("renderTuiApp falls back to the preloaded note when shell selection is stale", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-render-stale-selection-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)
    const alphaCreate = harness.run(["new", "--title", "Alpha Note"])
    assert.equal(alphaCreate.exitCode, 0)

    const rendered = renderTuiApp(
      { override: harness.rootPath, env: {}, cwd: "/" },
      {
        ...createInitialShellState(),
        selectedNoteSelector: "missing-note-abcdef",
        focusRegion: "main",
        mode: "note",
      },
    )

    assert.match(rendered.regions.sidebar, /Alpha Note/u)
    assert.match(rendered.regions.main, /Alpha Note/u)
    assert.doesNotMatch(rendered.regions.main, /No notes available\./u)
  } finally {
    await harness.cleanup()
  }
})

test("renderTuiApp renders a stable no-notes state for initialized but empty roots", async () => {
  const harness = await createManagedRootHarness("bluenote-tui-render-empty-")

  try {
    assert.equal(harness.run(["init"]).exitCode, 0)

    const rendered = renderTuiApp({ override: harness.rootPath, env: {}, cwd: "/" })

    assert.equal(rendered.bootstrap.status, "ready")
    assert.match(rendered.regions.sidebar, /No notes yet\./u)
    assert.match(rendered.regions.main, /No notes available\./u)
    assert.doesNotMatch(rendered.frame, /TypeError|ReferenceError/u)
  } finally {
    await harness.cleanup()
  }
})
